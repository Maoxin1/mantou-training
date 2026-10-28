import {MealStore} from './meal-store.mjs';
import {MEALS,PHOTO_LIMIT,photoMeta,photoMarkdown,photoPath,validatePhoto} from './meal-core.mjs';
import {mealOwner,mealRequest} from './cloud.mjs';
import {dateOK,today} from './journal.mjs';
import {zipSync,unzipSync,strToU8,strFromU8} from './meal-zip.mjs';
const stores=new Map(),jobs=new Map();let activeDate=null;
export function mealStore(owner=mealOwner()){if(!stores.has(owner))stores.set(owner,new MealStore(owner));return stores.get(owner);}
const changed=()=>window.dispatchEvent(new Event('training:photos'));
export async function syncPhotos(date,owner=mealOwner()){
  if(owner==='guest'||!navigator.onLine)return;
  if(jobs.has(owner)){await jobs.get(owner);return syncPhotos(date,owner);}
  const task=(async()=>{
    const s=mealStore(owner);
    for(const p of (await s.all()).filter(x=>x.pending)){
      if(mealOwner()!==owner)throw Error('账号已切换');
      const r=await mealRequest(owner,p.deleted?'DELETE':'PUT',{date:p.date},p.deleted?photoMeta(p):validatePhoto(p));
      await s.acknowledge(p,r);
    }
    if(date){const r=await mealRequest(owner,'GET',{date});for(const p of r.photos)await s.accept(p);}
    changed();
  })();jobs.set(owner,task);
  try{await task;}finally{jobs.delete(owner);}
}
export async function compressPhoto(file){
  if(!file||!/^image\/(jpeg|png|webp)$/.test(file.type))throw Error('请选择JPEG、PNG或WebP照片；HEIC请先转成JPEG');
  if(file.size>25*1024*1024)throw Error('原照片超过25MB，请选择较小的图片');
  const bitmap=await createImageBitmap(file);let blob;
  try{
    let edge=1400;
    for(let attempt=0;attempt<5;attempt++){
      const scale=Math.min(1,edge/Math.max(bitmap.width,bitmap.height)),canvas=document.createElement('canvas');
      canvas.width=Math.max(1,Math.round(bitmap.width*scale));canvas.height=Math.max(1,Math.round(bitmap.height*scale));
      const ctx=canvas.getContext('2d');ctx.fillStyle='#fff';ctx.fillRect(0,0,canvas.width,canvas.height);ctx.drawImage(bitmap,0,0,canvas.width,canvas.height);
      blob=await new Promise(resolve=>canvas.toBlob(resolve,'image/jpeg',.8-attempt*.07));
      if(blob&&blob.size<=PHOTO_LIMIT)break;edge=Math.round(edge*.8);
    }
  }finally{bitmap.close();}
  if(!blob||blob.size>PHOTO_LIMIT)throw Error('照片压缩失败，请换一张照片');
  return new Promise((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(String(reader.result).split(',')[1]);reader.onerror=()=>reject(Error('照片读取失败'));reader.readAsDataURL(blob);});
}
export function mealPhotoSection(){return `<section class="meal-section"><div class="row"><b>用照片记一餐</b><button class="inline" id="retryPhotos" type="button">同步照片</button></div><p class="hint" id="photoStatus" role="status">正在读取本机照片…</p><div class="meal-tabs" role="group" aria-label="餐次">${Object.entries(MEALS).map(([k,v])=>`<button type="button" data-meal="${k}" aria-pressed="${k==='breakfast'}">${v}</button>`).join('')}</div><div id="mealGallery" class="meal-gallery"></div><div class="journal-actions"><label class="btn secondary file-label">拍照<input id="mealCamera" type="file" accept="image/jpeg,image/png,image/webp" capture="environment"></label><label class="btn secondary file-label">选照片<input id="mealFile" type="file" accept="image/jpeg,image/png,image/webp"></label></div><p class="hint">餐前整餐照；包装食品可另拍标签。每天最多12张。照片仅是参考，吃掉的份量请在下方补充。</p><div id="mealAmounts"></div></section>`;}
export function bindMealPhotos({date,getFields,saveFields,notify}){
  const owner=mealOwner(),s=mealStore(owner);let selected='breakfast',busy=false,disposed=false;
  activeDate=date;const status=document.getElementById('photoStatus'),gallery=document.getElementById('mealGallery'),amounts=document.getElementById('mealAmounts');
  const valid=()=>!disposed&&status.isConnected&&mealOwner()===owner;
  const fail=e=>{if(valid())status.textContent=e.message||'照片操作失败，本机副本保留';};
  async function draw(){
    const all=await s.all();if(!valid())return;gallery.replaceChildren();
    for(const p of all.filter(p=>p.date===date&&p.meal===selected&&!p.deleted)){
      const figure=document.createElement('figure'),img=document.createElement('img'),button=document.createElement('button'),caption=document.createElement('figcaption');
      img.src='data:image/jpeg;base64,'+p.data;img.alt=MEALS[selected]+'照片';img.loading='lazy';
      const view=document.createElement('a');view.href=img.src;view.download=`${date}-${selected}-${p.id}.jpg`;view.title='保存照片到设备';view.append(img);
      caption.textContent=p.pending?(owner==='guest'?'仅在本机':'待同步'):'已同步';button.type='button';button.className='inline';button.textContent='删除';button.onclick=async()=>{if(!valid())return;if(!confirm('删除这张餐次照片？联网后会同步删除。'))return;try{await s.remove(p.id);await draw();await refresh();}catch(e){fail(e);}};
      figure.append(view,caption,button);gallery.append(figure);
    }
    const n=all.filter(p=>p.pending).length;
    status.textContent=owner==='guest'?'未登录：照片只保存在此设备；登录后可在这里主动迁入。':!navigator.onLine?`离线：照片保存在此设备${n?'，'+n+'项待同步':''}`:n?`${n}项照片变更待同步`:'本机照片已保存 · 联网同步后其他设备可见';
    if(!gallery.children.length){const p=document.createElement('p');p.className='hint';p.textContent='这一餐还没有照片，也可以只写文字。';gallery.append(p);}
  }
  function drawAmounts(){
    amounts.replaceChildren();const f=getFields();
    for(const [suffix,title,values]of [['Amount','实际吃了多少',[['','未填写'],['all','全部吃完'],['part','吃了一部分'],['unknown','不确定']]],['Note','补充一句',null]]){
      const label=document.createElement('label');label.className='journal-field';label.textContent=title;
      const control=document.createElement(values?'select':'input'),key=selected+suffix;control.className='text-input';
      if(values)for(const [value,text]of values){const option=document.createElement('option');option.value=value;option.textContent=text;control.append(option);}else{control.maxLength=1000;control.placeholder='例如：剩半碗饭／又添半碗／包装260克吃了一半';}
      control.value=f[key]||'';control.oninput=()=>{if(valid())saveFields({[key]:control.value});};label.append(control);amounts.append(label);
    }
  }
  async function refresh(){if(!valid())return;try{await syncPhotos(date,owner);await draw();if(valid()&&owner!=='guest'&&navigator.onLine)status.textContent='照片已同步；其他设备打开同一天即可查看';}catch(e){fail(e);}}
  for(const b of document.querySelectorAll('[data-meal]'))b.onclick=()=>{selected=b.dataset.meal;document.querySelectorAll('[data-meal]').forEach(x=>x.setAttribute('aria-pressed',String(x===b)));drawAmounts();draw().catch(fail);};
  for(const input of [document.getElementById('mealCamera'),document.getElementById('mealFile')])input.onchange=async()=>{
    const file=input.files[0],meal=selected;input.value='';if(!file||busy||!valid())return;busy=true;
    const uploads=[document.getElementById('mealCamera'),document.getElementById('mealFile')];uploads.forEach(x=>x.disabled=true);
    try{status.textContent='正在压缩并保存照片…';const data=await compressPhoto(file);if(!valid())throw Error('页面或账号已切换，请重新添加照片');await s.add({id:crypto.randomUUID(),date,meal,data});saveFields({date});navigator.storage?.persist?.().catch(()=>{});await draw();await refresh();}catch(e){fail(e);notify(e.message);}finally{busy=false;uploads.forEach(x=>x.disabled=false);}
  };
  document.getElementById('retryPhotos').onclick=refresh;
  const listener=()=>{if(valid())draw().catch(fail);else dispose();};
  const dialog=document.getElementById('exerciseDialog');
  function dispose(){disposed=true;window.removeEventListener('training:photos',listener);dialog.removeEventListener('close',dispose);}
  window.addEventListener('training:photos',listener);dialog.addEventListener('close',dispose,{once:true});
  drawAmounts();draw().then(refresh).catch(fail);
  if(owner!=='guest')s.db.then(async()=>{
    const guest=(await mealStore('guest').all()).filter(p=>!p.deleted);if(!guest.length||!valid())return;
    const b=document.createElement('button');b.type='button';b.className='inline';b.textContent=`迁入此设备未登录时的${guest.length}张照片`;b.onclick=async()=>{if(!valid()||!confirm('将这些未登录照片复制到当前邮箱账号？原本机副本保留。'))return;try{for(const p of guest){if(mealOwner()!==owner)throw Error('账号已切换');if(!await s.get(p.id))await s.add(p);}b.remove();await refresh();}catch(e){fail(e);}};status.after(b);
  }).catch(fail);
}
async function collectPhotos(from,to){
  const owner=mealOwner(),s=mealStore(owner);let complete=true;
  if(owner!=='guest'&&navigator.onLine){try{await syncPhotos(null,owner);const {dates}=await mealRequest(owner,'GET',{index:'1'});for(const date of dates.filter(d=>(!from||d>=from)&&(!to||d<=to)))await syncPhotos(date,owner);}catch{complete=false;}}
  else if(owner!=='guest')complete=false;
  if(mealOwner()!==owner)throw Error('账号已切换，请重新导出');
  return {photos:(await s.all()).filter(p=>(!from||p.date>=from)&&(!to||p.date<=to)),complete};
}
export async function mealArchive({from,to,markdown='',records=null}={}){
  const {photos,complete}=await collectPhotos(from,to);
  if(!complete&&!confirm('当前无法核对全部云端照片，导出仅包含本机已缓存照片。继续？'))return null;
  const files={},manifest={version:1,complete,exported:new Date().toISOString(),photos:[]};
  for(const p of photos){if(p.deleted)continue;const path=photoPath(p);files[path]=Uint8Array.from(atob(p.data),c=>c.charCodeAt(0));manifest.photos.push({...photoMeta(p),path});}
  files['照片清单.json']=strToU8(JSON.stringify(manifest,null,2));
  files['复盘.md']=strToU8(markdown+(!complete?'\n> 本次离线／同步失败：照片可能不完整，仅导出设备缓存。\n':'')+photoMarkdown(photos));
  if(records)files['训练记录.json']=strToU8(JSON.stringify(records,null,2));
  return zipSync(files,{level:0});
}
export async function restoreMealArchive(file){
  if(file.size>100*1024*1024)throw Error('照片备份超过100MB，请分阶段恢复');
  let total=0;const files=unzipSync(new Uint8Array(await file.arrayBuffer()),{filter:f=>{total+=f.originalSize;if(total>120*1024*1024)throw Error('备份解压大小超限');return f.name==='照片清单.json'||/^photos\/[a-zA-Z0-9-]+\.jpg$/.test(f.name);}});
  if(!files['照片清单.json'])throw Error('没有找到训练卡照片清单');
  const manifest=JSON.parse(strFromU8(files['照片清单.json']));if(manifest.version!==1||!Array.isArray(manifest.photos)||manifest.photos.length>1000)throw Error('照片备份格式无效');
  const photos=manifest.photos.map(p=>{photoMeta(p);if(p.path!==photoPath(p)||!files[p.path]||files[p.path].length>PHOTO_LIMIT)throw Error('照片附件缺失或无效');let binary='';for(const b of files[p.path])binary+=String.fromCharCode(b);return validatePhoto({...p,data:btoa(binary)});});
  const owner=mealOwner();if(!confirm(`恢复${photos.length}张照片到${owner==='guest'?'本机未登录空间':'当前登录账号'}？已有照片和删除记录不会被覆盖；此入口只恢复照片，文字记录请使用JSON恢复。`))return;
  const s=mealStore(owner);for(const p of photos){if(mealOwner()!==owner)throw Error('账号已切换，已恢复的照片保留');if(!await s.get(p.id))await s.add(p);}await syncPhotos(activeDate,owner);changed();return photos.length;
}
window.addEventListener('online',()=>syncPhotos(activeDate).catch(()=>{}));
window.addEventListener('training:cloud-status',()=>{if(!document.querySelector('dialog[open]'))syncPhotos(null).catch(()=>{});});
document.addEventListener('visibilitychange',()=>{if(!document.hidden)syncPhotos(activeDate).catch(()=>{});});
window.addEventListener('storage',e=>{if(e.key==='mantou-training-account'){document.getElementById('exerciseDialog')?.close();changed();}});
