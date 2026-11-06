import {validatePhoto,reconcilePhoto} from './meal-core.mjs';
export class MealStore {
  constructor(owner,idb=globalThis.indexedDB){
    this.owner=owner;
    this.db=new Promise((resolve,reject)=>{const r=idb.open('mantou-meal-photos-v1',1);r.onupgradeneeded=()=>r.result.createObjectStore('photos',{keyPath:'key'});r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(Error('照片存储不可用，请检查浏览器存储权限'));});
  }
  async run(mode,fn){const db=await this.db;return new Promise((resolve,reject)=>{const tx=db.transaction('photos',mode);let result;try{result=fn(tx.objectStore('photos'));}catch(e){reject(e);return;}tx.oncomplete=()=>resolve(result?.result);tx.onabort=tx.onerror=()=>reject(Error('照片未保存：设备空间不足或存储不可用'));});}
  key(id){return `${this.owner}:${id}`;}
  async all(){return (await this.run('readonly',s=>s.getAll())).filter(p=>p.owner===this.owner);}
  async get(id){return this.run('readonly',s=>s.get(this.key(id)));}
  async put(p){const clean=validatePhoto(p);return this.run('readwrite',s=>s.put({...clean,owner:this.owner,key:this.key(p.id),pending:!!p.pending}));}
  async add(p){const all=await this.all();if(all.filter(x=>x.date===p.date&&!x.deleted).length>=12)throw Error('每天最多12张照片');await this.put({...p,pending:true});}
  async remove(id){const p=await this.get(id);if(p)await this.put({...p,deleted:true,pending:true});}
  async restore(photos){
    const clean=photos.map(validatePhoto),db=await this.db;
    return new Promise((resolve,reject)=>{
      const tx=db.transaction('photos','readwrite'),s=tx.objectStore('photos'),read=s.getAll();let added=0,message;
      read.onsuccess=()=>{try{
        const existing=read.result.filter(p=>p.owner===this.owner),ids=new Set(existing.map(p=>p.id)),counts=new Map();
        for(const p of existing)if(!p.deleted)counts.set(p.date,(counts.get(p.date)||0)+1);
        for(const p of clean){if(ids.has(p.id))continue;ids.add(p.id);if(!p.deleted){const n=(counts.get(p.date)||0)+1;if(n>12)throw Error('恢复后某天照片超过12张，请先处理该日期；本卷未写入');counts.set(p.date,n);}s.put({...p,key:this.key(p.id),owner:this.owner,pending:true});added++;}
      }catch(e){message=e.message;tx.abort();}};
      tx.oncomplete=()=>resolve(added);tx.onabort=tx.onerror=()=>reject(Error(message||'照片恢复未完成：设备空间不足或存储不可用；本卷未写入'));
    });
  }
  async accept(remote){
    // Read and merge in ONE transaction: deletion during an upload must not be undone.
    const db=await this.db;return new Promise((resolve,reject)=>{const tx=db.transaction('photos','readwrite'),s=tx.objectStore('photos'),get=s.get(this.key(remote.id));get.onsuccess=()=>{const p=reconcilePhoto(get.result,validatePhoto(remote));s.put({...p,owner:this.owner,key:this.key(p.id)});};tx.oncomplete=resolve;tx.onerror=()=>reject(tx.error);});
  }
  async acknowledge(sent,reply){
    const db=await this.db;return new Promise((resolve,reject)=>{const tx=db.transaction('photos','readwrite'),s=tx.objectStore('photos'),get=s.get(this.key(sent.id));get.onsuccess=()=>{const current=get.result;if(!current)return;if(current.deleted&&!sent.deleted)return;const p=reply.deleted?validatePhoto({...sent,deleted:true}):validatePhoto(current);s.put({...p,owner:this.owner,key:this.key(p.id),pending:false});};tx.oncomplete=resolve;tx.onerror=()=>reject(tx.error);});
  }
}
