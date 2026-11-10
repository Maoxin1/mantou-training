import test from 'node:test';
import assert from 'node:assert/strict';
import {fresh, clone, validateBackup} from '../dist/engine.mjs';
import {startTrial, startSession, entry, activeTrial, changePlan, writeEntry, blankRows, exerciseEntryId, trialSummary, trialMarkdown, validateJournal, plannedDates} from '../dist/journal.mjs';
import {mergeStates, SyncStore} from '../dist/sync-core.mjs';

const routine='strength3-v1';
const setup=()=>{const s=fresh();startTrial(s,{start:'2026-10-26',routine});return s;};
const ids={A:['dbrow','push','split','lateral','deadbug'],B:['dbrow','push','rdl','lateral','rear'],C:['dbrow','push','split','rdl','deadbug']};

test('T04-M01: starting the accepted ongoing phase preserves the completed trial and its snapshots',()=>{
  const s=fresh(),old=startTrial(s,{start:'2026-10-12'}),se=startSession(s,{date:'2026-10-13'});
  writeEntry(s,'daily:2026-10-13','daily',{date:'2026-10-13',lunch:'保留餐食记录'});
  const before=clone(s.journal),id=startTrial(s,{start:'2026-10-26',routine});
  assert.equal(activeTrial(s).end,null,'the new phase must not start another 14-day trial');
  assert.equal(activeTrial(s).routine,routine);
  assert.equal(s.journal.version,2);
  assert.deepEqual(s.journal.trials[old],before.trials[old]);
  assert.deepEqual(entry(s,se),before.entries[se]);
  assert.deepEqual(s.journal.entries,before.entries);
  assert.equal(startTrial(s,{start:'2026-10-26',routine}),id,'repeated activation is idempotent');
  assert.equal(Object.keys(s.journal.trials).length,2);
  assert.deepEqual(validateBackup(s),s);
});

test('T04-M02: A/B/C each snapshot exactly the accepted five exercises; fixed targets remain unchanged',()=>{
  const s=setup();
  for(const workout of ['A','B','C']){
    const id=startSession(s,{date:'2026-10-26',workout}),f=entry(s,id).fields;
    assert.equal(f.workout,workout);
    assert.deepEqual(f.plan.map(e=>e.id),ids[workout]);
    assert(f.plan.every(e=>e.sets===2));
    assert.equal(f.plan.find(e=>e.id==='push').min,6);
  }
  const first=clone(entry(s,Object.keys(s.journal.entries)[0]));
  const p=clone(activeTrial(s).plan);p.find(e=>e.id==='push').min=7;changePlan(s,p,'核对余力后确认');
  assert.deepEqual(entry(s,first.id),first);
  const id=startSession(s,{date:'2026-10-28',workout:'B'});
  assert.equal(entry(s,id).fields.plan.find(e=>e.id==='push').min,7);
});

test('T04-M03: invalid workout and pre-phase date are rejected without partial mutations',()=>{
  const s=setup(),before=clone(s);
  assert.throws(()=>startSession(s,{date:'2026-10-26',workout:'D'}));
  assert.deepEqual(s,before);
  assert.throws(()=>startSession(s,{date:'2026-10-25',workout:'A'}));
  assert.deepEqual(s,before);
  const bad=clone(s.journal);bad.trials[activeTrial(s).id].plan[0].id='row';
  assert.throws(()=>validateJournal(bad));
  assert.throws(()=>startTrial(s,{start:'2026-10-26',routine:'unknown'}));
  assert.deepEqual(s,before);
});

test('T04-M04: each-side rows, new exercises, backup, and offline two-device sync preserve actual observations',async()=>{
  const s=setup(),id=startSession(s,{date:'2026-10-26',workout:'A'}),p=entry(s,id).fields.plan[0];
  assert.equal(p.sides,true);
  const rows=blankRows(p);rows[0]={...rows[0],left:10,right:9,load:'每只5kg',rir:'4',quality:'normal'};
  writeEntry(s,exerciseEntryId(id,'dbrow'),'exercise',{sessionId:id,exerciseId:'dbrow',rows});
  assert.deepEqual(validateBackup(s),s);
  const map=new Map(),storage={getItem:k=>map.get(k)??null,setItem:(k,v)=>map.set(k,v)};
  const a=new SyncStore({storage,key:'a',initial:fresh()});a.edit(s);
  await assert.rejects(a.sync(async()=>{throw Error('offline')}));
  const reload=new SyncStore({storage,key:'a',initial:fresh()});let remote=null,revision=0;
  const transport=async(method,body)=>method==='GET'?{state:clone(remote),revision}:(remote=clone(body.state),{revision:++revision});
  await reload.sync(transport);const b=new SyncStore({storage,key:'b',initial:fresh()});await b.sync(transport);
  assert.equal(b.data.local.journal.version,2);
  assert.deepEqual(entry(b.data.local,exerciseEntryId(id,'dbrow')).fields.rows,rows);
});

