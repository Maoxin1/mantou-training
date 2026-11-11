import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createServer} from 'node:http';
import {once} from 'node:events';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const projectId='divine-star-53093504',branchId='br-cold-sea-a1towblc';
const authUrl='https://ep-divine-voice-a1w01nvf.neonauth.ap-southeast-1.aws.neon.tech/neondb/auth';
const databaseHosts=new Set(['ep-divine-voice-a1w01nvf.ap-southeast-1.aws.neon.tech','ep-divine-voice-a1w01nvf-pooler.ap-southeast-1.aws.neon.tech']);

export async function managedFixture(configPath){
  assert(configPath,'Set TRAINING_MANAGED_CONFIG to the private staging configuration; no production fallback');
  let config;try{config=JSON.parse(await readFile(configPath,'utf8'));}catch{throw Error('Private staging configuration could not be read');}
  assert.equal(config.projectId,projectId,'Only the explicitly authorized staging project is allowed');
  assert.equal(config.branchId,branchId,'Only the explicitly authorized staging branch is allowed');
  assert.equal(config.authUrl,authUrl,'Only the explicitly authorized managed authentication endpoint is allowed');
  let database;try{database=new URL(config.databaseUrl);}catch{throw Error('Invalid private staging database URL');}
  assert(['postgres:','postgresql:'].includes(database.protocol)&&databaseHosts.has(database.hostname),'Database host is not on the explicit staging allowlist');
  process.env.AUTH_URL=authUrl;process.env.DATABASE_URL=config.databaseUrl;
  const handlers={'/api/sync':(await import('../../api/sync.mjs')).default,'/api/meals':(await import('../../api/meals.mjs')).default};
  const root=fileURLToPath(new URL('../../dist/',import.meta.url));
  const headers=JSON.parse(await readFile(new URL('../../vercel.json',import.meta.url),'utf8')).headers.find(x=>x.source==='/(.*)').headers;
  const mime={'.html':'text/html','.mjs':'text/javascript','.js':'text/javascript','.css':'text/css','.svg':'image/svg+xml','.png':'image/png','.webmanifest':'application/manifest+json'};
  const failures=[],calls=[];
  const server=createServer(async(req,res)=>{
    const url=new URL(req.url,'http://127.0.0.1');
    const json=(status,data)=>{res.statusCode=status;res.setHeader('Content-Type','application/json');res.end(JSON.stringify(data));};
    try{
      for(const {key,value}of headers)res.setHeader(key,value);
      res.setHeader('Cache-Control','no-store');
      if(handlers[url.pathname]){
        let text='';for await(const chunk of req){text+=chunk;if(text.length>6*1024*1024)return json(413,{error:'Test request too large'});}
        req.body=text?JSON.parse(text):undefined;req.query=Object.fromEntries(url.searchParams);
        const reply={setHeader:(...args)=>res.setHeader(...args),status(n){res.statusCode=n;return this;},json(data){calls.push({path:url.pathname,method:req.method,status:res.statusCode});json(res.statusCode,data);}};
        return await handlers[url.pathname](req,reply);
      }
      if(url.pathname==='/cloud-config.mjs'){
        res.setHeader('Content-Type','text/javascript');return res.end('export const AUTH_URL='+JSON.stringify(authUrl)+';');
      }
      const name=url.pathname==='/'?'index.html':decodeURIComponent(url.pathname.slice(1));
      const file=path.resolve(root,name);if(!file.startsWith(path.resolve(root)+path.sep))return json(403,{});
      let bytes;try{bytes=await readFile(file);}catch{return json(404,{});}
      res.setHeader('Content-Type',mime[path.extname(file)]||'application/octet-stream');res.end(bytes);
    }catch{failures.push('Managed test server request failed');if(!res.headersSent)json(500,{error:'Managed test server request failed'});else res.end();}
  });
  server.listen(0,'127.0.0.1');await once(server,'listening');
  return {origin:'http://localhost:'+server.address().port,authUrl,failures,calls,close:()=>new Promise(resolve=>server.close(resolve))};
}
