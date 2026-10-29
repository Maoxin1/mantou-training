// Local integration harness only. Auth is stubbed here; production API verifies Neon JWTs.
import {chromium} from 'playwright';
import http from 'node:http';
import {readFile,mkdir} from 'node:fs/promises';
import {fresh} from '../dist/engine.mjs';
import {startTrial,today} from '../dist/journal.mjs';
import {createHandler} from '../api/meals.mjs';
import {unzipSync,strFromU8} from 'fflate';
import assert from 'node:assert/strict';
import {memoryStorage} from './helpers/meal-storage.mjs';
const useDatabase=process.env.MEAL_TEST_DATABASE==='1';
if(useDatabase&&!process.env.DATABASE_URL)throw Error('Set isolated test DATABASE_URL first');
const user=crypto.randomUUID(),state=fresh();startTrial(state,{start:today()});let remote=state,revision=1;
const handler=createHandler({storage:useDatabase?undefined:memoryStorage(),verify:async req=>{if(req.headers.authorization!==`Bearer test-${user}`||req.headers['x-account-id']!==user)throw Error();return user;}});
const authStub=`export const BetterAuthVanillaAdapter=()=>({});export const createAuthClient=()=>({token:async()=>({data:{token:'test-${user}'}}),signOut:async()=>({})});`;
const server=http.createServer(async(req,res)=>{try{
  const u=new URL(req.url,'http://localhost');
  res.setHeader('Cache-Control','no-store');
  if(u.pathname==='/cloud-token.mjs'){res.setHeader('Content-Type','text/javascript');return res.end(`export const getSyncToken=async()=> 'test-${user}';`);}
  if(u.pathname==='/auth-sdk.mjs'||u.pathname==='/cloud-config.mjs'){res.setHeader('Content-Type','text/javascript');return res.end(u.pathname==='/auth-sdk.mjs'?authStub:`export const AUTH_URL='https://auth.example.test/neondb/auth';`);}
  if(u.pathname.startsWith('/api/')){
    let body='';for await(const chunk of req)body+=chunk;req.body=body?JSON.parse(body):undefined;req.query=Object.fromEntries(u.searchParams);
    const response={setHeader:(...args)=>res.setHeader(...args),status(n){res.statusCode=n;return this;},json(v){res.setHeader('Content-Type','application/json');res.end(JSON.stringify(v));}};
    if(u.pathname==='/api/meals')return await handler(req,response);
    if(req.method==='GET')return response.status(200).json({state:remote,revision});
    if(req.body.revision!==revision)return response.status(409).json({conflict:true});remote=req.body.state;return response.status(200).json({revision:++revision});
  }
  const name=u.pathname==='/'?'index.html':u.pathname.slice(1);if(name.includes('..'))throw Error();
  const bytes=await readFile(new URL('../dist/'+name,import.meta.url));res.setHeader('Content-Type',name.endsWith('.mjs')||name.endsWith('.js')?'text/javascript':name.endsWith('.css')?'text/css':name.endsWith('.html')?'text/html':name.endsWith('.png')?'image/png':name.endsWith('.svg')?'image/svg+xml':'application/json');res.end(bytes);
}catch(e){res.statusCode=500;res.end('Test request failed');}});
await new Promise(r=>server.listen(0,'127.0.0.1',r));const url=`http://127.0.0.1:${server.address().port}`;
const browser=await chromium.launch({channel:process.env.BROWSER_CHANNEL||(process.platform==='win32'?'msedge':undefined),headless:true});
try{
  const context=await browser.newContext({viewport:{width:412,height:915}});
  await context.addInitScript(({user})=>localStorage.setItem('mantou-training-account',JSON.stringify({id:user,email:'synthetic@example.test'})),{user});
  const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto(url);await page.locator('#todayFeedback').waitFor();await page.evaluate(()=>navigator.serviceWorker.ready.then(()=>true));
  await page.locator('#todayFeedback').click();await page.locator('[data-meal=lunch]').click();
  const image=await page.evaluate(()=>{const c=document.createElement('canvas');c.width=640;c.height=480;const x=c.getContext('2d');x.fillStyle='#f4d9b1';x.fillRect(0,0,640,480);x.fillStyle='#537753';x.fillRect(80,80,250,250);return c.toDataURL('image/jpeg').split(',')[1];});
  await page.locator('#mealFile').setInputFiles({name:'meal.jpg',mimeType:'image/jpeg',buffer:Buffer.from(image,'base64')});
  await page.getByText('照片已同步；其他设备打开同一天即可查看',{exact:true}).waitFor();
  assert.equal(await page.locator('#mealGallery img').count(),1);
  await page.waitForFunction(()=>!document.getElementById('mealFile').disabled);
  await page.locator('#mealAmounts input').fill('剩半碗饭');await page.locator('#mealAmounts select').selectOption('part');
  await context.setOffline(true);
  await page.locator('[data-meal=dinner]').click();await page.locator('#mealFile').setInputFiles({name:'offline.jpg',mimeType:'image/jpeg',buffer:Buffer.from(image,'base64')});
  await page.locator('#mealGallery img').waitFor();await page.locator('#closeDialog').click();await page.reload();await page.locator('#todayFeedback').click();await page.locator('[data-meal=dinner]').click();await page.locator('#mealGallery img').waitFor();
  assert.match(await page.locator('#photoStatus').innerText(),/离线/);
  await context.setOffline(false);await page.locator('#retryPhotos').click();await page.getByText('照片已同步；其他设备打开同一天即可查看',{exact:true}).waitFor();await page.locator('#closeDialog').click();
  await page.waitForTimeout(1800);
  const second=await browser.newContext({viewport:{width:1024,height:768}});await second.addInitScript(({user})=>localStorage.setItem('mantou-training-account',JSON.stringify({id:user,email:'synthetic@example.test'})),{user});
  const tablet=await second.newPage();tablet.on('pageerror',e=>errors.push(e.message));await tablet.goto(url);await tablet.locator('#todayFeedback').click();await tablet.locator('[data-meal=lunch]').click();await tablet.locator('#mealGallery img').waitFor();assert.equal(await tablet.locator('#mealAmounts input').inputValue(),'剩半碗饭');
  tablet.once('dialog',d=>d.accept());await tablet.locator('#mealGallery button').click();await tablet.getByText('照片已同步；其他设备打开同一天即可查看',{exact:true}).waitFor();
  await page.locator('#todayFeedback').click();await page.locator('[data-meal=lunch]').click();await page.getByText('照片已同步；其他设备打开同一天即可查看',{exact:true}).waitFor();assert.equal(await page.locator('#mealGallery img').count(),0);
  await page.locator('[data-meal=dinner]').click();await page.locator('#mealGallery img').waitFor();await mkdir('test-output',{recursive:true});await page.screenshot({path:'test-output/meal-mobile.png',fullPage:true});
  await page.locator('#closeDialog').click();await page.locator('#quickReview').click();const downloadEvent=page.waitForEvent('download');await page.locator('#downloadTrialPhotos').click();const download=await downloadEvent;const zipped=unzipSync(await readFile(await download.path()));assert(Object.keys(zipped).some(k=>k.startsWith('photos/')));assert.match(strFromU8(zipped['复盘.md']),/剩半碗饭/);assert.match(strFromU8(zipped['复盘.md']),/餐次照片/);
  assert.deepEqual(errors,[]);console.log(`Browser + ${useDatabase?'isolated database':'memory storage'} PASS: photo upload, quantities, offline reload, two devices, deletion sync, ZIP review.`);await second.close();await context.close();
}finally{await browser.close();server.close();}
