import {neon} from '@neondatabase/serverless';
import {createRemoteJWKSet,jwtVerify} from 'jose';
import {validateBackup} from '../dist/engine.mjs';
const AUTH_URL=(process.env.AUTH_URL||'').trim().replace(/\/$/,'');
const keys=AUTH_URL?createRemoteJWKSet(new URL(AUTH_URL+'/.well-known/jwks.json')):null;
export default async function handler(req,res){
  res.setHeader('Cache-Control','no-store');
  if(!['GET','PUT'].includes(req.method)){res.setHeader('Allow','GET, PUT');return res.status(405).json({error:'Method not allowed'});}
  if(!keys)return res.status(503).json({error:'此部署未启用邮箱同步，记录可保存在本机'});
  let user;
  try{const token=/^Bearer (\S+)$/.exec(req.headers.authorization||'')?.[1];if(!token)throw Error();const origin=new URL(AUTH_URL).origin;const {payload}=await jwtVerify(token,keys,{issuer:origin,audience:origin,algorithms:['EdDSA']});if(!payload.sub||payload.role!=='authenticated'||payload.banned||typeof payload.email!=='string')throw Error();user=payload.sub;}catch{return res.status(401).json({error:'请重新登录邮箱账号'});}
  if(req.headers['x-account-id']!==user)return res.status(401).json({error:'账号已切换，请重新同步'});
  if(!process.env.DATABASE_URL)return res.status(503).json({error:'云端数据库尚未配置，本机记录仍保留'});
  try{
    const sql=neon(process.env.DATABASE_URL);
    if(req.method==='GET'){const rows=await sql`SELECT state, revision FROM training_sync WHERE user_id=${user}`;return res.status(200).json(rows.length?{state:rows[0].state,revision:Number(rows[0].revision)}:{state:null,revision:0});}
    const body=typeof req.body==='string'?JSON.parse(req.body):req.body;
    if(!body||Buffer.byteLength(JSON.stringify(body))>5*1024*1024||!Number.isSafeInteger(body.revision)||body.revision<0)return res.status(400).json({error:'同步数据无效或超过5MB'});
    const state=validateBackup(body.state),expected=body.revision;
    const rows=expected===0
      ?await sql`INSERT INTO training_sync(user_id,state,revision) VALUES(${user},${JSON.stringify(state)}::jsonb,1) ON CONFLICT(user_id) DO NOTHING RETURNING revision`
      :await sql`UPDATE training_sync SET state=${JSON.stringify(state)}::jsonb, revision=revision+1,updated_at=now() WHERE user_id=${user} AND revision=${expected} RETURNING revision`;
    if(!rows.length)return res.status(409).json({conflict:true});
    return res.status(200).json({revision:Number(rows[0].revision)});
  }catch(error){if(error instanceof SyntaxError||/备份/.test(error.message))return res.status(400).json({error:'同步内容不符合训练数据格式'});return res.status(503).json({error:'云端暂不可用，本机记录已保留，请稍后重试'});}
}
