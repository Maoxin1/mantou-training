import test from 'node:test';
import assert from 'node:assert/strict';
import {LocalState} from '../dist/local-state.mjs';
import {fresh,clone} from '../dist/engine.mjs';
import {startTrial,startSession,exerciseEntryId,blankRows,writeEntry} from '../dist/journal.mjs';
import {mergeStates,SyncStore} from '../dist/sync-core.mjs';
const memory=()=>{const data=new Map();return {data,getItem:k=>data.get(k)??null,setItem:(k,v)=>data.set(k,v)};};

test('unreadable local bytes block saves and survive explicit replacement',()=>{
  for(const raw of ['{broken','',JSON.stringify({schema:99})]){
    const disk=memory();disk.setItem('local',raw);const local=new LocalState(disk,'local');
    assert(local.error);assert.throws(()=>local.save(fresh()),/原始记录/);assert.equal(disk.getItem('local'),raw);
    local.replace(fresh());assert(!local.error);assert([...disk.data].some(([k,v])=>k.startsWith('local:recovery:')&&v===raw));
    local.save(local.state);
  }
});
test('failure to archive original bytes aborts replacement',()=>{
  const disk=memory();disk.setItem('local','broken');const local=new LocalState(disk,'local');disk.setItem=()=>{throw Error('quota');};
  assert.throws(()=>local.replace(fresh()),/quota/);assert.equal(disk.getItem('local'),'broken');assert(local.error);
});
test('unavailable storage stays blocked until an explicit successful recovery',()=>{
  const disk={getItem:()=>{throw Error('access denied');},setItem:()=>{throw Error('access denied');}},local=new LocalState(disk,'local');
  assert(local.error);assert.throws(()=>local.save(fresh()),/原始记录/);assert.throws(()=>local.replace(fresh()),/access denied/);assert(local.error);
});
test('local saves reject stale windows and valid restore preserves previous state',()=>{
  const disk=memory(),a=new LocalState(disk,'local'),b=new LocalState(disk,'local');a.save(fresh());
  assert.throws(()=>b.save(fresh()),/另一窗口/);const raw=disk.getItem('local');a.replace(fresh());
  assert([...disk.data].some(([k,v])=>k.startsWith('local:recovery:')&&v===raw));
});
test('invalid account envelope never gets overwritten on construction',()=>{
  const disk=memory();const raw=JSON.stringify({local:fresh(),base:{},revision:1});disk.setItem('a',raw);
  assert.throws(()=>new SyncStore({storage:disk,key:'a',initial:fresh()}));assert.equal(disk.getItem('a'),raw);
});
function setup(){const base=fresh();startTrial(base,{start:'2026-10-20'});const sid=startSession(base,{date:'2026-10-20'}),id=exerciseEntryId(sid,'push');writeEntry(base,id,'exercise',{sessionId:sid,exerciseId:'push',rows:blankRows(base.journal.entries[sid].fields.plan[0])});return {base,id};}
test('independent offline set edits preserve both versions as an explicit conflict',()=>{
  const {base,id}=setup(),a=clone(base),b=clone(base);
  a.journal.entries[id].fields.rows[0].reps=8;b.journal.entries[id].fields.rows[1].reps=9;
  a.journal.entries[id].fieldUpdated.rows='2026-10-20T01:00:00Z';b.journal.entries[id].fieldUpdated.rows='2026-10-20T02:00:00Z';
  for(const [l,r] of [[a,b],[b,a]]){const m=mergeStates(base,l,r);assert.equal(m.conflicts.length,1);assert.deepEqual(m.conflicts[0].local,l.journal.entries[id].fields.rows);assert.deepEqual(m.conflicts[0].remote,r.journal.entries[id].fields.rows);}
});
test('resolved rows remain selected after repeated sync even against a newer timestamp',async()=>{
  const {base,id}=setup(),disk=memory(),store=new SyncStore({storage:disk,key:'a',initial:base});
  const a=clone(base),b=clone(base);a.journal.entries[id].fields.rows[0].reps=8;b.journal.entries[id].fields.rows[1].reps=9;
  a.journal.entries[id].fieldUpdated.rows='2026-10-20T01:00:00Z';b.journal.entries[id].fieldUpdated.rows='2026-10-20T02:00:00Z';store.edit(a);
  let remote=b,revision=1;const transport=async(method,body)=>method==='GET'?{state:clone(remote),revision}:(remote=clone(body.state),{revision:++revision});
  assert.equal(await store.sync(transport),'conflict');store.resolve(Object.fromEntries(store.data.conflict.conflicts.map(c=>[c.key,'local'])));
  assert.equal(await store.sync(transport),'synced');assert.equal(await store.sync(transport),'synced');assert.equal(remote.journal.entries[id].fields.rows[0].reps,8);
  assert.equal(JSON.parse(disk.getItem('a:conflict-archive'))[0].state.journal.entries[id].fields.rows[1].reps,9);
});
