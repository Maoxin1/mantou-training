import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {once} from 'node:events';
import {chromium,devices} from 'playwright';
import {fresh} from '../dist/engine.mjs';
import {writeEntry} from '../dist/journal.mjs';

const server=spawn(process.execPath,['scripts/serve.mjs'],{env:{...process.env,PORT:'4202'},stdio:['ignore','pipe','inherit']});
const root='http://127.0.0.1:4202/';
const stateKey='mantou-training-v1',requestKey='mantou-training-sleep-request';
const record={source:'Health Connect',origin:'example.sleep',id:'frozen-tab-regression',
  start:'2020-01-01T15:00:00.000Z',end:'2020-01-01T23:00:00.000Z',
  startOffsetSeconds:28800,endOffsetSeconds:28800,lastModified:'2020-01-02T02:00:00.000Z',
  date:'2020-01-02',intervalMinutes:480,actualMinutes:420};
const b64=bytes=>Buffer.from(bytes).toString('base64url');
async function begin(page){
  await page.locator('[data-page="history"]').click();
  await page.evaluate(()=>window.addEventListener('click',event=>{
    if(event.target.closest('#oneTapSleep'))event.preventDefault();
  },{once:true}));
  await page.locator('#oneTapSleep').click();
  const request=await page.evaluate(key=>JSON.parse(localStorage.getItem(key)),requestKey);
  assert(request,'a user click must create the request');
  const iv=crypto.getRandomValues(new Uint8Array(12));
  const key=await crypto.subtle.importKey('raw',Buffer.from(request.key,'base64url'),'AES-GCM',false,['encrypt']);
  const cipher=await crypto.subtle.encrypt({name:'AES-GCM',iv,additionalData:new TextEncoder().encode(request.id)},
    key,new TextEncoder().encode(JSON.stringify({version:1,records:[record]})));
  return root+'#mantou-sleep='+[request.id,b64(iv),b64(cipher)].join('.');
}
let browser;
try{
  await once(server.stdout,'data');
  browser=await chromium.launch({channel:process.platform==='win32'?'msedge':undefined});
  const context=await browser.newContext({...devices['Pixel 7'],timezoneId:'Asia/Shanghai'});
  const original=await context.newPage();
  original.setDefaultTimeout(6000);
  // Model a background page whose cross-tab events are not delivered.
  await original.addInitScript(()=>window.addEventListener('storage',event=>event.stopImmediatePropagation()));
  await original.goto(root);
  await original.waitForFunction(async()=>(await navigator.locks.query()).held.some(lock=>lock.name==='mantou-training-editor'));
  const callback=await begin(original);
  const returned=await context.newPage();
  returned.setDefaultTimeout(6000);
  await returned.goto(callback);
  await returned.getByText('已保存 1 条 · 重复跳过 0 条 · 待核对 0 条',{exact:true}).waitFor();
  assert.equal(await returned.locator('#systemAlert').isVisible(),false,'return tab must remain usable');
  assert.equal(new URL(returned.url()).hash,'');
  const saved=await returned.evaluate(key=>localStorage.getItem(key),stateKey);
  assert.equal(JSON.parse(saved).journal.entries['daily:2020-01-02'].fields.healthConnectSleep.id,record.id);
  await original.locator('#oneTapSleep').click();
  assert.equal(await original.evaluate(key=>Boolean(localStorage.getItem(key)),requestKey),false,'the old tab cannot start another writer');
  assert.equal(await original.evaluate(key=>localStorage.getItem(key),stateKey),saved);
  // Android can also reuse the original tab instead of opening a new one.
  const repeat=await begin(returned);
  await returned.goto(repeat);
  await returned.getByText('已保存 0 条 · 重复跳过 1 条 · 待核对 0 条',{exact:true}).waitFor();
  assert.equal(await returned.evaluate(key=>localStorage.getItem(key),stateKey),saved);
  await returned.reload();
  await returned.locator('[data-page="history"]').click();
  await returned.getByText('已保存 0 条 · 重复跳过 1 条 · 待核对 0 条',{exact:true}).waitFor();
  assert.equal(await returned.evaluate(key=>localStorage.getItem(key),stateKey),saved);
  console.log('PASS suspended storage events, exclusive return writer, same-tab repeat and reload persistence');
  await context.close();

  // Mock only transport/authentication. Exercise the actual account cache and sync code.
  const account=await browser.newContext({...devices['Pixel 7'],serviceWorkers:'block'});
  const owner={id:'handoff-account',email:'handoff@example.invalid'},accountKey='mantou-training-account:'+owner.id;
  let remote=fresh(),revision=1,unblockSync,startedSync;
  writeEntry(remote,'daily:2020-01-02','daily',{date:'2020-01-02',notes:'existing feedback'});
  const syncStarted=new Promise(resolve=>{startedSync=resolve;});
  const syncBlocked=new Promise(resolve=>{unblockSync=resolve;});
  await account.addInitScript(({owner,accountKey,state})=>{
    localStorage.setItem('mantou-training-account',JSON.stringify(owner));
    if(!localStorage.getItem(accountKey))localStorage.setItem(accountKey,JSON.stringify({local:state,base:state,revision:1,pending:false,conflict:null}));
  },{owner,accountKey,state:remote});
  await account.route('**/cloud-config.mjs',route=>route.fulfill({contentType:'text/javascript',body:'export const AUTH_URL="https://auth.example.invalid";'}));
  await account.route('**/cloud-token.mjs',route=>route.fulfill({contentType:'text/javascript',body:'export async function getSyncToken(){return "isolated-test";}'}));
  await account.route('**/api/sync',async route=>{
    startedSync();await syncBlocked;
    assert.equal(route.request().headers()['x-account-id'],owner.id);
    if(route.request().method()==='PUT'){remote=route.request().postDataJSON().state;revision++;}
    await route.fulfill({json:{state:remote,revision}});
  });
  const signed=await account.newPage();signed.setDefaultTimeout(6000);
  await signed.goto(root);await syncStarted;
  await signed.locator('[data-page="history"]').click();
  await signed.locator('#oneTapSleep').click();
  await signed.getByText('正在同步，请等同步结束后再导入睡眠',{exact:true}).waitFor();
  assert.equal(await signed.evaluate(key=>localStorage.getItem(key),requestKey),null);
  unblockSync();
  await signed.waitForFunction(()=>document.querySelector('#accountShortcut').title.includes('已与云端同步'));
  const accountResult=await begin(signed);
  const accountReturn=await account.newPage();accountReturn.setDefaultTimeout(6000);
  await accountReturn.goto(accountResult);
  await accountReturn.getByText('已保存 1 条 · 重复跳过 0 条 · 待核对 0 条',{exact:true}).waitFor();
  await accountReturn.waitForFunction(()=>document.querySelector('#accountShortcut').title.includes('已与云端同步'));
  assert.equal(remote.journal.entries['daily:2020-01-02'].fields.notes,'existing feedback');
  assert.equal(remote.journal.entries['daily:2020-01-02'].fields.healthConnectSleep.id,record.id);
  assert.equal(await accountReturn.evaluate(key=>localStorage.getItem(key),stateKey),null);
  console.log('PASS busy sync blocks handoff; account return preserves feedback and syncs the imported summary');
}finally{
  await browser?.close();
  server.kill();
}
