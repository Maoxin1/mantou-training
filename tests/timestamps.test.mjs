import test from 'node:test';
import assert from 'node:assert/strict';
import {fresh,clone,record,cancelValidation,resumeExercise} from '../dist/engine.mjs';
import {writeEntry,removeEntry,startTrial,startSession,exerciseEntryId,blankRows,trialSummary,changePlan} from '../dist/journal.mjs';
import {mergeStates,SyncStore} from '../dist/sync-core.mjs';
const old='2026-10-20T10:00:00Z',newer='2026-10-20T11:00:00Z';
const daily='daily:2026-10-20';
function feedback(s,text,at){writeEntry(s,daily,'daily',{date:'2026-10-20',notes:text});s.journal.entries[daily].updated=at;s.journal.entries[daily].fieldUpdated.notes=at;}
function checkBoth(base,a,b,check){for(const [l,r] of [[a,b],[b,a]]){const m=mergeStates(base,l,r);assert.equal(m.conflicts.length,0);check(m.merged);}}
test('newest feedback wins in both directions even when older edit differs from base',()=>{
  const base=fresh();feedback(base,'new',newer);const stale=clone(base);feedback(stale,'offline old',old);
  checkBoth(base,stale,base,s=>assert.equal(s.journal.entries[daily].fields.notes,'new'));
  checkBoth(null,stale,base,s=>assert.equal(s.journal.entries[daily].fields.notes,'new'));
});
test('unrelated newer save cannot make an old field overwrite its newer feedback',()=>{
  const base=fresh();feedback(base,'initial',old);const l=clone(base),r=clone(base);feedback(l,'latest notes',newer);
  writeEntry(r,daily,'daily',{energy:'good'});r.journal.entries[daily].updated='2026-10-21T12:00:00Z';r.journal.entries[daily].fieldUpdated.energy=r.journal.entries[daily].updated;
  checkBoth(base,l,r,s=>{assert.equal(s.journal.entries[daily].fields.notes,'latest notes');assert.equal(s.journal.entries[daily].fields.energy,'good');});
});
test('latest deletion wins; a later edit restores the entry',()=>{
  const base=fresh();feedback(base,'initial',old);const l=clone(base),r=clone(base);removeEntry(l,daily);l.journal.entries[daily].updated=newer;
  checkBoth(base,l,r,s=>assert(s.journal.entries[daily].deleted));
  feedback(r,'restored','2026-10-21T12:00:00Z');checkBoth(base,l,r,s=>{assert(!s.journal.entries[daily].deleted);assert.equal(s.journal.entries[daily].fields.notes,'restored');});
});
test('same-session feedback updates completion totals and whole row data from latest edit',()=>{
  const base=fresh();startTrial(base,{start:'2026-10-12'});const session=startSession(base,{date:'2026-10-20'}),key=exerciseEntryId(session,'push');
  const l=clone(base),r=clone(base);for(const [s,at,reps,status] of [[l,old,6,'partial'],[r,newer,10,'complete']]){
    writeEntry(s,session,'session',{status});s.journal.entries[session].updated=at;s.journal.entries[session].fieldUpdated.status=at;
    const rows=blankRows(s.journal.entries[session].fields.plan[0]);rows[0].reps=reps;
    writeEntry(s,key,'exercise',{sessionId:session,exerciseId:'push',rows});s.journal.entries[key].updated=at;s.journal.entries[key].fieldUpdated.rows=at;
  }
  checkBoth(base,l,r,s=>{assert.equal(trialSummary(s,undefined,'2026-10-25').complete,1);assert.equal(s.journal.entries[key].fields.rows[0].reps,10);});
});
test('latest plan adjustment wins while retaining both histories',()=>{
  const base=fresh();const id=startTrial(base,{start:'2026-10-12'}),l=clone(base),r=clone(base);
  for(const [s,at,sets] of [[l,old,3],[r,newer,4]]){const p=clone(s.journal.trials[id].plan);p[0].sets=sets;changePlan(s,p,'adjust');s.journal.trials[id].changes[0].at=at;}
  checkBoth(base,l,r,s=>{assert.equal(s.journal.trials[id].plan[0].sets,4);assert.equal(s.journal.trials[id].changes.length,2);});
});
const input=(date,values=[6,6,6])=>({date,values,rir:'2',quality:'normal',comparable:'yes',temporary:false});
test('later cancellation survives an earlier offline record in either sync order', t=>{
  t.mock.timers.enable({apis:['Date'],now:new Date(old)});
  const base=fresh();base.exercises.push.validation={streak:0,lastDate:null};
  const recorded=clone(base),cancelled=clone(base);
  record(recorded,'push',input('2026-10-20'));
  t.mock.timers.setTime(new Date(newer).getTime());
  cancelValidation(cancelled,'push');
  checkBoth(base,recorded,cancelled,s=>{
    assert.equal(s.exercises.push.validation,null);
    assert.equal(s.exercises.push.records.length,1);
  });
});
test('later resume survives an earlier offline record in either sync order', t=>{
  t.mock.timers.enable({apis:['Date'],now:new Date(old)});
  const base=fresh();base.exercises.push.blocked=true;
  const recorded=clone(base),resumed=clone(base);
  record(recorded,'push',input('2026-10-20'));
  t.mock.timers.setTime(new Date(newer).getTime());
  resumeExercise(resumed,'push');
  checkBoth(base,recorded,resumed,s=>{
    assert.equal(s.exercises.push.blocked,false);
    assert.equal(s.exercises.push.validation,null);
    assert.equal(s.exercises.push.records.length,1);
  });
  assert.equal(resumed.events.at(-1).at,resumed.exercises.push.updated);
});
for(const operation of ['cancel','resume'])test(`two offline devices preserve a later ${operation} after delayed upload`,async t=>{
  t.mock.timers.enable({apis:['Date'],now:new Date(old)});
  const initial=fresh();
  if(operation==='cancel')initial.exercises.push.validation={streak:0,lastDate:null};
  else initial.exercises.push.blocked=true;
  const storage=()=>{const map=new Map();return {getItem:k=>map.get(k)||null,setItem:(k,v)=>map.set(k,v)};};
  const make=()=>new SyncStore({storage:storage(),key:'test-account',initial:clone(initial)});
  let state=null,revision=0;
  const transport=async(method,body)=>method==='GET'?{state:clone(state),revision}:body.revision!==revision?{conflict:true}:(state=clone(body.state),{revision:++revision});
  const a=make(),b=make();
  assert.equal(await a.sync(transport),'synced');
  assert.equal(await b.sync(transport),'synced');
  const earlier=clone(a.data.local);record(earlier,'push',input('2026-10-20'));a.edit(earlier);
  await assert.rejects(a.sync(async()=>{throw Error('offline')}));
  t.mock.timers.setTime(new Date(newer).getTime());
  const later=clone(b.data.local);
  if(operation==='cancel')cancelValidation(later,'push');else resumeExercise(later,'push');
  b.edit(later);
  assert.equal(await b.sync(transport),'synced');
  assert.equal(await a.sync(transport),'synced');
  assert.equal(await b.sync(transport),'synced');
  for(const device of [a,b]){
    assert.equal(device.data.local.exercises.push.validation,null);
    assert.equal(device.data.local.exercises.push.blocked,false);
    assert.equal(device.data.local.exercises.push.records.length,1);
    assert.equal(device.data.pending,false);
  }
});
test('legacy same-day facts use logged timestamp and latest progress snapshot survives',()=>{
  const base=fresh(),l=clone(base),r=clone(base);record(l,'push',input('2026-10-20'));record(r,'push',input('2026-10-20',[8,8,8]));
  l.exercises.push.records[0].logged=old;l.exercises.push.updated=old;r.exercises.push.records[0].logged=newer;r.exercises.push.updated=newer;r.exercises.push.target=[7,7,7];
  record(l,'push',input('2026-10-21'));l.exercises.push.records[1].logged=old;l.exercises.push.updated=old;
  checkBoth(base,l,r,s=>{assert.equal(s.exercises.push.records.length,2);assert.deepEqual(s.exercises.push.records[0].values,[8,8,8]);assert.deepEqual(s.exercises.push.target,[7,7,7]);});
});
test('offline reload, late upload, old import and repeated login sync preserve newest feedback',async()=>{
  const disk=new Map(),storage={getItem:k=>disk.get(k)||null,setItem:(k,v)=>disk.set(k,v)},make=k=>new SyncStore({storage,key:k,initial:fresh()});
  let state=null,revision=0;const transport=async(m,b)=>m==='GET'?{state:clone(state),revision}:b.revision!==revision?{conflict:true}:(state=clone(b.state),{revision:++revision});
  const a=make('a'),b=make('b');await a.sync(transport);await b.sync(transport);
  let s=clone(a.data.local);feedback(s,'offline old',old);a.edit(s);await assert.rejects(a.sync(async()=>{throw Error('offline')}));const backup=clone(s);
  s=clone(b.data.local);feedback(s,'new online',newer);b.edit(s);await b.sync(transport);
  const reload=make('a');await reload.sync(transport);reload.import(backup);await reload.sync(transport);
  for(const device of [b,reload,make('new-device')]){assert.equal(await device.sync(transport),'synced');assert.equal(device.data.local.journal.entries[daily].fields.notes,'new online');}
});
test('equal or invalid timestamps keep explicit conflict fallback',()=>{
  for(const at of [old,'invalid']){const base=fresh(),l=clone(base),r=clone(base);feedback(l,'left',at);feedback(r,'right',at);assert(mergeStates(base,l,r).conflicts.length);}
});
test('timezone offsets compare actual instants rather than timestamp strings',()=>{
  const base=fresh(),l=clone(base),r=clone(base);feedback(l,'new','2026-10-20T09:00:00-05:00');feedback(r,'old','2026-10-20T13:00:00Z');checkBoth(base,l,r,s=>assert.equal(s.journal.entries[daily].fields.notes,'new'));
});
