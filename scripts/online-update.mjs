import {chromium} from 'playwright';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
const {version}=JSON.parse(await readFile(new URL('../package.json',import.meta.url),'utf8'));
const baseURL=(process.env.TRAINING_BASE_URL||'https://mantou-training-offline.vercel.app').replace(/\/$/,'');
const browser=await chromium.launch({channel:process.env.BROWSER_CHANNEL||(process.platform==='win32'?'msedge':undefined),headless:true});
try{
  const page=await browser.newPage();await page.goto(baseURL+'/',{waitUntil:'networkidle'});await page.evaluate(()=>navigator.serviceWorker.ready.then(()=>true));
  const previous=await page.locator('footer').innerText();
  const id=await page.evaluate(async()=>{localStorage.setItem('acceptance-update-sentinel','preserve');const {MealStore}=await import('/meal-store.mjs');const {fresh}=await import('/engine.mjs');const {today,writeEntry}=await import('/journal.mjs');const state=fresh();writeEntry(state,'daily:'+today(),'daily',{date:today(),notes:'synthetic upgrade acceptance'});localStorage.setItem('mantou-training-v1',JSON.stringify(state));const id=crypto.randomUUID();await new MealStore('guest').add({id,date:today(),meal:'lunch',data:'/9j/4AAA/9k='});return id;});
  console.log('PRODUCTION READY:',previous,'; cached shell, synthetic training text and photo saved.');
  if(process.env.WAIT_FOR_DEPLOY==='1'){await new Promise(resolve=>process.stdin.once('data',resolve));process.stdin.pause();}
  await page.goto(baseURL+'/update.html',{waitUntil:'domcontentloaded'});await page.locator('#update').click();await page.waitForURL(url=>url.searchParams.get('updated')===version,{timeout:60000});await page.locator('#startTrial').waitFor();
  assert((await page.locator('footer').innerText()).includes(version));
  const result=await page.evaluate(async id=>{const {MealStore}=await import('/meal-store.mjs');const {today}=await import('/journal.mjs');return {sentinel:localStorage.getItem('acceptance-update-sentinel'),photo:!!await new MealStore('guest').get(id),notes:JSON.parse(localStorage.getItem('mantou-training-v1')).journal.entries['daily:'+today()].fields.notes};},id);
  assert.equal(result.sentinel,'preserve');assert.equal(result.photo,true);assert.equal(result.notes,'synthetic upgrade acceptance');console.log(`LIVE UPDATE PASS: update entry opened ${version}; actual training text and photo preserved.`);
}finally{await browser.close();}
