import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
test('T05-R09: static shell blocks framing, inline scripts, objects and MIME sniffing',()=>{
  const config=JSON.parse(readFileSync(new URL('../vercel.json',import.meta.url)));
  const headers=Object.fromEntries((config.headers.find(x=>x.source==='/(.*)')?.headers||[]).map(x=>[x.key.toLowerCase(),x.value]));
  assert.equal(headers['x-frame-options'],'DENY');
  assert.equal(headers['x-content-type-options'],'nosniff');
  assert.equal(headers['referrer-policy'],'no-referrer');
  const policy=headers['content-security-policy'];
  for(const directive of ["script-src 'self'","object-src 'none'","frame-ancestors 'none'","base-uri 'self'"])assert(policy.includes(directive));
  assert(!/script-src[^;]*unsafe-inline/.test(policy));
});
test('T05-R09: update entry uses an external same-origin script compatible with CSP',()=>{
  const update=readFileSync(new URL('../dist/update.html',import.meta.url),'utf8');
  assert.match(update,/<script type="module" src="update\.mjs"><\/script>/);
  assert(!update.includes('b.onclick='));
});