test('T04-M05: ongoing review selects the calendar week, survives day 14, and keeps historical trial exports',()=>{
  const s=setup(),id=activeTrial(s).id;
  for(const date of ['2026-10-26','2026-11-02','2026-11-09']){
    const se=startSession(s,{date,workout:'A'}),p=entry(s,se).fields.plan[1],rows=blankRows(p);rows[0].reps=8;
    writeEntry(s,exerciseEntryId(se,'push'),'exercise',{sessionId:se,exerciseId:'push',rows});
    writeEntry(s,'daily:'+date,'daily',{date,lunch:'午餐 '+date});
  }
  const q=trialSummary(s,id,'2026-11-10');
  assert.equal(q.from,'2026-11-09');assert.equal(q.to,'2026-11-10');
  assert.equal(q.actual.length,1);assert.equal(q.totalDays,2);
  assert.deepEqual(plannedDates(activeTrial(s),'2026-11-10'),['2026-11-09','2026-11-11','2026-11-13']);
  const md=trialMarkdown(s,id,'2026-11-10');
  assert.match(md,/三日力量训练周复盘/);assert.match(md,/午餐 2026-11-09/);
  assert.doesNotMatch(md,/午餐 2026-11-02/);assert.doesNotMatch(md,/实际训练少于4场/);
  assert.equal(trialSummary(s,id,'2026-11-08').actual.length,1);
  const old=startTrial(s,{start:'2026-10-12'});assert.match(trialMarkdown(s,old,'2026-10-25'),/两周试行复盘/);
});

test('T04-M06: a second device on the old phase cannot silently downgrade the new journal or erase records',()=>{
  const base=fresh();startTrial(base,{start:'2026-10-12'});const l=clone(base),r=clone(base);
  const id=startTrial(l,{start:'2026-10-26',routine});
  writeEntry(r,'daily:2026-10-25','daily',{date:'2026-10-25',dinner:'离线补记'});
  const {merged,conflicts}=mergeStates(base,l,r);
  assert.equal(conflicts.length,0);assert.equal(merged.journal.version,2);
  assert.equal(activeTrial(merged).id,id);
  assert.equal(entry(merged,'daily:2026-10-25').fields.dinner,'离线补记');
});

test('T04-M10: adopting the phase preserves a legacy-valid orphan log without relaxing new workout membership',()=>{
  const s=fresh();startTrial(s,{start:'2026-10-12'});
  const p=activeTrial(s).plan[0],rows=blankRows(p);rows[0].reps=8;
  writeEntry(s,'exercise:legacy-missing:push','exercise',{sessionId:'legacy-missing',exerciseId:'push',rows});
  const original=clone(s.journal.entries);assert.deepEqual(validateBackup(s),s);
  startTrial(s,{start:'2026-10-26',routine});
  assert.deepEqual(validateBackup(s),s);
  assert.deepEqual(s.journal.entries,original);
  const se=startSession(s,{date:'2026-10-26',workout:'A'}),before=clone(s);
  assert.throws(()=>writeEntry(s,exerciseEntryId(se,'rear'),'exercise',{sessionId:se,exerciseId:'rear',rows}));
  assert.deepEqual(s,before);
});

test('T04-M11: a review before phase start cannot emit a reversed date range',()=>{
  const s=setup();
  assert.equal(trialSummary(s,activeTrial(s).id,'2026-10-25').totalDays,0);
  assert.throws(()=>trialMarkdown(s,activeTrial(s).id,'2026-10-25'),/早于.*开始/);
});

test('T04-M12: seeded action sequences preserve snapshots and backup round trips (seed 10788)',()=>{
  let seed=10788;const next=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed;};
  for(let run=0;run<12;run++){
    let s=setup();const saved=new Map(),trace=[];
    try{
      for(let step=0;step<20;step++){
        const action=next()%3;trace.push(action);
        if(action===0){const workout=['A','B','C'][next()%3],id=startSession(s,{date:'2026-10-26',workout});saved.set(id,clone(entry(s,id)));}
        if(action===1){const p=clone(activeTrial(s).plan);p.find(e=>e.id==='push').min=6+next()%4;changePlan(s,p,'synthetic sequence');}
        if(action===2)s=validateBackup(JSON.parse(JSON.stringify(s)));
        for(const [id,original]of saved)assert.deepEqual(entry(s,id),original);
        assert.deepEqual(validateBackup(s),s);
      }
    }catch(error){error.message+=` run=${run} trace=${JSON.stringify(trace)} seed=10788`;throw error;}
  }
});
