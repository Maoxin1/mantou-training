import {copy,emptyJournal,validateJournal} from './journal.mjs';
const stable=x=>x&&typeof x==='object'?(Array.isArray(x)?x.map(stable):Object.fromEntries(Object.keys(x).sort().map(k=>[k,stable(x[k])]))):x;
const same=(a,b)=>JSON.stringify(stable(a))===JSON.stringify(stable(b));
const clone=x=>x===undefined?undefined:copy(x);
export function setJournalPath(j,path,value){let parent=j;for(const k of path.slice(0,-1)){if(!parent[k])parent[k]={};parent=parent[k];}const key=path.at(-1);if(value===undefined)delete parent[key];else parent[key]=clone(value);}
export function mergeJournal(base,left,right){
  const b=validateJournal(base),l=validateJournal(left),r=validateJournal(right),merged=emptyJournal(),conflicts=[];
  const choose=(path,old,a,z,label)=>{let pick;if(same(a,z)||same(a,old))pick=z;else if(same(z,old))pick=a;else{pick=a;conflicts.push({key:'journal:'+JSON.stringify(path),label,local:clone(a),remote:clone(z)});}setJournalPath(merged,path,pick);};
  for(const id of new Set([...Object.keys(l.trials),...Object.keys(r.trials)])){
    const a=l.trials[id],z=r.trials[id],old=b.trials[id];if(!a||!z){merged.trials[id]=clone(a||z);continue;}
    merged.trials[id]={};for(const k of new Set([...Object.keys(a),...Object.keys(z)])){
      if(k==='changes'){const history=new Map([...z.changes,...a.changes].map(c=>[c.id,c]));merged.trials[id].changes=[...history.values()].sort((x,y)=>x.at.localeCompare(y.at));}
      else choose(['trials',id,k],old?.[k],a[k],z[k],`试行阶段 ${a.start} · ${k==='plan'?'下一次训练安排':k}`);
    }
  }
  for(const id of new Set([...Object.keys(l.entries),...Object.keys(r.entries)])){
    const a=l.entries[id],z=r.entries[id],old=b.entries[id];if(!a||!z){merged.entries[id]=clone(a||z);continue;}
    const changed=(x,y)=>!same(x?.fields,y?.fields)||x?.deleted!==y?.deleted;
    if(a.deleted!==z.deleted&&((a.deleted&&!z.deleted&&changed(z,old))||(z.deleted&&!a.deleted&&changed(a,old)))){
      choose(['entries',id],old,a,z,`${a.fields.date||z.fields.date||'动作'} · 删除与编辑存在分歧`);continue;
    }
    merged.entries[id]={id,kind:a.kind,created:[a.created,z.created].sort()[0],updated:[a.updated,z.updated].sort().at(-1),deleted:a.deleted||z.deleted,fields:{}};
    for(const k of new Set([...Object.keys(a.fields),...Object.keys(z.fields)]))choose(['entries',id,'fields',k],old?.fields[k],a.fields[k],z.fields[k],`${a.fields.date||z.fields.date||'动作反馈'} · ${k}`);
  }
  for(const k of new Set([...Object.keys(l.settings),...Object.keys(r.settings)]))choose(['settings',k],b.settings[k],l.settings[k],r.settings[k],'当前试行阶段');
  return {merged:validateJournal(merged),conflicts};
}
export function resolveJournalConflict(j,item,side){if(!item.key.startsWith('journal:'))return false;const path=JSON.parse(item.key.slice(8));if(!Array.isArray(path)||path.some(k=>['__proto__','prototype','constructor'].includes(k)))throw Error('无效记录冲突');setJournalPath(j,path,item[side]);return true;}
