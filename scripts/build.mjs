import {build} from 'esbuild';
await build({entryPoints:['src/auth-entry.mjs'],bundle:true,format:'esm',platform:'browser',target:'es2022',minify:true,outfile:'dist/auth-sdk.mjs'});
