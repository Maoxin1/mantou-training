import {createRemoteJWKSet,jwtVerify} from 'jose';
import {neon} from '@neondatabase/serverless';
import {photoMeta,validatePhoto,PHOTO_LIMIT} from '../dist/meal-core.mjs';
import {dateOK,today} from '../dist/journal.mjs';
const authURL=(process.env.AUTH_URL||'').trim().replace(/\/$/,'');
const jwks=authURL?createRemoteJWKSet(new URL(authURL+'/.well-known/jwks.json')):null;
export async function authenticate(req){
  if(!jwks)throw Error('AUTH');
  const token=/^Bearer (\S+)$/.exec(req.headers.authorization||'')?.[1];
  if(!token)throw Error('AUTH');
  const origin=new URL(authURL).origin;
  const {payload:p}=await jwtVerify(token,jwks,{issuer:origin,audience:origin,algorithms:['EdDSA']});
  if(!p.sub||p.role!=='authenticated'||p.banned||typeof p.email!=='string'||req.headers['x-account-id']!==p.sub)throw Error('AUTH');
  return p.sub;
}
export function photoKey(user,p){return `accounts/${encodeURIComponent(user)}/${p.date}/${p.meal}/${p.id}`;}
export function createHandler({verify=authenticate,storage}={}){
  return async(req,res)=>{
    res.setHeader('Cache-Control','private, no-store');res.setHeader('X-Content-Type-Options','nosniff');
    if(!['GET','PUT','DELETE'].includes(req.method))return res.status(405).json({error:'Method not allowed'});
    let user;try{user=await verify(req);}catch{return res.status(401).json({error:'请联网登录原邮箱；照片仍保留本机'});}
    try{
      const s=storage||databaseStorage(user);
      if(req.method==='GET'&&req.query?.index==='1')return res.status(200).json({dates:[...new Set((await s.keys(`accounts/${encodeURIComponent(user)}/`)).map(k=>k.split('/')[2]))].sort()});
      const date=req.query?.date;
      if(!dateOK(date)||date>today())return res.status(400).json({error:'无效照片日期'});
      const prefix=`accounts/${encodeURIComponent(user)}/${date}/`;
      if(req.method==='GET')return res.status(200).json({photos:await s.list(prefix)});
      const body=typeof req.body==='string'?JSON.parse(req.body):req.body;
      let p;try{p=req.method==='DELETE'?photoMeta(body):validatePhoto(body);if(p.date!==date)throw Error();}catch{return res.status(400).json({error:'照片格式、大小或日期无效'});}
      const key=photoKey(user,p);
      if(req.method==='DELETE'){
        // Persist the tombstone first. Stale offline clients cannot resurrect this ID.
        await s.markDeleted(key);await s.removeImage(key);
        return res.status(200).json({...p,deleted:true});
      }
      if(p.deleted)return res.status(400).json({error:'删除请使用删除入口'});
      if(await s.isDeleted(key))return res.status(200).json({...photoMeta(p),deleted:true});
      const bytes=Buffer.from(p.data,'base64');
      if(bytes.length>PHOTO_LIMIT||bytes.at(-2)!==255||bytes.at(-1)!==217)return res.status(400).json({error:'无效JPEG照片'});
      const list=await s.keys(prefix);
      const live=list.filter(k=>k.endsWith('.jpg')&&!list.includes(k.slice(0,-4)+'.deleted'));
      if(!list.includes(key+'.jpg')&&live.length>=12)return res.status(409).json({error:'每天最多12张照片，请先删除多余照片'});
      await s.putImage(key,bytes);
      if(await s.isDeleted(key)){await s.removeImage(key);return res.status(200).json({...photoMeta(p),deleted:true});}
      return res.status(200).json({...photoMeta(p),deleted:false});
    }catch(e){return res.status(e instanceof SyntaxError?400:503).json({error:'照片暂未同步，本机副本保留，可稍后重试'});}
  };
}
export function databaseStorage(user){
  if(!process.env.DATABASE_URL)throw Error('Storage not configured');
  const sql=neon(process.env.DATABASE_URL),prefix=`accounts/${encodeURIComponent(user)}/`;
  function owned(key){if(!key.startsWith(prefix))throw Error('Wrong account');return key;}
  const keys=async p=>{owned(p);const rows=await sql`SELECT object_key,deleted FROM training_meal_photos WHERE user_id=${user} AND starts_with(object_key,${p}) ORDER BY object_key`;return rows.map(r=>r.object_key+(r.deleted?'.deleted':'.jpg'));};
  return {
    keys,
    async isDeleted(key){const rows=await sql`SELECT deleted FROM training_meal_photos WHERE user_id=${user} AND object_key=${owned(key)}`;return rows[0]?.deleted===true;},
    async markDeleted(key){await sql`INSERT INTO training_meal_photos(user_id,object_key,deleted,image_base64) VALUES(${user},${owned(key)},true,NULL) ON CONFLICT(user_id,object_key) DO UPDATE SET deleted=true,image_base64=NULL,updated_at=now()`;},
    async removeImage(){/* Tombstone atomically clears image bytes in markDeleted. */},
    async putImage(key,bytes){await sql`INSERT INTO training_meal_photos(user_id,object_key,deleted,image_base64) VALUES(${user},${owned(key)},false,${bytes.toString('base64')}) ON CONFLICT(user_id,object_key) DO NOTHING`;},
    async list(p){
      owned(p);const rows=await sql`SELECT object_key,deleted,image_base64 FROM training_meal_photos WHERE user_id=${user} AND starts_with(object_key,${p}) ORDER BY object_key`;
      return rows.map(r=>{const [date,meal,id]=r.object_key.split('/').slice(-3);return {...photoMeta({date,meal,id}),...(r.deleted?{deleted:true}:{deleted:false,data:r.image_base64})};});
    }
  };
}
export default createHandler();
