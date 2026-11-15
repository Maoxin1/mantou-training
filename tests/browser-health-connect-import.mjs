import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {once} from 'node:events';
import {readFile} from 'node:fs/promises';
import {chromium} from 'playwright';
import {zipSync, strToU8} from 'fflate';
import {parseHealthConnect,planHealthConnectImport} from '../dist/health-connect-sleep.mjs';
import {today} from '../dist/journal.mjs';

const port='4199';
const base='http://127.0.0.1:'+port;
const server=spawn(process.execPath,['scripts/serve.mjs'],{
  env:{...process.env,PORT:port},stdio:['ignore','pipe','inherit']
});
const date='2020-01-03', nextDate='2020-01-04';
const night=(id,from,to)=>({
  id,origin:'nl.appyhapps.healthsync',start:from+'T22:00:00Z',end:to+'T00:00:00Z',
  startOffsetSeconds:28800,endOffsetSeconds:28800,lastModified:to+'T01:00:00Z',stages:[]
});
const payload=records=>({name:'synthetic-sleep.json',mimeType:'application/json',buffer:Buffer.from(
  JSON.stringify({format:'mantou-health-connect-sleep',version:1,complete:true,records})
)});
const first=night('first','2020-01-02',date), second=night('second',date,nextDate);
const withDuplicateNight=payload([first,second,
  {...second,id:'independent',start:nextDate+'T02:00:00Z',end:nextDate+'T03:00:00Z'}]);
const zip={name:'synthetic.zip',mimeType:'application/zip',buffer:Buffer.from(zipSync({
  'com.samsung.shealth.sleep.20200103.csv':strToU8(
    'samsung,1\ndatauuid,start_time,end_time,time_offset\nzip,2020-01-02 22:00:00,2020-01-03 00:00:00,UTC+0800\n'),
  'com.samsung.health.sleep_stage.20200103.csv':strToU8('samsung,1\nsleep_id,start_time,end_time,stage\n')
}))};

