import {dateOK,today} from './journal.mjs';
export const MEALS={breakfast:'早餐',lunch:'午餐',dinner:'晚餐',snack:'加餐'};
export const PHOTO_LIMIT=180*1024;
export const PHOTO_ID=/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i;
// API servers can run in UTC. Accept the current calendar day in any real timezone;
// the journal UI still prevents future local dates.
export const latestPhotoDate=()=>new Date(Date.now()+14*3600000).toISOString().slice(0,10);
export function photoMeta(p){
  if(!p||!PHOTO_ID.test(p.id)||!dateOK(p.date)||p.date>latestPhotoDate()||!Object.hasOwn(MEALS,p.meal))throw Error('照片日期、餐次或标识无效');
  return {id:p.id,date:p.date,meal:p.meal};
}
export function validatePhoto(p){
  const meta=photoMeta(p);
  if(p.deleted)return {...meta,deleted:true};
  if(typeof p.data!=='string'||p.data.length>Math.ceil(PHOTO_LIMIT/3)*4||!/^\/9j\/[A-Za-z0-9+/]*={0,2}$/.test(p.data)||p.data.length%4!==0)throw Error('照片需为压缩后的JPEG，且不超过180KB');
  return {...meta,data:p.data,deleted:false};
}
// A remote deletion always wins, including against an old offline upload.
export function reconcilePhoto(local,remote){
  if(local?.deleted)return local;
  if(remote.deleted)return {...remote,pending:false};
  return local?.pending?local:{...remote,pending:false};
}
export const photoPath=p=>`photos/${p.date}-${p.meal}-${p.id}.jpg`;
export function photoMarkdown(photos){
  let text='\n## 餐次照片\n\n> 照片用于复盘，不是准确的热量测量。实际吃掉的份量以文字补充为准。\n\n';
  for(const p of photos.filter(p=>!p.deleted).sort((a,b)=>a.date.localeCompare(b.date)||a.meal.localeCompare(b.meal)))text+=`### ${p.date} · ${MEALS[p.meal]}\n\n![${MEALS[p.meal]}](${photoPath(p)})\n\n`;
  return text;
}
