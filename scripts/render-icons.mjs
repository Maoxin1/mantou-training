// Render the repository's vector source; no external images or generative model.
import {readFile} from 'node:fs/promises';
import {chromium} from 'playwright';
const svg=await readFile(new URL('../dist/icons/icon.svg',import.meta.url),'utf8');
const browser=await chromium.launch({channel:process.env.BROWSER_CHANNEL||(process.platform==='win32'?'msedge':undefined),headless:true});
try{
  const page=await browser.newPage({deviceScaleFactor:1});
  for(const [name,size]of [['icon-192',192],['icon-512',512],['icon-maskable-512',512],['apple-touch-icon',180]]){
    await page.setViewportSize({width:size,height:size});
    await page.setContent(`<style>body{margin:0}svg{display:block;width:100vw;height:100vh}</style>${svg}`);
    await page.screenshot({path:`dist/icons/${name}.png`});
  }
}finally{await browser.close();}
