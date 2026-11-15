import assert from 'node:assert/strict';
import {spawn,execFileSync} from 'node:child_process';
import {once} from 'node:events';
import {delimiter} from 'node:path';
import {chromium,devices} from 'playwright';

const preview=process.env.TRAINING_ONE_TAP_PREVIEW;
const ROOT=preview?new URL('/',preview).href:'http://127.0.0.1:4201/';
const server=preview?null:spawn(process.execPath,['scripts/serve.mjs'],{env:{...process.env,PORT:'4201'},stdio:['ignore','pipe','inherit']});
const stateKey='mantou-training-v1';
const requestKey='mantou-training-sleep-request';
const responseKey='mantou-training-sleep-return';
const records=[
  {source:'Health Connect',origin:'nl.appyhapps.healthsync',id:'first',start:'2020-01-01T15:00:00.000Z',end:'2020-01-01T23:00:00.000Z',startOffsetSeconds:28800,endOffsetSeconds:28800,lastModified:'2020-01-02T02:00:00.000Z',date:'2020-01-02',intervalMinutes:480,actualMinutes:420},
  {source:'Health Connect',origin:'nl.appyhapps.healthsync',id:'second',start:'2020-01-03T03:00:00.000Z',end:'2020-01-03T04:00:00.000Z',startOffsetSeconds:28800,endOffsetSeconds:28800,lastModified:'2020-01-03T10:00:00.000Z',date:'2020-01-03',intervalMinutes:60,actualMinutes:null},
  {source:'Health Connect',origin:'nl.appyhapps.healthsync',id:'third',start:'2020-01-03T07:00:00.000Z',end:'2020-01-03T08:00:00.000Z',startOffsetSeconds:28800,endOffsetSeconds:28800,lastModified:'2020-01-03T10:00:00.000Z',date:'2020-01-03',intervalMinutes:60,actualMinutes:null}
];
const b64=bytes=>Buffer.from(bytes).toString('base64url');
async function seal(request,payload){
  if(process.env.TRAINING_SLEEP_JAVA){
    const classes=['test-output/one-tap-android/classes','test-output/one-tap-interoperability'].join(delimiter);
    return execFileSync(process.env.TRAINING_SLEEP_JAVA,['-cp',classes,
      'app.mantou.sleep.bridge.EnvelopeHarness',request.id,request.key,JSON.stringify(payload)],{encoding:'utf8'}).trim();
  }
  const iv=crypto.getRandomValues(new Uint8Array(12));
  const key=await crypto.subtle.importKey('raw',Buffer.from(request.key,'base64url'),'AES-GCM',false,['encrypt']);
  const sealed=await crypto.subtle.encrypt({name:'AES-GCM',iv,additionalData:new TextEncoder().encode(request.id)},key,
    new TextEncoder().encode(JSON.stringify(payload)));
  return [request.id,b64(iv),b64(sealed)].join('.');
}

