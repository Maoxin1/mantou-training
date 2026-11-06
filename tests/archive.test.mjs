import test from 'node:test';
import assert from 'node:assert/strict';
import {IDBFactory} from 'fake-indexeddb';
import {buildArchives,readArchive,encodeBackup,ARCHIVE_LIMIT} from '../dist/archive-core.mjs';
import {MealStore} from '../dist/meal-store.mjs';
import {fresh,validateBackup} from '../dist/engine.mjs';
import {writeEntry} from '../dist/journal.mjs';
import {zipSync,strToU8} from 'fflate';
const photo=(date='2026-10-20')=>({id:crypto.randomUUID(),date,meal:'lunch',data:Buffer.from([255,216,255,217]).toString('base64')});
test('backup roundtrip restores text and photos into fresh storage and is idempotent',async()=>{
  const records=fresh();writeEntry(records,'daily:2026-10-20','daily',{date:'2026-10-20',notes:'synthetic'});
  const photos=[photo(),photo()],parts=buildArchives({photos,records,complete:true});assert.equal(parts.length,1);
  const restored=readArchive(parts[0].data);assert.deepEqual(restored.records,records);assert.deepEqual(restored.photos,photos.map(p=>({...p,deleted:false})));
  const store=new MealStore('new-account',new IDBFactory());assert.equal(await store.restore(restored.photos),2);assert.equal(await store.restore(restored.photos),0);assert.equal((await store.all()).length,2);
});
test('more than 1000 photos export as individually restorable volumes without dropping text',async()=>{
  const photos=Array.from({length:1001},(_,i)=>photo(new Date(Date.UTC(2026,0,1+Math.floor(i/12))).toISOString().slice(0,10))),records=fresh();
  const parts=buildArchives({photos,records,complete:true});assert.equal(parts.length,2);const restored=parts.flatMap(p=>{assert(p.data.length<=ARCHIVE_LIMIT);const parsed=readArchive(p.data);assert.deepEqual(parsed.records,validateBackup(records));assert.equal(parsed.manifest.parts,2);return parsed.photos;});
  assert.deepEqual(restored.map(p=>p.id),photos.map(p=>p.id));const store=new MealStore('fresh',new IDBFactory());for(const part of parts)await store.restore(readArchive(part.data).photos);assert.equal((await store.all()).length,1001);
});
test('photo restore is atomic on daily cap and retains tombstones and other accounts',async()=>{
  const idb=new IDBFactory(),store=new MealStore('a',idb),other=new MealStore('b',idb),existing=photo();await store.add(existing);await store.remove(existing.id);await other.add(photo());
  assert.equal(await store.restore([existing]),0);assert((await store.get(existing.id)).deleted);
  await assert.rejects(store.restore(Array.from({length:13},()=>photo())),/超过12张/);assert.equal((await store.all()).length,1);assert.equal((await other.all()).length,1);
});
test('legacy photo-only ZIP remains readable; invalid text aborts before storage writes',()=>{
  const parts=buildArchives({photos:[photo()],complete:true});assert.equal(readArchive(parts[0].data).records,null);
  const bad=zipSync({'照片清单.json':strToU8(JSON.stringify({version:1,photos:[]})),'训练记录.json':strToU8('{"schema":999}')});assert.throws(()=>readArchive(bad));
});
test('oversized text cannot generate a ZIP or JSON that the application cannot restore',()=>{
  const state=fresh();state.events.push({synthetic:'x'.repeat(5*1024*1024)});
  assert.throws(()=>encodeBackup(state),/5MB/);assert.throws(()=>buildArchives({photos:[],records:state,complete:true}),/5MB/);
});
