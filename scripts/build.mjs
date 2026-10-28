import {build} from 'esbuild';
import {writeFile} from 'node:fs/promises';
const authURL=(process.env.AUTH_URL||'').trim().replace(/\/$/,'');
if(authURL){const url=new URL(authURL);if(url.protocol!=='https:'||url.username||url.password||url.search||url.hash)throw Error('AUTH_URL must be a public HTTPS authentication endpoint, without credentials or query parameters');}
// Only this public endpoint is written to the frontend. Never serialize process.env.
await writeFile('dist/cloud-config.mjs','// Generated public configuration. Database credentials stay on the server.\nexport const AUTH_URL='+JSON.stringify(authURL)+';\n');
await build({entryPoints:['src/auth-entry.mjs'],bundle:true,format:'esm',platform:'browser',target:'es2022',minify:true,outfile:'dist/auth-sdk.mjs'});

await build({entryPoints:['src/meal-zip-entry.mjs'],bundle:true,format:'esm',platform:'browser',target:'es2022',minify:true,outfile:'dist/meal-zip.mjs'});
