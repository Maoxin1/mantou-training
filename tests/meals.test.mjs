import test from 'node:test';
import assert from 'node:assert/strict';
import {IDBFactory} from 'fake-indexeddb';
import {MealStore} from '../dist/meal-store.mjs';
import {validatePhoto,photoMarkdown,photoPath} from '../dist/meal-core.mjs';
import {createHandler,photoKey} from '../api/meals.mjs';
import {fresh,validateBackup} from '../dist/engine.mjs';
import {startTrial,writeEntry,trialMarkdown} from '../dist/journal.mjs';
const photo=()=>({id:crypto.randomUUID(),date:'2026-10-27',meal:'lunch',data:Buffer.from([255,216,255,224,0,0,255,217]).toString('base64')});
export function memoryStorage(){const data=new Map(),dead=new Set();return {data,dead,keys:async prefix=>[...data.keys()].map(k=>k+'.jpg').concat([...dead].map(k=>k+'.deleted')).filter(k=>k.startsWith(prefix)),isDeleted:async k=>dead.has(k),markDeleted:async k=>{dead.add(k);},removeImage:async k=>{data.delete(k);},putImage:async(k,b)=>{data.set(k,b);},list:async prefix=>[...new Set([...data.keys(),...dead])].filter(k=>k.startsWith(prefix)).map(k=>{const [date,meal,id]=k.split('/').slice(-3);return {id,date,meal,...(dead.has(k)?{deleted:true}:{deleted:false,data:data.get(k).toString('base64')})};})};}
export async function call(handler,{user='a',method='GET',query={date:'2026-10-27'},body}={}){
  const headers={};let code=200,result;await handler({method,query,body,headers:{'x-account-id':user}}, {setHeader:(k,v)=>headers[k]=v,status:n=>{code=n;return {json:x=>{result=x;}};}});return {code,result,headers};
}
test('photo validation excludes SVG, traversal, oversized images and future dates',()=>{
  assert.equal(validatePhoto(photo()).meal,'lunch');
  for(const changes of [{id:'../../other'},{date:'9999-01-01'},{meal:'__proto__'},{data:'<svg>'},{data:'/9j/'+ 'A'.repeat(300000)}])assert.throws(()=>validatePhoto({...photo(),...changes}));
});
test('offline photo survives reopening and is isolated by account',async()=>{
  const idb=new IDBFactory(),a=new MealStore('a',idb),p=photo();await a.add(p);
  const reloaded=new MealStore('a',idb),other=new MealStore('b',idb);
  assert.equal((await reloaded.get(p.id)).data,p.data);assert.equal((await reloaded.get(p.id)).pending,true);assert.deepEqual(await other.all(),[]);
});
test('delete while upload is in flight stays pending and cannot be resurrected',async()=>{
  const s=new MealStore('a',new IDBFactory()),p=photo();await s.add(p);const sent=await s.get(p.id);await s.remove(p.id);await s.acknowledge(sent,{deleted:false});assert.equal((await s.get(p.id)).deleted,true);assert.equal((await s.get(p.id)).pending,true);
  await s.accept(p);assert.equal((await s.get(p.id)).deleted,true);
  await s.acknowledge(await s.get(p.id),{deleted:true});assert.equal((await s.get(p.id)).pending,false);
});
test('remote deletion removes local cached image even when old upload is pending',async()=>{
  const s=new MealStore('a',new IDBFactory()),p=photo();await s.add(p);await s.accept({...p,deleted:true});const r=await s.get(p.id);assert.equal(r.deleted,true);assert.equal(r.data,undefined);assert.equal(r.pending,false);
});
test('private photo API denies unauthenticated access before touching storage',async()=>{
  let touched=false;const h=createHandler({verify:async()=>{throw Error();},storage:{list:()=>{touched=true;}}});const r=await call(h);assert.equal(r.code,401);assert.equal(touched,false);assert.equal(r.headers['Cache-Control'],'private, no-store');
});
test('API separates accounts, accepts retries, deletion wins over stale upload',async()=>{
  const storage=memoryStorage(),h=createHandler({verify:async r=>r.headers['x-account-id'],storage}),p=photo();
  assert.equal((await call(h,{method:'PUT',body:p})).code,200);
  assert.equal((await call(h,{method:'PUT',body:p})).code,200);assert.equal(storage.data.size,1);
  assert.equal((await call(h)).result.photos.length,1);assert.equal((await call(h,{user:'b'})).result.photos.length,0);
  await call(h,{user:'b',method:'DELETE',body:p});assert(storage.data.has(photoKey('a',p)));
  await call(h,{method:'DELETE',body:p});const stale=await call(h,{method:'PUT',body:p});assert.equal(stale.result.deleted,true);assert.equal(storage.data.size,0);assert.equal((await call(h)).result.photos[0].deleted,true);
});
test('daily photo cap preserves existing images and failed writes are explicit',async()=>{
  const storage=memoryStorage(),h=createHandler({verify:async()=> 'a',storage});for(let i=0;i<12;i++)assert.equal((await call(h,{method:'PUT',body:photo()})).code,200);
  assert.equal((await call(h,{method:'PUT',body:photo()})).code,409);assert.equal(storage.data.size,12);
  const broken=createHandler({verify:async()=> 'a',storage:{list:async()=>{throw Error('offline');}}});assert.equal((await call(broken)).code,503);
});
test('two devices retrieve same photo and retain pending deletions through offline',async()=>{
  const storage=memoryStorage(),h=createHandler({verify:async()=> 'a',storage}),a=new MealStore('a',new IDBFactory()),b=new MealStore('a',new IDBFactory()),p=photo();await a.add(p);
  const r=await call(h,{method:'PUT',body:p});await a.acknowledge(p,r.result);
  for(const p of (await call(h)).result.photos)await b.accept(p);assert.equal((await b.get(p.id)).data,p.data);
  await b.remove(p.id);await call(h,{method:'DELETE',body:p});for(const p of (await call(h)).result.photos)await a.accept(p);assert.equal((await a.get(p.id)).deleted,true);
});
test('meal feedback exports with quantities and observation window; photos use portable relative paths',()=>{
  const s=fresh(),id=startTrial(s,{start:'2026-10-27'});writeEntry(s,'daily:2026-10-27','daily',{date:'2026-10-27',feedbackScope:'morning',afternoonHunger:'',lunchAmount:'part',lunchNote:'剩半碗饭'});validateBackup(s);
  const md=trialMarkdown(s,id,'2026-10-27');assert.match(md,/截至早上/);assert.match(md,/下午饥饿：未填写/);assert.match(md,/剩半碗饭/);
  const p=photo();assert(photoMarkdown([p]).includes(photoPath(p)));assert(!photoMarkdown([{...p,deleted:true}]).includes(p.id));
});
