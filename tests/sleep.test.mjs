import test from 'node:test';
import assert from 'node:assert/strict';
import {parseSleep,mergeSleepSegments,validateSleepSegments,planSleepImport} from '../dist/sleep-core.mjs';
import {writeEntry,validateJournal,emptyJournal} from '../dist/journal.mjs';
import {mergeJournal} from '../dist/journal-sync.mjs';
const csv=(h,r)=>'samsung,1\n'+h+'\n'+r+'\n';
const sleep=csv('datauuid,start_time,end_time,time_offset','sample-id,2020-01-01 23:00:00.000,2020-01-02 00:00:00.000,UTC+0800');
const stages=csv('sleep_id,start_time,end_time,stage','sample-id,2020-01-01 23:00:00.000,2020-01-02 00:00:00.000,40002');

test('batch import recognizes a reordered legacy cloud record and surfaces real revisions',()=>{
  const [record]=parseSleep(sleep,stages).records;
  const legacy=Object.fromEntries(Object.entries(record).filter(([k])=>k!=='groupId').reverse());
  const entries={['daily:'+record.date]:{fields:{samsungSleep:legacy,energy:'good'}}};
  const range={from:record.date,to:record.date};
  assert.equal(planSleepImport([record],entries,range)[0].status,'same');
  assert.equal(planSleepImport([{...record,actualMinutes:50}],entries,range)[0].status,'update');
  assert.equal(planSleepImport([{...record,actualMinutes:null}],entries,range)[0].status,'review');
  assert.equal(planSleepImport([record],{},range)[0].status,'new');
});

test('batch import skips ambiguous dates, deleted days and partial replacements',()=>{
  const [first]=parseSleep(sleep,stages).records;
  const second={...first,sourceId:'part-two',start:'2020-01-02T01:00:00.000Z',end:'2020-01-02T02:00:00.000Z'};
  const range={from:first.date,to:first.date};
  assert.equal(planSleepImport([first,second],{},range)[0].status,'review');
  const group=[first,second].map(p=>({...p,groupId:'night'}));
  const plan=planSleepImport(group,{},range)[0];
  assert.equal(plan.sleep.gapMinutes,60);
  const id='daily:'+first.date,entry={fields:{samsungSleep:plan.sleep}};
  assert.equal(planSleepImport(group,{[id]:entry},range)[0].status,'same');
  assert.equal(planSleepImport(group.slice(1),{[id]:entry},range)[0].status,'review');
  assert.equal(planSleepImport(group,{[id]:{...entry,deleted:true}},range)[0].status,'review');
});
test('split sleep retains gaps, provenance and accurate summed stage time',()=>{const a=parseSleep(sleep,stages).records[0],b={...a,sourceId:'part-two',start:'2020-01-02T01:00:00.000Z',end:'2020-01-02T02:00:00.000Z',actualMinutes:50};const result=mergeSleepSegments([b,a]);assert.equal(result.intervalMinutes,180);assert.equal(result.actualMinutes,110);assert.equal(result.gapMinutes,60);assert.equal(result.segments.length,2);assert.ok(validateSleepSegments(result));assert.equal(validateSleepSegments({...result,actualMinutes:170}),false);assert.equal(mergeSleepSegments([a,{...b,actualMinutes:null}]).actualMinutes,null);});
test('overlaps, duplicate segments and timezone mismatch cannot silently double count',()=>{const a=parseSleep(sleep,stages).records[0];assert.throws(()=>mergeSleepSegments([a,a]),/重叠/);assert.throws(()=>mergeSleepSegments([a,{...a,offsetMinutes:0}]),/时区/);assert.throws(()=>mergeSleepSegments([]));});
test('UTC export becomes local wake date; complete stages give actual sleep',()=>{const r=parseSleep(sleep,stages).records[0];assert.equal(r.date,'2020-01-02');assert.equal(r.actualMinutes,60);assert.equal(r.offsetMinutes,480);});
test('missing or overlapping stage intervals never invent actual sleep',()=>{assert.equal(parseSleep(sleep,csv('sleep_id,start_time,end_time,stage','')).records[0].actualMinutes,null);assert.equal(parseSleep(sleep,stages+stages.split('\n')[2]+'\n').records[0].actualMinutes,null);});
test('missing timezone is rejected instead of guessed',()=>assert.equal(parseSleep(sleep.replace('UTC+0800',''),stages).records.length,0));
test('sleep coexists with food and manual sleep, survives backup and merges across devices',()=>{const base={journal:emptyJournal()};writeEntry(base,'daily:2020-01-02','daily',{date:'2020-01-02',breakfast:'test',sleepHours:7});const left=structuredClone(base),right=structuredClone(base);const r=parseSleep(sleep,stages).records[0];writeEntry(left,'daily:2020-01-02','daily',{samsungSleep:r});writeEntry(right,'daily:2020-01-02','daily',{energy:'good'});const m=mergeJournal(base.journal,left.journal,right.journal);assert.equal(m.conflicts.length,0);const restored=validateJournal(JSON.parse(JSON.stringify(m.merged)));assert.equal(restored.entries['daily:2020-01-02'].fields.samsungSleep.actualMinutes,60);assert.equal(restored.entries['daily:2020-01-02'].fields.sleepHours,7);assert.equal(restored.entries['daily:2020-01-02'].fields.energy,'good');});
