import {chromium} from 'playwright';
import {spawn} from 'node:child_process';
import {readFile} from 'node:fs/promises';
import assert from 'node:assert/strict';
import {fresh} from '../dist/engine.mjs';
import {startTrial,writeEntry} from '../dist/journal.mjs';
// A remote target is exercised only in fresh, unsigned browser contexts with synthetic data.
const baseURL=(process.env.TRAINING_BASE_URL||'http://127.0.0.1:4188').replace(/\/$/,'');
const server=process.env.TRAINING_BASE_URL?null:spawn(process.execPath,['scripts/serve.mjs'],{env:{...process.env,PORT:'4188'},stdio:['ignore','pipe','pipe']});
if(server)await new Promise((resolve,reject)=>{server.stdout.once('data',resolve);server.once('error',reject);server.once('exit',()=>reject(Error('Test server exited')));});
let browser;
try{
  browser=await chromium.launch({channel:process.env.BROWSER_CHANNEL||(process.platform==='win32'?'msedge':undefined),headless:true});
  const context=await browser.newContext(),page=await context.newPage(),errors=[];
  page.on('pageerror',e=>errors.push(e.message));await page.goto(baseURL+'/');
  const broken='{"schema":99,"unreadable":"synthetic original"}';
  await page.evaluate(raw=>localStorage.setItem('mantou-training-v1',raw),broken);await page.reload();
  await page.locator('#startTrial').click();await page.locator('#startTrialForm button[type=submit]').click();
  assert.equal(await page.evaluate(()=>localStorage.getItem('mantou-training-v1')),broken);
  await page.locator('#closeDialog').click();const rawDownload=page.waitForEvent('download');await page.locator('#downloadRaw').click();
  assert.equal(await readFile(await(await rawDownload).path(),'utf8'),broken);
  const records=fresh();startTrial(records,{start:'2026-10-20'});writeEntry(records,'daily:2026-10-20','daily',{date:'2026-10-20',notes:'roundtrip synthetic'});
  await page.click('[data-page=export]');await page.locator('#importBackup').setInputFiles({name:'synthetic.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(records))});await page.locator('#confirmImport').click();
  assert(await page.evaluate(raw=>Object.keys(localStorage).some(k=>k.startsWith('mantou-training-v1:recovery:')&&localStorage.getItem(k)===raw),broken));
  assert.equal(await page.locator('#storageWarning').isVisible(),false);
  const photo={id:crypto.randomUUID(),date:'2026-10-20',meal:'lunch',data:Buffer.from([255,216,255,217]).toString('base64')};
  await page.evaluate(async p=>{const {mealStore}=await import('/meal-photos.mjs');await mealStore('guest').add(p);},photo);
  const archiveDownload=page.waitForEvent('download');await page.locator('#exportMealBackup').click();const archive=await readFile(await(await archiveDownload).path());
  const restored=await browser.newContext(),other=await restored.newPage();other.on('pageerror',e=>errors.push(e.message));await other.goto(baseURL+'/');await other.click('[data-page=export]');
  other.on('dialog',d=>d.accept());await other.locator('#restoreMealBackup').setInputFiles({name:'synthetic.zip',mimeType:'application/zip',buffer:archive});
  await other.waitForFunction(()=>JSON.parse(localStorage.getItem('mantou-training-v1')||'null')?.journal?.entries['daily:2026-10-20']?.fields.notes==='roundtrip synthetic');
  const photos=await other.evaluate(async()=>{const {mealStore}=await import('/meal-photos.mjs');return mealStore('guest').all();});assert.equal(photos.length,1);assert.equal(photos[0].data,photo.data);
  // Restore the same volume twice: preserve existing photos and keep a recovery snapshot.
  await other.locator('#restoreMealBackup').setInputFiles({name:'synthetic.zip',mimeType:'application/zip',buffer:archive});await other.waitForFunction(()=>Object.keys(localStorage).some(k=>k.startsWith('mantou-training-v1:recovery:')));
  await other.evaluate(()=>navigator.serviceWorker.ready.then(()=>true));await restored.setOffline(true);await other.reload();await other.locator('#beginSession').waitFor();
  assert.equal(await other.evaluate(()=>JSON.parse(localStorage.getItem('mantou-training-v1')).journal.entries['daily:2026-10-20'].fields.notes),'roundtrip synthetic');
  assert.deepEqual(errors,[]);await restored.close();await context.close();
  console.log('PASS: unreadable bytes protected, raw download, recovery snapshot, full ZIP restore, idempotence, offline reload');
}finally{await browser?.close();server?.kill();}
