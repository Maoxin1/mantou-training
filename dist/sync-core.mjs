import {clone,validateBackup} from './engine.mjs';
const same=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
const copy=x=>x===undefined?undefined:clone(x);
// An exercise is atomic: its records, progression and validation must agree.
export function mergeStates(base,local,remote){
  local=validateBackup(local);remote=validateBackup(remote);base=base?validateBackup(base):null;
  const merged=clone(remote),conflicts=[];
  function choose(key,b,l,r,set){
    if(same(l,r)||same(l,b))set(r);
    else if(same(r,b))set(l);
    else {set(l);conflicts.push({key,local:copy(l),remote:copy(r)});}
  }
  for(const id of Object.keys(local.exercises))choose('exercise:'+id,base?.exercises[id],local.exercises[id],remote.exercises[id],x=>merged.exercises[id]=clone(x));
  merged.temporary={};
  for(const k of new Set([...Object.keys(local.temporary),...Object.keys(remote.temporary)])){
    choose('temporary:'+k,base?.temporary[k],local.temporary[k],remote.temporary[k],x=>{if(x!==undefined)merged.temporary[k]=x;});
  }
  merged.events=[...new Map([...remote.events,...local.events].map(x=>[JSON.stringify(x),x])).values()];
  return {merged:validateBackup(merged),conflicts};
}
export class SyncStore {
  constructor({storage,key,initial}){this.storage=storage;this.key=key;const raw=storage.getItem(key);this.data=raw?JSON.parse(raw):{local:validateBackup(initial),base:validateBackup(initial),revision:0,pending:true,conflict:null};this.data.local=validateBackup(this.data.local);}
  persist(next){this.storage.setItem(this.key,JSON.stringify(next));this.data=next;}
  edit(state){this.persist({...this.data,local:validateBackup(state),pending:true});}
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
    for(const item of c.conflicts){const side=choices[item.key];if(!['local','remote'].includes(side))throw Error('请为每个冲突选择版本');const value=item[side];if(item.key.startsWith('exercise:'))state.exercises[item.key.slice(9)]=clone(value);else {const k=item.key.slice(10);if(value===undefined)delete state.temporary[k];else state.temporary[k]=value;}}
    const archive=JSON.parse(this.storage.getItem(this.key+':conflict-archive')||'[]');
    archive.push({at:new Date().toISOString(),...c,choices});
    // Preserve both versions before resolving; a storage failure aborts resolution.
    this.storage.setItem(this.key+':conflict-archive',JSON.stringify(archive));
    this.persist({...this.data,local:validateBackup(state),base:clone(c.state),revision:c.revision,pending:true,conflict:null});
  }
}
