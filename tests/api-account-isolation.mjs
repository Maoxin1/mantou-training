// Actual handlers and SQL, locally signed identities. NOT a managed-auth/email test.
import assert from 'node:assert/strict';
import {once} from 'node:events';
import {readFile} from 'node:fs/promises';
import {createServer} from 'node:http';
import {createRequire} from 'node:module';
import {resolve} from 'node:path';
import {neonConfig} from '@neondatabase/serverless';
import {exportJWK,generateKeyPair,SignJWT} from 'jose';
import {fresh} from '../dist/engine.mjs';
import {writeEntry} from '../dist/journal.mjs';
assert(process.env.TRAINING_PGLITE_ROOT,'Set TRAINING_PGLITE_ROOT to the isolated PGlite installation');
const {PGlite}=createRequire(resolve(process.env.TRAINING_PGLITE_ROOT,'package.json'))('@electric-sql/pglite');
const db=await PGlite.create('memory://');
const {publicKey,privateKey}=await generateKeyPair('EdDSA');
const jwk={...await exportJWK(publicKey),kid:'isolation-fixture',alg:'EdDSA'};
const A=crypto.randomUUID(),B=crypto.randomUUID();
const parsers=Object.fromEntries([16,20,25,3802].map(oid=>[oid,v=>v]));
let origin,handlers={},sqlCalls=0;const errors=[];
const server=createServer(async(req,res)=>{
  const u=new URL(req.url,'http://127.0.0.1');
  const json=(n,x)=>{res.statusCode=n;res.setHeader('Content-Type','application/json');res.end(JSON.stringify(x));};
  try{
    if(u.pathname.endsWith('/.well-known/jwks.json'))return json(200,{keys:[jwk]});
    let raw='';for await(const chunk of req)raw+=chunk;req.body=raw?JSON.parse(raw):undefined;
    if(u.pathname==='/__sql'){
      sqlCalls++;const {query,params}=req.body;
      const r=await db.query(query,params,{rowMode:'array',parsers});return json(200,{...r,rowCount:r.affectedRows||r.rows.length});
    }
    if(!handlers[u.pathname])return json(404,{});
    req.query=Object.fromEntries(u.searchParams);
    const reply={setHeader:(...v)=>res.setHeader(...v),status(n){res.statusCode=n;return this;},json(x){json(res.statusCode,x);}};
    await handlers[u.pathname](req,reply);
  }catch(e){errors.push(e.message);json(500,{error:'fixture failure'});}
});
try{
  for(const name of ['001-training-sync.sql','002-meal-photos.sql'])await db.exec(await readFile(new URL('../migrations/'+name,import.meta.url),'utf8'));
  server.listen(0,'127.0.0.1');await once(server,'listening');origin='http://127.0.0.1:'+server.address().port;
  process.env.AUTH_URL=origin+'/neondb/auth';process.env.DATABASE_URL='postgresql://fixture:synthetic@db.example.invalid/fixture';
  neonConfig.fetchEndpoint=()=>origin+'/__sql';
  handlers={'/api/sync':(await import('../api/sync.mjs')).default,'/api/meals':(await import('../api/meals.mjs')).default};
  const sign=(user,{issuer=origin,audience=origin,expiry='10m',role='authenticated',banned=false}={})=>new SignJWT({email:user+'@example.invalid',role,banned}).setProtectedHeader({alg:'EdDSA',kid:jwk.kid}).setSubject(user).setIssuer(issuer).setAudience(audience).setIssuedAt().setExpirationTime(expiry).sign(privateKey);
  const tokens={[A]:await sign(A),[B]:await sign(B)};
  const call=async(user,path,{method='GET',body,token=tokens[user],account=user}={})=>{
    const r=await fetch(origin+path,{method,headers:{Authorization:'Bearer '+token,'X-Account-Id':account,'Content-Type':'application/json'},...(body?{body:JSON.stringify(body)}:{})});
    assert.match(r.headers.get('cache-control'),/no-store/);return {status:r.status,data:await r.json()};
  };
  const sA=fresh(),sB=fresh();
  writeEntry(sA,'daily:2026-11-01','daily',{date:'2026-11-01',notes:'A private marker'});
  writeEntry(sB,'daily:2026-11-01','daily',{date:'2026-11-01',notes:'B private marker'});
  for(const [user,state] of [[A,sA],[B,sB]])assert.equal((await call(user,'/api/sync',{method:'PUT',body:{revision:0,state}})).status,200);
  for(const [user,marker]of [[A,'A private marker'],[B,'B private marker']])assert.equal((await call(user,'/api/sync')).data.state.journal.entries['daily:2026-11-01'].fields.notes,marker);
  const before=sqlCalls;
  for(const token of [tokens[A],await sign(A,{expiry:'-1s'}),await sign(A,{issuer:'https://wrong.invalid'}),await sign(A,{audience:'wrong'}),await sign(A,{role:'anonymous'}),await sign(A,{banned:true}),'forged']){
    const account=token===tokens[A]?B:A;
    for(const [path,method]of [['/api/sync','GET'],['/api/sync','PUT'],['/api/meals?index=1','GET'],['/api/meals?date=2026-11-01','PUT'],['/api/meals?date=2026-11-01','DELETE']])assert.equal((await call(A,path,{method,token,account,body:method==='GET'?undefined:{}})).status,401);
  }
  assert.equal(sqlCalls,before,'rejected identities never reach SQL');
  const p={date:'2026-11-01',meal:'lunch',id:crypto.randomUUID(),data:Buffer.from([255,216,255,217]).toString('base64')};
  assert.equal((await call(B,'/api/meals?date='+p.date,{method:'PUT',body:p})).status,200);
  assert.deepEqual((await call(A,'/api/meals?index=1')).data.dates,[]);
  assert.deepEqual((await call(A,'/api/meals?date='+p.date)).data.photos,[]);
  const bPhotos=(await call(B,'/api/meals?date='+p.date)).data.photos;assert.equal(bPhotos.length,1);
  assert.equal((await call(A,'/api/meals?date='+p.date,{method:'DELETE',body:p})).status,200,'same ID belongs to a separate namespace');
  assert.deepEqual((await call(B,'/api/meals?date='+p.date)).data.photos,bPhotos,'A cannot delete B photo by guessing its ID');
  assert.equal((await call(A,'/api/meals?date='+p.date,{method:'PUT',body:p})).data.deleted,true,'A tombstone only applies to A');
  assert.deepEqual((await call(B,'/api/meals?date='+p.date)).data.photos,bPhotos);
  assert.equal((await call(A,'/api/sync',{method:'PUT',body:{revision:0,state:sB}})).status,409);
  assert.equal((await call(B,'/api/sync')).data.revision,1,'A conflict cannot change B revision');
  const r=await Promise.all([1,2].map(()=>call(A,'/api/sync',{method:'PUT',body:{revision:1,state:sA}})));
  assert.deepEqual(r.map(x=>x.status).sort(),[200,409],'concurrent same-version writes: one commit, one conflict');
  assert.equal((await call(A,'/api/sync')).data.revision,2);assert.equal((await call(B,'/api/sync')).data.revision,1);
  assert.deepEqual(errors,[]);
  console.log('PASS T05-M05: signed A/B, actual handlers + PGlite SQL; own reads/writes, 35 identity rejection requests before SQL, photo/index/delete isolation, stale and concurrent revision conflicts. Not managed email authentication.');
}finally{await new Promise(resolve=>server.close(resolve));await db.close();}
