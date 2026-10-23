import {clone,validateBackup} from './engine.mjs';
const stable=x=>x&&typeof x==='object'?(Array.isArray(x)?x.map(stable):Object.fromEntries(Object.keys(x).sort().map(k=>[k,stable(x[k])]))):x;
const same=(a,b)=>JSON.stringify(stable(a))===JSON.stringify(stable(b));
const copy=x=>x===undefined?undefined:clone(x);
// Facts merge independently; plan conflicts never discard unrelated training dates.
const plan=e=>{const {records,...p}=e;return p;};
const settings=e=>{const {records,changes,validation,...p}=e;return p;};
const recordFact=r=>{if(!r)return r;const {id,logged,outcome,...fact}=r;return fact;};
function records(a,b,base=[]){const left=new Map(a.map(r=>[r.date,r])),right=new Map(b.map(r=>[r.date,r])),before=new Map(base.map(r=>[r.date,r]));let conflict=false;const rows=[];for(const date of new Set([...left.keys(),...right.keys()])){const l=left.get(date),r=right.get(date),old=before.get(date);let picked;if(!l)picked=r;else if(!r)picked=l;else if(same(recordFact(l),recordFact(r))||same(recordFact(l),recordFact(old)))picked=r;else if(same(recordFact(r),recordFact(old)))picked=l;else{picked=l;conflict=true;}rows.push(clone(picked));}return {rows:rows.sort((a,b)=>a.date.localeCompare(b.date)),conflict};}
export function mergeStates(base,local,remote){
  local=validateBackup(local);remote=validateBackup(remote);base=base?validateBackup(base):null;
  const merged=clone(remote),conflicts=[];
  function choose(key,b,l,r,set){
    if(same(l,r)||same(l,b))set(r);
    else if(same(r,b))set(l);
    else {set(l);conflicts.push({key,local:copy(l),remote:copy(r)});}
  }
  for(const id of Object.keys(local.exercises)){
    const l=local.exercises[id],r=remote.exercises[id],b=base?.exercises[id],facts=records(l.records,r.records,b?.records);
    if(facts.conflict){merged.exercises[id]={...clone(l),records:facts.rows};conflicts.push({key:'exercise:'+id,local:clone(l),remote:clone(r)});continue;}
    const history=new Map(r.changes.map(c=>[c.id,c]));
    const historyConflict=l.changes.some(c=>history.has(c.id)&&!same(c,history.get(c.id)));
    if(same(settings(l),settings(r))&&!historyConflict){
      for(const c of l.changes)history.set(c.id,c);
      merged.exercises[id]={...clone(r),records:facts.rows,changes:[...history.values()].sort((a,b)=>a.at.localeCompare(b.at)),validation:same(l.validation,r.validation)||same(r.validation,b?.validation)?clone(l.validation):same(l.validation,b?.validation)?clone(r.validation):null};
      if(b&&!same(l.records,b.records)&&!same(r.records,b.records)&&!same(l.records,r.records))merged.exercises[id].validation=null;
      continue;
    }
    choose('exercise:'+id,b&&plan(b),plan(l),plan(r),x=>merged.exercises[id]={...clone(x),records:facts.rows});
    if(b&&!same(l.records,b.records)&&!same(r.records,b.records)&&!same(l.records,r.records))merged.exercises[id].validation=null;
    const item=conflicts.at(-1);if(item?.key==='exercise:'+id){item.local={...clone(l),records:facts.rows};item.remote={...clone(r),records:facts.rows};item.local.validation=null;item.remote.validation=null;}
  }
  merged.temporary={};
  for(const k of new Set([...Object.keys(local.temporary),...Object.keys(remote.temporary)])){
    choose('temporary:'+k,base?.temporary[k],local.temporary[k],remote.temporary[k],x=>{if(x!==undefined)merged.temporary[k]=x;});
  }
  merged.events=[...new Map([...remote.events,...local.events].map(x=>[JSON.stringify(x),x])).values()];
  return {merged:validateBackup(merged),conflicts};
}
export class SyncStore {
  constructor({storage,key,initial}){this.storage=storage;this.key=key;const raw=storage.getItem(key);this.data=raw?JSON.parse(raw):{local:validateBackup(initial),base:validateBackup(initial),revision:0,pending:true,conflict:null};this.data.local=validateBackup(this.data.local);this.raw=raw;}
  persist(next){const raw=this.storage.getItem(this.key);if(raw!==this.raw)throw Error('另一个窗口已更新记录，请刷新后重试；当前输入尚未保存。');const serialized=JSON.stringify(next);this.storage.setItem(this.key,serialized);this.raw=serialized;this.data=next;}
  edit(state){const next=validateBackup(state);let conflict=this.data.conflict;if(conflict){const m=mergeStates(this.data.base,next,conflict.state);conflict=m.conflicts.length?{...conflict,...m}:null;}this.persist({...this.data,local:next,pending:true,conflict});}
  import(state){const incoming=validateBackup(state),current=clone(this.data.local),m=mergeStates(null,incoming,current);this.storage.setItem(this.key+':before-import',JSON.stringify(this.data));this.persist({...this.data,local:m.merged,pending:true,conflict:m.conflicts.length?{state:current,revision:this.data.revision,...m}:null});}
  async sync(transport){
    if(this.running)return;this.running=true;
    try{
      for(let tries=0;tries<4;tries++){
        const remote=await transport('GET');
        // Read latest local AFTER network awaits; never erase a just-saved edit.
        let local=this.data.local,merged=local,conflicts=[];
        if(remote.state)({merged,conflicts}=mergeStates(this.data.base,local,remote.state));
        if(conflicts.length){this.persist({...this.data,conflict:{...remote,merged,conflicts},pending:true});return 'conflict';}
        if(remote.state&&same(merged,remote.state)){
          this.persist({...this.data,local:merged,base:clone(merged),revision:remote.revision,pending:false,conflict:null});return 'synced';
        }
        const sent=clone(merged),response=await transport('PUT',{revision:remote.revision,state:sent});
        if(response.conflict)continue;
        // Rebase edits made while uploading onto the acknowledged snapshot.
        const latest=this.data.local;
        const rebase=same(latest,local)?{merged:sent,conflicts:[]}:mergeStates(local,latest,sent);
        if(rebase.conflicts.length){this.persist({...this.data,base:sent,revision:response.revision,pending:true,conflict:{state:sent,revision:response.revision,...rebase}});return 'conflict';}
        const rebased=rebase.merged;
        const pending=!same(rebased,sent);
        this.persist({...this.data,local:rebased,base:sent,revision:response.revision,pending,conflict:null});
        if(!pending)return 'synced';
      }
      return 'pending';
    }finally{this.running=false;}
  }
  resolve(choices){
    const c=this.data.conflict;if(!c)throw Error('没有待处理的冲突');const state=clone(c.merged);
    for(const item of c.conflicts){const side=choices[item.key];if(!['local','remote'].includes(side))throw Error('请为每个冲突选择版本');const value=item[side];if(item.key.startsWith('exercise:'))state.exercises[item.key.slice(9)]={...clone(value),records:records(value.records,(side==='local'?item.remote:item.local).records).rows};else {const k=item.key.slice(10);if(value===undefined)delete state.temporary[k];else state.temporary[k]=value;}}
    const archive=JSON.parse(this.storage.getItem(this.key+':conflict-archive')||'[]');
    archive.push({at:new Date().toISOString(),...c,choices});
    // Preserve both versions before resolving; a storage failure aborts resolution.
    this.storage.setItem(this.key+':conflict-archive',JSON.stringify(archive));
    this.persist({...this.data,local:validateBackup(state),base:clone(c.state),revision:c.revision,pending:true,conflict:null});
  }
}
