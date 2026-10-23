import test from 'node:test';import assert from 'node:assert/strict';
process.env.AUTH_URL='https://example.invalid/neondb/auth';
const {default:handler}=await import('../api/sync.mjs');
const res=()=>({code:0,headers:{},setHeader(k,v){this.headers[k]=v;},status(n){this.code=n;return this;},json(x){this.body=x;return this;}});
test('sync API denies anonymous GET and forged bearer before database access',async()=>{for(const authorization of [undefined,'Bearer unsigned.invalid.token']){const r=res();await handler({method:'GET',headers:{authorization}},r);assert.equal(r.code,401);assert.equal(r.headers['Cache-Control'],'no-store');}});
test('sync API rejects unexpected methods without touching data',async()=>{const r=res();await handler({method:'DELETE',headers:{}},r);assert.equal(r.code,405);assert.equal(r.headers.Allow,'GET, PUT');});
