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
  const context=await browser.newContext({viewport:{width:390,height:844}});
  const page=await context.newPage(),errors=[];
  page.on('pageerror',error=>errors.push(error.message));
  page.setDefaultTimeout(7000);
  await mkdir('test-output',{recursive:true});

  await page.goto(base);
  await page.click('#startStrength');
  await page.click('#confirmStrength');
  await page.selectOption('#strengthWorkout','B');
  await page.click('#beginSession');
  const read=()=>page.evaluate(()=>localStorage.getItem('mantou-training-v1'));
  const before=await read();
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
  console.log('PASS TRAIN-07: optional drawings, playback, reduced motion, offline use and unchanged training data');
}finally{
  await browser?.close();
  server?.kill();
}
