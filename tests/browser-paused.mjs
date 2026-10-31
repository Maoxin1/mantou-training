import {chromium} from 'playwright';
import {spawn} from 'node:child_process';
import assert from 'node:assert/strict';
const server=spawn(process.execPath,['scripts/serve.mjs'],{env:{...process.env,PORT:'4187'},stdio:['ignore','pipe','pipe']});
await new Promise((resolve,reject)=>{server.stdout.once('data',resolve);server.once('error',reject);});
const browser=await chromium.launch({channel:'msedge',headless:true});
try{
  const context=await browser.newContext(),page=await context.newPage();await page.goto('http://127.0.0.1:4187/');
  await page.evaluate(async()=>{const {fresh}=await import('/engine.mjs'),{startTrial,startSession}=await import('/journal.mjs');const s=fresh();startTrial(s,{start:'2026-10-27'});startSession(s,{date:'2026-10-27'});localStorage.setItem('mantou-training-v1',JSON.stringify(s));});await page.reload();
  await page.click('#adjustTrial');for(const i of [0,1]){await page.locator(`[data-paused="${i}"]`).evaluate(el=>el.closest('details').open=true);await page.locator(`[data-paused="${i}"]`).check();await page.locator(`[data-field="${i}-pauseReason"]`).fill('测试暂停');}
  await page.locator('[data-field="reason"]').fill('本人测试确认');await page.locator('#adjustTrialForm button[type=submit]').click();
  assert.equal(await page.locator('[data-paused-exercise]').count(),2);assert.equal(await page.locator('[data-journal-exercise="push"]').count(),0);
  const state=await page.evaluate(()=>JSON.parse(localStorage.getItem('mantou-training-v1')));assert.equal(Object.values(state.journal.entries)[0].fields.plan[0].paused,undefined);
  await page.evaluate(()=>navigator.serviceWorker.ready.then(()=>true));await context.setOffline(true);await page.reload();assert.equal(await page.locator('[data-paused-exercise]').count(),2);
  console.log('PASS: pause confirmation, hidden targets, preserved old snapshot, offline reload');
}finally{await browser.close();server.kill();}
