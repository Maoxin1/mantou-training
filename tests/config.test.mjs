import test from 'node:test';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
const cwd=fileURLToPath(new URL('../',import.meta.url));

test('self-host build exposes only configured public URL and defaults to local-only mode',()=>{
  const env={...process.env,AUTH_URL:'https://example.invalid/neondb/auth',DATABASE_URL:'postgresql://test:DO_NOT_EXPOSE_THIS@db.invalid/neondb'};
  try{
    execFileSync(process.execPath,['scripts/build.mjs'],{cwd,env,stdio:'pipe'});
    const config=readFileSync(new URL('../dist/cloud-config.mjs',import.meta.url),'utf8');
    assert(config.includes('https://example.invalid/neondb/auth'));
    assert(!config.includes('DO_NOT_EXPOSE_THIS'));
    const empty={...env,AUTH_URL:''};
    execFileSync(process.execPath,['scripts/build.mjs'],{cwd,env:empty,stdio:'pipe'});
    assert.match(readFileSync(new URL('../dist/cloud-config.mjs',import.meta.url),'utf8'),/AUTH_URL=""/);
    const result=execFileSync(process.execPath,['--input-type=module','-e',"const {default:handler}=await import('./api/sync.mjs');const res={setHeader(){},status(n){this.code=n;return this},json(){return this}};await handler({method:'GET',headers:{}},res);process.stdout.write(String(res.code));"],{cwd,env:empty,encoding:'utf8'});
    assert.equal(result,'503');
  }finally{execFileSync(process.execPath,['scripts/build.mjs'],{cwd,env:process.env,stdio:'pipe'});}
});
