import {zipSync,unzipSync,strToU8,strFromU8} from './meal-zip.mjs';
import {photoMeta,photoPath,photoMarkdown,validatePhoto,PHOTO_LIMIT} from './meal-core.mjs';
import {validateBackup} from './engine.mjs';

export const ARCHIVE_LIMIT=100*1024*1024,EXPANDED_LIMIT=120*1024*1024,PHOTO_COUNT=1000;
const TEXT_LIMIT=5*1024*1024,PART_BYTES=64*1024*1024;
export function encodeBackup(records){
  const text=strToU8(JSON.stringify(validateBackup(records),null,2));
  if(text.length>TEXT_LIMIT)throw Error('文字记录超过5MB，未生成超出恢复上限的备份；原记录保留');
  return text;
}
export function buildArchives({photos,complete,markdown='',records=null}){
  const text=records?encodeBackup(records):null;
  const groups=[[]];let bytes=0;
  for(const photo of photos.filter(p=>!p.deleted)){
    const p=validatePhoto(photo),size=p.data.length*3/4;
    if(groups.at(-1).length>=PHOTO_COUNT||bytes+size>PART_BYTES){groups.push([]);bytes=0;}
    groups.at(-1).push(p);bytes+=size;
  }
  const backupId=crypto.randomUUID();
  return groups.map((group,i)=>{
    const files={},manifest={version:1,complete,backupId,part:i+1,parts:groups.length,exported:new Date().toISOString(),photos:[]};
    for(const p of group){const path=photoPath(p);files[path]=Uint8Array.from(atob(p.data),c=>c.charCodeAt(0));manifest.photos.push({...photoMeta(p),path});}
    files['照片清单.json']=strToU8(JSON.stringify(manifest,null,2));
    files['复盘.md']=strToU8(markdown+(!complete?'\n> 照片可能不完整，仅包含设备已缓存内容。\n':'')+photoMarkdown(group));
    if(text)files['训练记录.json']=text;
    if(Object.values(files).reduce((n,f)=>n+f.length,0)>EXPANDED_LIMIT)throw Error('备份内容超过恢复上限，请缩小导出范围');
    const data=zipSync(files,{level:0});if(data.length>ARCHIVE_LIMIT)throw Error('备份超过恢复上限，请缩小导出范围');
    return {data,part:i+1,parts:groups.length,photoCount:group.length};
  });
}
export function readArchive(bytes){
  if(bytes.length>ARCHIVE_LIMIT)throw Error('备份超过100MB，请选择分卷文件');
  let total=0;const files=unzipSync(bytes,{filter:f=>{
    total+=f.originalSize;if(total>EXPANDED_LIMIT)throw Error('备份解压大小超限');
    if(f.name==='训练记录.json'&&f.originalSize>TEXT_LIMIT)throw Error('文字记录超过5MB');
    return ['照片清单.json','训练记录.json'].includes(f.name)||/^photos\/[a-zA-Z0-9-]+\.jpg$/.test(f.name);
  }});
  if(!files['照片清单.json'])throw Error('没有找到训练卡照片清单');
  const manifest=JSON.parse(strFromU8(files['照片清单.json']));
  if(manifest.version!==1||!Array.isArray(manifest.photos)||manifest.photos.length>PHOTO_COUNT)throw Error('照片备份格式无效');
  const ids=new Set();const photos=manifest.photos.map(p=>{
    photoMeta(p);if(ids.has(p.id)||p.path!==photoPath(p)||!files[p.path]||files[p.path].length>PHOTO_LIMIT)throw Error('照片附件重复、缺失或无效');ids.add(p.id);
    let binary='';for(const b of files[p.path])binary+=String.fromCharCode(b);
    return validatePhoto({...p,data:btoa(binary)});
  });
  const records=files['训练记录.json']?validateBackup(JSON.parse(strFromU8(files['训练记录.json']))):null;
  return {manifest,photos,records};
}
