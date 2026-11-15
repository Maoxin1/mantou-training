import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdir } from 'node:fs/promises';
import { chromium } from 'playwright';

const port='4198',base=process.env.TRAINING_BASE_URL||`http://127.0.0.1:${port}/`;
const server=process.env.TRAINING_BASE_URL?null:spawn(process.execPath,['scripts/serve.mjs'],{
  env:{...process.env,PORT:port},stdio:['ignore','pipe','inherit'],
});
let browser;
try{
  if(server)await new Promise((resolve,reject)=>{server.stdout.once('data',resolve);server.once('error',reject);});
  browser=await chromium.launch({channel:process.env.BROWSER_CHANNEL||(process.platform==='win32'?'msedge':undefined)});
  const context=await browser.newContext({viewport:{width:390,height:844},timezoneId:'Asia/Shanghai'});
  const page=await context.newPage(),errors=[];
  page.on('pageerror',error=>errors.push(error.message));
  page.setDefaultTimeout(7000);
  await page.clock.setFixedTime(new Date('2026-11-15T12:00:00+08:00'));
  await mkdir('test-output',{recursive:true});

  await page.goto(base);
  await page.click('#startStrength');
  await page.click('#confirmStrength');
  assert.equal(await page.locator('#strengthWorkout').inputValue(),'C','Sunday uses C as the initial suggestion');
  await page.click('#beginSession');
  await page.locator('[data-row="0"][data-key=left]').fill('10');
  await page.click('#closeDialog');
  const read=()=>page.evaluate(()=>localStorage.getItem('mantou-training-v1'));
  const cState=await read();
  const help=page.locator('.exercise-help');
  const toggle=()=>help.locator('summary').click();
  const demo=page.locator('.exercise-demo');
  const stillSelector='.exercise-demo-poses canvas';
  const still=demo.locator(stillSelector);
  const player=demo.locator('.exercise-demo-player');
  const play=demo.locator('button');
  const close=()=>page.click('#closeDialog');
  const choose=async id=>{
    const list=page.locator('#sessionActions');
    if(!(await list.evaluate(el=>el.open)))await list.locator('summary').click();
    await list.locator(`[data-journal-exercise="${id}"]`).click();
  };
  const checkStills=async title=>{
    await still.first().waitFor({state:'visible'});
    assert.match(await demo.locator('h3').innerText(),title);
    assert.equal(await still.count(),2);
    await page.waitForFunction(selector=>[...document.querySelectorAll(selector)].every(canvas=>
      canvas.getContext('2d').getImageData(0,0,canvas.width,canvas.height).data.some((value,index)=>index%4===3&&value>0)),
    stillSelector);
    assert.equal(await player.isVisible(),false,'opening help shows drawings without starting playback');
  };

  assert.match(await page.locator('.training-hero h2').innerText(),/^C/);
  await choose('rdl');
  await toggle();
  await checkStills(/双哑铃罗马尼亚硬拉/);
  await close();
  assert.equal(await read(),cState);
  const library=page.getByRole('button',{name:'动作示范',exact:true});
  assert.equal(await library.isVisible(),true,'a C session must offer a path to all available demonstrations');
  await page.screenshot({path:'test-output/demo-existing-c.png'});
  await library.click();
  assert.equal(await page.getByRole('button',{name:'坐姿俯身反向飞鸟',exact:true}).isVisible(),true);
  await page.getByRole('button',{name:'坐姿俯身反向飞鸟',exact:true}).click();
  await checkStills(/坐姿俯身反向飞鸟/);
  await page.getByRole('button',{name:'返回动作示范',exact:true}).click();
  assert.equal(await page.getByRole('button',{name:'双哑铃罗马尼亚硬拉',exact:true}).isVisible(),true);
  await close();
  assert.equal(await read(),cState,'learning a movement outside C does not create or change a session');
  const newSession=page.getByRole('button',{name:'新建场次 · 选表',exact:true});
  await newSession.click();
  await page.locator('#newStrengthSessionForm [data-field=workout]').selectOption('B');
  await close();
  assert.equal(await read(),cState,'canceling the B selection preserves the C session and its actual result');
  await newSession.click();
  await page.locator('#newStrengthSessionForm [data-field=workout]').selectOption('B');
  await page.getByRole('button',{name:'新建本次训练'}).click();
  await close();
  assert.match(await page.locator('.training-hero h2').innerText(),/^B/);
  const sessions=(raw)=>Object.entries(JSON.parse(raw).journal.entries).filter(([,item])=>item.kind==='session');
  const before=await read();
  assert.equal(sessions(before).length,2,'choosing B creates a separate session');
  const [[cId,cSession]]=sessions(cState);
  assert.deepEqual(Object.fromEntries(sessions(before))[cId],cSession,'the C session and its target snapshot are preserved');
  const cLog=Object.values(JSON.parse(cState).journal.entries).find(item=>item.kind==='exercise');
  assert.deepEqual(JSON.parse(before).journal.entries[cLog.id],cLog,'the recorded C set is preserved');
  await page.click('#beginSession');
  assert.equal(await help.evaluate(el=>el.open),false);
  assert.equal(await demo.isVisible(),false);
  await toggle();
  await checkStills(/扶大腿单臂划船/);
  await demo.screenshot({path:'test-output/demo-row-phone.png'});
  await play.click();
  await player.waitFor({state:'visible'});
  assert.equal(await play.innerText(),'停止播放');
  await toggle();
  await toggle();
  await player.waitFor({state:'hidden'});
  assert.equal(await play.innerText(),'播放一次');
  await play.click();
  await player.waitFor({state:'visible'});
  await player.waitFor({state:'hidden'});
  await close();

  await choose('rdl');
  await page.emulateMedia({reducedMotion:'reduce'});
  await page.setViewportSize({width:320,height:780});
  await toggle();
  await checkStills(/双哑铃罗马尼亚硬拉/);
  assert.equal(await play.isVisible(),false,'reduced motion keeps both drawings and disables playback');
  assert(await page.locator('#exerciseDialog').evaluate(el=>el.scrollWidth<=el.clientWidth+1),'no horizontal clipping');
  await demo.screenshot({path:'test-output/demo-rdl-narrow.png'});
  await close();

  await choose('push');
  await toggle();
  assert.equal(await demo.count(),0,'unsupported movements retain their current help');
  await close();
  assert.equal(await read(),before,'viewing and playing does not write training data');

  await page.waitForFunction(()=>Boolean(navigator.serviceWorker.controller),null,{timeout:25000});
  assert(await page.evaluate(async()=>Boolean(await caches.match('/exercise-demos.mjs'))),'PWA shell caches the module');
  await context.setOffline(true);
  await page.reload();
  await page.setViewportSize({width:820,height:1180});
  await choose('rear');
  await toggle();
  await checkStills(/坐姿俯身反向飞鸟/);
  await demo.screenshot({path:'test-output/demo-fly-tablet.png'});
  await close();
  assert.equal(await read(),before,'offline help preserves the same training session');
  assert.deepEqual(errors,[]);
  console.log('PASS TRAIN-07: C-session demo discovery; explicit new B session; optional, offline and read-only demonstrations');
}finally{
  await browser?.close();
  server?.kill();
}