let browser;
try{
  await Promise.race([once(server.stdout,'data'),once(server,'exit').then(([code])=>{throw Error('Test server exited '+code);})]);
  browser=await chromium.launch({channel:process.env.BROWSER_CHANNEL||(process.platform==='win32'?'msedge':undefined)});
  for(const width of [390,820]){
    const ctx=await browser.newContext({viewport:{width,height:900},timezoneId:'Asia/Shanghai'});
    const page=await ctx.newPage();
    page.setDefaultTimeout(10000);
    const errors=[];
    page.on('pageerror',e=>errors.push(e.message));
    const openRecords=()=>page.locator('[data-page="history"]').click();
    const close=()=>page.locator('#closeDialog').click();
    const raw=()=>page.evaluate(()=>localStorage.getItem('mantou-training-v1'));
    const fields=async day=>JSON.parse(await raw())?.journal.entries['daily:'+day]?.fields;
    const counts=(pattern)=>page.locator('#healthSleepStatus').filter({hasText:pattern}).waitFor();
    try{
      await page.goto(base);
      await page.waitForFunction(()=>Boolean(navigator.serviceWorker.controller));
      await openRecords();
      await page.locator('#journalDate').fill(date);
      await page.locator('#editDaily').click();
      await page.locator('[data-field="notes"]').fill('原有每日反馈');
      await close();
      await ctx.setOffline(true);
      await page.locator('#importHealthSleep').click();
      const select=page.locator('#healthSleepFile');
      const snapshot=await raw();
      await select.setInputFiles(withDuplicateNight);
      await counts('可新增 1 条 · 重复跳过 0 条 · 待核对 2 条');
      assert.equal(await raw(),snapshot);
      await page.locator('[data-health-sleep]').uncheck();
      assert(await page.locator('#saveHealthSleep').isDisabled());
      await page.locator('[data-health-sleep]').check();
      await page.locator('#saveHealthSleep').click();
      await counts('可新增 0 条 · 重复跳过 1 条 · 待核对 2 条');
      assert.equal((await fields(date)).healthConnectSleep.origin,first.origin);
      assert.equal((await fields(date)).healthConnectSleep.actualMinutes,null);
      assert.equal((await fields(date)).notes,'原有每日反馈');
      assert.equal(await fields(nextDate),undefined);
      const saved=await raw();
      await select.setInputFiles(payload([first]));
      await counts('重复跳过 1 条');
      assert.equal(await page.locator('#saveHealthSleep').count(),0);
      await select.setInputFiles({name:'broken.json',mimeType:'application/json',buffer:Buffer.from('{')});
      await counts('导入失败');
      assert.equal(await raw(),saved);
      await close();
      await page.locator('#importSleep').click();
      await page.locator('#sleepFile').setInputFiles(zip);
      await page.locator('#sleepFrom').fill(date);
      await page.locator('#sleepTo').fill(date);
      await page.locator('#batchSleepCount').filter({hasText:'待核对 1 晚'}).waitFor();
      await page.getByText('手动核对一晚',{exact:true}).click();
      await page.locator('#sleepCombined').filter({hasText:'与已存 Health Connect 睡眠'}).waitFor();
      assert(await page.locator('#saveSleep').isDisabled());
      assert.equal(await raw(),saved);
      await page.reload();
      await openRecords();
      await page.locator('#journalDate').fill(date);
      await page.getByText(/Health Sync · Health Connect/).waitFor();
      await page.locator('[data-page="export"]').click();
      await page.getByText('文字备份与旧版周报',{exact:true}).click();
      const download=page.waitForEvent('download');
      await page.locator('#exportBackup').click();
      const file=await (await download).path();
      const restore=await browser.newContext({viewport:{width,height:900}});
      try{
        const fresh=await restore.newPage();
        await fresh.goto(base);
        await fresh.locator('[data-page="export"]').click();
        await fresh.getByText('文字备份与旧版周报',{exact:true}).click();
        await fresh.locator('#importBackup').setInputFiles(file);
        await fresh.locator('#confirmImport').click();
        await fresh.locator('[data-page="history"]').click();
        await fresh.locator('#journalDate').fill(date);
        await fresh.getByText(/Health Sync · Health Connect/).waitFor();
      }finally{await restore.close();}
      assert.deepEqual(errors,[]);
      console.log(`PASS Health Connect normal entry, offline preview/save/reload, duplicates, Samsung manual guard and backup restore (${width}px)`);
    }finally{await ctx.close();}
  }
  if(process.env.TRAINING_PRIVATE_SLEEP_SAMPLE){
    const ctx=await browser.newContext({viewport:{width:390,height:900}});
    try{
      const page=await ctx.newPage();
      await page.goto(base);
      await page.locator('[data-page="history"]').click();
      await page.locator('#importHealthSleep').click();
      const file=await readFile(process.env.TRAINING_PRIVATE_SLEEP_SAMPLE);
      const planning=planHealthConnectImport(parseHealthConnect(file.toString('utf8')),{},today());
      const selectable=planning.filter(item=>item.status==='new').length;
      const review=planning.filter(item=>item.status==='review').length;
      assert(selectable>0);
      await page.locator('#healthSleepFile').setInputFiles({
        name:'sleep.json',mimeType:'application/json',buffer:file
      });
      const summary=page.locator('#healthSleepStatus');
      await summary.filter({hasText:`可新增 ${selectable} 条 · 重复跳过 0 条 · 待核对 ${review} 条`}).waitFor();
      await page.locator('#saveHealthSleep').click();
      await summary.filter({hasText:`可新增 0 条 · 重复跳过 ${selectable} 条 · 待核对 ${review} 条`}).waitFor();
      console.log('PASS private export through normal import UI in discarded local browser context');
    }finally{await ctx.close();}
  }
}finally{
  await browser?.close();
  server.kill();
}
