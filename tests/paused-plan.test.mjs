import test from 'node:test';
import assert from 'node:assert/strict';
import {fresh} from '../dist/engine.mjs';
import {startTrial,startSession,changePlan,copy,validateJournal,trialMarkdown} from '../dist/journal.mjs';
import {planCard} from '../dist/journal-cards.mjs';
test('pausing applies to future session snapshots and survives backup without changing history',()=>{
  const s=fresh(),id=startTrial(s,{start:'2026-10-27'}),before=startSession(s,{date:'2026-10-27'}),plan=copy(s.journal.trials[id].plan);
  plan[0].paused=true;plan[0].pauseReason='待确认';changePlan(s,plan,'本人确认暂停');
  const after=startSession(s,{date:'2026-10-29'});assert.equal(s.journal.entries[before].fields.plan[0].paused,undefined);assert.equal(s.journal.entries[after].fields.plan[0].paused,true);
  const j=validateJournal(JSON.parse(JSON.stringify(s.journal)));assert.equal(j.trials[id].plan[0].paused,true);assert.match(trialMarkdown(s,id,'2026-10-29'),/已暂停：待确认/);
  plan[0].paused=false;changePlan(s,plan,'本人确认恢复');assert.equal(s.journal.entries[after].fields.plan[0].paused,true);assert.equal(s.journal.trials[id].plan[0].paused,false);
});
test('paused cards omit dose and action, show escaped reason; normal cards retain their targets',()=>{const s=fresh(),id=startTrial(s),p=s.journal.trials[id].plan[0];const html=planCard({...p,paused:true,pauseReason:'<img src=x>'});assert.match(html,/已暂停/);assert.doesNotMatch(html,/data-journal-exercise|class="dose"|<img/);assert.match(html,/&lt;img/);assert.match(planCard(p),/data-journal-exercise/);});
