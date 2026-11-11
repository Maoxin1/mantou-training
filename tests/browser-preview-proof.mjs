import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {mkdir,readFile,writeFile} from 'node:fs/promises';
import {chromium} from 'playwright';
const base=process.env.TRAINING_BASE_URL;
assert(base,'Set TRAINING_BASE_URL to the isolated static preview');
assert(new URL(base).protocol==='https:');
const paths=['/index.html','/journal-ui.mjs','/style.css','/icons/icon-192.png','/sw.js','/update.mjs'];
const browser=await chromium.launch({channel:process.env.BROWSER_CHANNEL||(process.platform==='win32'?'msedge':undefined),headless:true});
try{
  const context=await browser.newContext(),page=await context.newPage();
  const response=await page.goto(base,{timeout:30000});assert.equal(response.status(),200);
  const headers=response.headers();assert.match(headers['content-security-policy'],/frame-ancestors 'none'/);assert.equal(headers['x-frame-options'],'DENY');
  const proof=await page.evaluate(async paths=>{
    const matches=[];
    for(const path of paths){const r=await fetch(path,{cache:'no-store'});const bytes=await r.arrayBuffer();const hash=[...new Uint8Array(await crypto.subtle.digest('SHA-256',bytes))].map(n=>n.toString(16).padStart(2,'0')).join('');matches.push({path,status:r.status,hash});}
    return {matches,config:await(await fetch('/cloud-config.mjs',{cache:'no-store'})).text(),apiStatus:(await fetch('/api/sync',{cache:'no-store'})).status};
  },paths);
  for(const item of proof.matches){assert.equal(item.status,200);assert.equal(item.hash,createHash('sha256').update(await readFile(new URL('../dist'+item.path,import.meta.url))).digest('hex'),item.path);}
  assert.match(proof.config,/AUTH_URL=""/);assert.equal(proof.apiStatus,404);
  const prod=await context.newPage();await prod.goto('https://mantou-training-offline.vercel.app/',{timeout:30000});
  const productionFooter=await prod.locator('footer').innerText();assert(productionFooter.endsWith('v2.4.0'));
  await mkdir('test-output',{recursive:true});await writeFile('test-output/train05-preview-proof.json',JSON.stringify({at:new Date().toISOString(),base,matches:proof.matches,localOnly:true,apiStatus:proof.apiStatus,productionFooter},null,2));
  console.log('PASS preview assets match local files, account config empty, no API functions, security headers; production remains 2.4.0');
}finally{await browser.close();}
