import assert from 'node:assert/strict';
import {test} from 'node:test';
import {fresh, validateBackup} from '../dist/engine.mjs';
import {buildArchives, readArchive} from '../dist/archive-core.mjs';
import {mergeStates} from '../dist/sync-core.mjs';
import {startTrial, trialMarkdown, writeEntry, writeHealthConnectNights} from '../dist/journal.mjs';
import {parseHealthConnect, planHealthConnectImport} from '../dist/health-connect-sleep.mjs';
import {planSleepImport, parseSleep} from '../dist/sleep-core.mjs';

const date = '2020-01-02';
const id = 'daily:' + date;
const sample = {
  origin: 'nl.appyhapps.healthsync', id: 'synthetic-hc-1',
  start: '2020-01-01T15:00:00Z', end: '2020-01-01T23:00:00Z',
  startOffsetSeconds: 28800, endOffsetSeconds: 28800,
  lastModified: '2020-01-02T01:00:00Z',
  stages: [
    {start: '2020-01-01T15:00:00Z', end: '2020-01-01T22:00:00Z', type: 5},
    {start: '2020-01-01T22:00:00Z', end: '2020-01-01T23:00:00Z', type: 1}
  ]
};
const input = (records = [sample], extra = {}) => JSON.stringify({
  format: 'mantou-health-connect-sleep', version: 1, complete: true, records, ...extra
});
const entries = state => state.journal?.entries || {};
const plan = (records, state) => planHealthConnectImport(records, entries(state), '2020-01-04');
const incoming = () => parseHealthConnect(input())[0];
const zipSleep = parseSleep(
  'samsung,1\ndatauuid,start_time,end_time,time_offset\nzip-sleep,2020-01-01 15:00:00,2020-01-01 23:00:00,UTC+0800\n',
  'samsung,1\nsleep_id,start_time,end_time,stage\n'
).records[0];

test('Health Connect preserves source, wake date and duration with compact backup', () => {
  const sleep = incoming();
  assert.equal(sleep.origin, sample.origin);
  assert.equal(sleep.id, sample.id);
  assert.equal(sleep.date, date);
  assert.equal(sleep.intervalMinutes, 480);
  assert.equal(sleep.actualMinutes, 420);
  assert.equal(Object.hasOwn(sleep, 'stages'), false);
  const state = fresh();
  writeEntry(state, id, 'daily', {date, healthConnectSleep:sleep, sleepHours:6});
  const [archive] = buildArchives({photos:[], complete:true, records:state});
  const restored = readArchive(archive.data).records;
  assert.deepEqual(entries(restored)[id].fields, entries(state)[id].fields);
  const bad = structuredClone(restored);
  bad.journal.entries[id].fields.healthConnectSleep.actualMinutes = 481;
  assert.throws(() => validateBackup(bad), /Health Connect/);
  const trial=startTrial(state,{start:'2020-01-01'});
  assert.match(trialMarkdown(state,trial,date),/估计睡眠 420 分钟（Health Sync · Health Connect）/);
});

test('incomplete stages stay unknown and malformed or partial exports fail together', () => {
  assert.equal(parseHealthConnect(input([{...sample, stages:[]}]))[0].actualMinutes, null);
  assert.equal(parseHealthConnect(input([{...sample, stages:[sample.stages[0]]}]))[0].actualMinutes, null);
  const [undated] = parseHealthConnect(input([{...sample, endOffsetSeconds:null}]));
  assert.equal(undated.date, null);
  assert.equal(plan([undated], fresh())[0].status, 'review');
  assert.throws(() => parseHealthConnect(input([sample,{...sample,id:'bad',start:'2020-02-30T01:00:00Z'}])));
  assert.throws(() => parseHealthConnect(input([sample], {complete:false})));
  assert.throws(() => parseHealthConnect(input([sample,{...sample,stages:[]}])));
  assert.throws(() => parseHealthConnect(input([{...sample,startOffsetSeconds:99999}])));
});

test('repeat imports skip; revisions, independent same-day entries and deleted days need review', () => {
  const state = fresh(), sleep = incoming();
  assert.equal(plan([sleep], state)[0].status, 'new');
  writeEntry(state, id, 'daily', {date, healthConnectSleep:sleep});
  assert.equal(plan([sleep], state)[0].status, 'same');
  const revision = parseHealthConnect(input([{...sample,lastModified:'2020-01-03T01:00:00Z'}]))[0];
  assert.equal(plan([revision], state)[0].status, 'review');
  const second = parseHealthConnect(input([{...sample,id:'independent',start:'2020-01-02T03:00:00Z',end:'2020-01-02T04:00:00Z',stages:[]}]))[0];
  assert.deepEqual(plan([sleep,second], fresh()).map(x=>x.status), ['review','review']);
  state.journal.entries[id].deleted = true;
  assert.equal(plan([sleep], state)[0].status, 'review');
  assert.equal(planHealthConnectImport([sleep], {}, '2020-01-01')[0].status, 'review');
});

test('Samsung ZIP and Health Connect imports both block same-day and overlapping replacements', () => {
  const state = fresh(), healthConnectSleep = incoming();
  writeEntry(state, id, 'daily', {date, healthConnectSleep});
  const zipPlan = records => planSleepImport(records, entries(state), {from:'2020-01-01', to:'2020-01-04'});
  assert.equal(zipPlan([zipSleep])[0].status, 'review');
  assert.equal(zipPlan([{...zipSleep, date:'2020-01-01', offsetMinutes:0}])[0].status, 'review');
  const zipState = fresh();
  writeEntry(zipState, id, 'daily', {date, samsungSleep:zipSleep});
  assert.equal(plan([healthConnectSleep], zipState)[0].status, 'review');
});

test('sync preserves independent feedback and both sources, and protects different Health Connect imports', () => {
  const base = fresh(), left = fresh(), right = fresh();
  const healthConnectSleep = incoming();
  writeEntry(left, id, 'daily', {date, healthConnectSleep});
  writeEntry(right, id, 'daily', {date, samsungSleep:zipSleep, energy:'good'});
  const paired = mergeStates(base,left,right);
  assert.equal(paired.conflicts.length, 0);
  assert.deepEqual(entries(paired.merged)[id].fields, {date, healthConnectSleep, samsungSleep:zipSleep, energy:'good'});
  assert.equal(plan([healthConnectSleep], paired.merged)[0].status, 'review');
  const other = fresh();
  writeEntry(other, id, 'daily', {date, healthConnectSleep:{...healthConnectSleep,id:'different'}});
  const conflict = mergeStates(base,left,other).conflicts;
  assert.equal(conflict.length, 1);
  assert.match(conflict[0].label, /Health Connect/);
  assert.equal(mergeStates(base,left,structuredClone(left)).conflicts.length, 0);
});

test('batch save is atomic if one selected date already gained a competing record', () => {
  const state=fresh(), sleep=incoming();
  const other=parseHealthConnect(input([{...sample,id:'earlier',start:'2020-01-01T02:00:00Z',end:'2020-01-01T04:00:00Z',stages:[]}]))[0];
  writeEntry(state,id,'daily',{date,samsungSleep:zipSleep});
  const before=structuredClone(state);
  assert.throws(()=>writeHealthConnectNights(state,[other,sleep]),/重新预览/);
  assert.deepEqual(state,before);
});
