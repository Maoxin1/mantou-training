// Create a local-only Vercel Build Output without server functions or account configuration.
import assert from 'node:assert/strict';
import {cp,mkdir,readFile,readdir,writeFile} from 'node:fs/promises';
import {resolve,relative,isAbsolute,sep} from 'node:path';
const dest=resolve(process.argv[2]||'');
assert(process.argv[2],'Pass a new directory outside this repository');
const root=resolve('.'),rel=relative(root,dest);
assert(isAbsolute(rel)||rel==='..'||rel.startsWith('..'+sep),'Preview output must be outside the repository');
await mkdir(dest); // Never overwrite another preview or workspace.
const output=resolve(dest,'.vercel/output'),staticDir=resolve(output,'static');
await mkdir(output,{recursive:true});await cp('dist',staticDir,{recursive:true});
await writeFile(resolve(staticDir,'cloud-config.mjs'),'// Isolated static preview: records stay on this device.\nexport const AUTH_URL="";\n');
const {headers}=JSON.parse(await readFile('vercel.json','utf8'));
const routes=headers.map(rule=>({src:rule.source,headers:Object.fromEntries(rule.headers.map(h=>[h.key,h.value])),continue:true}));
routes.push({handle:'filesystem'});
const files=await readdir(staticDir);
const overrides=Object.fromEntries(files.filter(f=>f.endsWith('.mjs')).map(f=>[f,{contentType:'application/javascript; charset=utf-8'}]));
await writeFile(resolve(output,'config.json'),JSON.stringify({version:3,routes,overrides},null,2)+'\n');
await writeFile(resolve(output,'builds.json'),JSON.stringify({builds:[],previewSource:'local-only; no API functions or account environment'})+'\n');
console.log('Prepared static preview: '+dest);
