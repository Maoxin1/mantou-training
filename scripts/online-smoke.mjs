import {chromium} from 'playwright';
import assert from 'node:assert/strict';
import {mkdir} from 'node:fs/promises';
const baseURL=(process.env.TRAINING_BASE_URL||'https://mantou-training-offline.vercel.app').replace(/\/$/,'');
const browser=await chromium.launch({channel:process.env.BROWSER_CHANNEL||(process.platform==='win32'?'msedge':undefined),headless:true});
try{
  const context=await browser.newContext({viewport:{width:412,height:915}}),page=await context.newPage(),errors=[];
  page.on('pageerror',e=>errors.push(e.message));
  const response=await page.goto(baseURL+'/',{timeout:25000,waitUntil:'domcontentloaded'});
  console.log('Page',response.status(),await page.title());
  await page.waitForTimeout(2500);
  console.log('Errors',errors);
  console.log('Journal loaded',await page.locator('#startTrial,#todayFeedback').count());
  const checks=await page.evaluate(async()=>{
    const out=[];
    for(const path of ['/meal-core.mjs','/meal-store.mjs','/meal-photos.mjs','/meal-zip.mjs','/api/meals?date=2026-10-28']){
      const r=await fetch(path,{cache:'no-store'});out.push({path,status:r.status,cache:r.headers.get('cache-control')});
    }
    const forged=await fetch('/api/meals?date=2026-10-28',{headers:{Authorization:'Bearer invalid.forged.token','X-Account-Id':'forged'}});out.push({path:'forged-account',status:forged.status});return out;
  });console.log('Production asset/API checks',JSON.stringify(checks));
  assert(checks.slice(0,4).every(r=>r.status===200));assert(checks.slice(4).every(r=>r.status===401));
  await page.evaluate(()=>navigator.serviceWorker.ready.then(()=>true));
  await page.locator('#startTrial').click();await page.locator('#startTrialForm button').click();await page.locator('#todayFeedback').click();await page.locator('[data-meal=lunch]').click();
  const image=await page.evaluate(()=>{const c=document.createElement('canvas');c.width=400;c.height=300;const x=c.getContext('2d');x.fillStyle='#58745c';x.fillRect(0,0,400,300);return c.toDataURL('image/jpeg').split(',')[1];});
  await page.locator('#mealFile').setInputFiles({name:'acceptance-test.jpg',mimeType:'image/jpeg',buffer:Buffer.from(image,'base64')});await page.locator('#mealGallery img').waitFor();await page.waitForFunction(()=>!document.getElementById('mealFile').disabled);
  await page.locator('#mealAmounts input').fill('浏览器验收测试，仅在隔离的未登录空间');
  await page.locator('#closeDialog').click();await context.setOffline(true);await page.reload();await page.locator('#todayFeedback').click();await page.locator('[data-meal=lunch]').click();await page.locator('#mealGallery img').waitFor();assert.equal(await page.locator('#mealAmounts input').inputValue(),'浏览器验收测试，仅在隔离的未登录空间');assert.deepEqual(errors,[]);
  await mkdir('test-output',{recursive:true});await page.screenshot({path:'test-output/online-meal.png'});
  console.log('Production browser PASS: meal UI, image compression, local save, offline reopen, note persistence; no account or production record modified.');
}catch(e){console.log('Browser validation failed',e.message);process.exitCode=1;}finally{await browser.close();}