let browser;
try{
  if(server){
    await Promise.race([once(server.stdout,'data'),once(server,'exit').then(([code])=>{throw Error('Test server exited '+code);})]);
  }else{
    assert.match(ROOT,/^https:\/\//);
  }
  browser=await chromium.launch({channel:process.env.BROWSER_CHANNEL||(process.platform==='win32'?'msedge':undefined)});
  const context=await browser.newContext({...devices['Pixel 7'],timezoneId:'Asia/Shanghai'});
  let editor=await context.newPage();
  const requests=[],errors=[];
  context.on('request',r=>requests.push(r.url()));
  editor.on('pageerror',e=>errors.push(e.message));
  const read=key=>editor.evaluate(key=>localStorage.getItem(key),key);
  await editor.goto(ROOT,{waitUntil:'domcontentloaded'});
  if(preview){
    const boundary=await editor.evaluate(async()=>{
      const [config,sync]=await Promise.all([
        fetch('/cloud-config.mjs',{redirect:'error'}),fetch('/api/sync',{redirect:'error'})
      ]);
      return {configStatus:config.status,syncStatus:sync.status,isolated:/export const AUTH_URL="";/.test(await config.text())};
    });
    assert.deepEqual(boundary,{configStatus:200,syncStatus:404,isolated:true},
      'synthetic browser tests require an isolated preview with no sync API');
  }
  await editor.waitForFunction(()=>Boolean(navigator.serviceWorker.controller));
  await editor.locator('[data-page="history"]').click();
  let button=editor.getByRole('link',{name:'一键导入近 7 天睡眠'});
  async function click(){
    await editor.evaluate(()=>window.addEventListener('click',e=>{
      if(e.target.closest('#oneTapSleep'))e.preventDefault();
    },{once:true}));
    await button.click();
    assert.match(await button.getAttribute('href'),/^intent:\/\/import\/sleep#Intent;.*package=app\.mantou\.sleep\.bridge;/);
    return JSON.parse(await read(requestKey));
  }
  const started=await click();
  const sealed=await seal(started,{version:1,records});
  assert.equal(await read(stateKey),null);
  await context.setOffline(true);
  const returned=await context.newPage();
  returned.on('pageerror',e=>errors.push(e.message));
  const resultURL=value=>ROOT+'#mantou-sleep='+value;
  await returned.goto(resultURL(sealed));
  await returned.getByText('已保存 1 条 · 重复跳过 0 条 · 待核对 2 条',{exact:true}).waitFor();
  assert.equal(new URL(returned.url()).hash,'');
  const saved=await read(stateKey);
  assert.equal(JSON.parse(saved).journal.entries['daily:2020-01-02'].fields.healthConnectSleep.origin,records[0].origin);
  assert.equal(JSON.parse(saved).journal.entries['daily:2020-01-03'],undefined);
  assert.equal(await read(requestKey),null);
  assert.equal(await read(responseKey),null);
  await editor.getByText('查看待核对的睡眠',{exact:true}).click();
  await editor.getByText(/07:00|15:00/).first().waitFor();
  await returned.goto(resultURL(sealed));
  await returned.locator('#toast').filter({hasText:'没有有效的睡眠导入请求'}).waitFor();
  assert.equal(await read(stateKey),saved);
  // Continue from the tab Android returned to, as the user does on a phone.
  await editor.close();
  editor=returned;
  button=editor.getByRole('link',{name:'一键导入近 7 天睡眠'});
  const again=await click();
  await editor.goto(resultURL(await seal(again,{version:1,records})));
  await editor.getByText('已保存 0 条 · 重复跳过 1 条 · 待核对 2 条',{exact:true}).waitFor();
  assert.equal(await read(stateKey),saved);
  const wrongScope=await click();
  await editor.evaluate(({key,request})=>localStorage.setItem(key,JSON.stringify({...request,scope:'another-account'})),{key:requestKey,request:wrongScope});
  await editor.goto(resultURL(await seal(wrongScope,{version:1,records:[]})));
  await editor.locator('#toast').filter({hasText:'没有有效的睡眠导入请求'}).waitFor();
  assert.equal(await read(stateKey),saved);
  const failed=await click();
  await editor.goto(ROOT+'#sleep-tool-missing='+failed.id);
  await editor.getByText(/未能打开睡眠小工具/).waitFor();
  assert.equal(await read(requestKey),null);
  assert.equal(await read(stateKey),saved);
  const denied=await click();
  await editor.goto(resultURL(await seal(denied,{version:1,error:'permission'})));
  await editor.getByText(/未授予读取睡眠权限/).waitFor();
  assert.equal(await read(stateKey),saved);
  await editor.getByText('查看待核对的睡眠',{exact:true}).waitFor();
  const cold=await click();
  const later={...records[0],id:'fourth',date:'2020-01-04',
    start:'2020-01-03T15:00:00.000Z',end:'2020-01-03T23:00:00.000Z'};
  const coldResult=await seal(cold,{version:1,records:[later]});
  await editor.close();
  const reopened=await context.newPage();
  await reopened.goto(resultURL(coldResult));
  await reopened.getByText('已保存 1 条 · 重复跳过 0 条 · 待核对 0 条',{exact:true}).waitFor();
  const coldSaved=await reopened.evaluate(key=>JSON.parse(localStorage.getItem(key)),stateKey);
  assert.equal(coldSaved.journal.entries['daily:2020-01-04'].fields.healthConnectSleep.id,later.id);
  editor=reopened;
  button=editor.getByRole('link',{name:'一键导入近 7 天睡眠'});
  const possibleDuplicate={...records[0],id:'other-app-record'};
  const reviewItems=[possibleDuplicate,...records.slice(1)];
  const review=await click();
  await editor.goto(resultURL(await seal(review,{version:1,records:reviewItems})));
  await editor.getByText('已保存 0 条 · 重复跳过 0 条 · 待核对 3 条',{exact:true}).waitFor();
  await editor.getByText('查看待核对的睡眠',{exact:true}).click();
  await editor.getByText('已存睡眠',{exact:true}).waitFor();
  if(process.env.TRAINING_SLEEP_REVIEW_SHOTS)await editor.getByRole('button',{name:'保留原记录',exact:true}).locator('..').screenshot({path:'test-output/sleep-review-keep.png'});
  editor.once('dialog',dialog=>dialog.accept());
  await editor.getByRole('button',{name:'保留原记录',exact:true}).click();
  await editor.getByText('已保存 0 条 · 重复跳过 0 条 · 待核对 2 条',{exact:true}).waitFor();
  assert.deepEqual(JSON.parse(await read(stateKey)),coldSaved);
  await editor.getByRole('button',{name:'预览合并',exact:true}).click();
  await editor.getByText(/未记录间隔 180 分钟/).waitFor();
  if(process.env.TRAINING_SLEEP_REVIEW_SHOTS)await editor.getByRole('button',{name:'确认同一晚并保存',exact:true}).locator('..').screenshot({path:'test-output/sleep-review-merge.png'});
  assert.deepEqual(JSON.parse(await read(stateKey)),coldSaved,'preview must not write');
  await editor.getByRole('button',{name:'确认同一晚并保存',exact:true}).click();
  await editor.getByText('已保存合并睡眠',{exact:true}).waitFor();
  const merged=JSON.parse(await read(stateKey));
  assert.deepEqual(merged.journal.entries['daily:2020-01-02'],coldSaved.journal.entries['daily:2020-01-02']);
  assert.deepEqual(merged.journal.entries['daily:2020-01-03'].fields.healthConnectSleepParts.map(item=>item.id),['second','third']);
  await editor.reload();
  const recheck=await (async()=>{
    await editor.locator('[data-page="history"]').click();
    return click();
  })();
  await editor.goto(resultURL(await seal(recheck,{version:1,records:reviewItems})));
  await editor.getByText('已保存 0 条 · 重复跳过 2 条 · 待核对 0 条',{exact:true}).waitFor();
  assert.deepEqual(JSON.parse(await read(stateKey)),merged);
  assert(requests.every(url=>!url.includes(sealed)&&!url.includes(records[0].origin)));
  assert.deepEqual(errors,[]);
  console.log('PASS one-tap return, duplicates, account isolation, and explicit review, merge and re-import');
}finally{
  await browser?.close();
  server?.kill();
}
