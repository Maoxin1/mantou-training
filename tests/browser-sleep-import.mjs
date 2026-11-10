import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { chromium } from 'playwright';
import { zipSync, strToU8 } from 'fflate';

const port = '4194';
const url = `http://127.0.0.1:${port}/`;
const server = spawn(process.execPath, ['scripts/serve.mjs'], {
  env: { ...process.env, PORT: port },
  stdio: ['ignore', 'pipe', 'inherit']
});
const first = '2020-01-02';
const second = '2020-01-03';
const csv = (header, rows) => strToU8(['samsung,1', header, ...rows, ''].join('\n'));
function sleepZip(revised) {
  const olderTime = '2020-01-02 01:00:00.000';
  const revisedTime = '2020-01-03 01:00:00.000';
  const sleep = [`sample-one,2020-01-01 23:00:00.000,2020-01-02 00:00:00.000,UTC+0800,${revised ? revisedTime : olderTime}`];
  const stages = revised ? [
    'sample-one,2020-01-01 23:00:00.000,2020-01-01 23:10:00.000,40001',
    'sample-one,2020-01-01 23:10:00.000,2020-01-02 00:00:00.000,40002'
  ] : ['sample-one,2020-01-01 23:00:00.000,2020-01-02 00:00:00.000,40002'];
  if (revised) {
    sleep.push(`sample-two,2020-01-02 23:00:00.000,2020-01-03 00:00:00.000,UTC+0800,${revisedTime}`);
    stages.push('sample-two,2020-01-02 23:00:00.000,2020-01-03 00:00:00.000,40002');
  }
  return {
    name: revised ? 'new.zip' : 'old.zip',
    mimeType: 'application/zip',
    buffer: Buffer.from(zipSync({
      'com.samsung.shealth.sleep.20200103.csv': csv('datauuid,start_time,end_time,time_offset,update_time', sleep),
      'com.samsung.health.sleep_stage.20200103.csv': csv('sleep_id,start_time,end_time,stage', stages),
      'unrelated.csv': strToU8('ignored data')
    }))
  };
}

let browser;
try {
  await new Promise((resolve, reject) => {
    server.stdout.once('data', resolve);
    server.once('error', reject);
    server.once('exit', code => reject(new Error(`Preview server exited (${code})`)));
  });
  browser = await chromium.launch({
    channel: process.env.BROWSER_CHANNEL || (process.platform === 'win32' ? 'msedge' : undefined),
    headless: true
  });
  for (const viewport of [{ width: 390, height: 844 }, { width: 820, height: 1180 }]) {
    const context = await browser.newContext({ viewport });
    try {
      const page = await context.newPage();
      page.setDefaultTimeout(5000);
      await page.goto(url);
      await page.evaluate(() => navigator.serviceWorker.ready.then(() => true));
      await page.waitForFunction(() => Boolean(navigator.serviceWorker.controller));
      await page.locator('[data-page="history"]').click();
      const raw = () => page.evaluate(() => localStorage.getItem('mantou-training-v1'));
      const fields = async date => JSON.parse(await raw()).journal.entries['daily:' + date]?.fields;
      await page.locator('#journalDate').fill(first);
      await page.locator('#editDaily').click();
      await page.getByText('三餐与份量 · 任选3个代表日详记', { exact: true }).click();
      await page.locator('[data-field="breakfast"]').fill('测试早餐');
      await page.locator('#closeDialog').click();
      await context.setOffline(true);
      await page.locator('#importSleep').click();
      const file = page.locator('#sleepFile');
      const save = page.locator('#saveBatchSleep');
      const row = date => page.locator(`[data-sleep-batch="${date}"]`);
      const counts = async pattern => {
        await page.getByText(pattern).waitFor({ state: 'visible' });
      };
      async function preview(revised) {
        await file.setInputFiles(sleepZip(revised));
        await page.locator('#sleepFrom').fill(first);
        await page.locator('#sleepTo').fill(second);
      }

      const before = await raw();
      await preview(false);
      await counts(/新增 1 晚/u);
      assert.equal(await raw(), before, 'preview must not write');
      await save.click();
      assert.equal((await fields(first)).samsungSleep.actualMinutes, 60);
      assert.equal((await fields(first)).breakfast, '测试早餐');

      await preview(true);
      await counts(/新增 1 晚 · 修订 1 晚/u);
      assert.equal(await row(first).isChecked(), false);
      assert.equal(await row(second).isChecked(), true);
      await save.click();
      assert.equal((await fields(first)).samsungSleep.actualMinutes, 60);
      assert.equal((await fields(second)).samsungSleep.actualMinutes, 60);
      await row(first).check();
      await save.click();
      assert.equal((await fields(first)).samsungSleep.actualMinutes, 50);

      const after = await raw();
      await counts(/重复跳过 2 晚/u);
      assert.equal(await save.isDisabled(), true);
      await preview(false);
      await counts(/旧版跳过 1 晚/u);
      assert.equal(await save.isDisabled(), true);
      await page.getByText('手动核对一晚', { exact: true }).click();
      await page.getByText(/所选文件含有旧版片段/u).waitFor();
      assert.equal(await page.locator('#saveSleep').isDisabled(), true);
      assert.equal(await raw(), after);

      await page.reload();
      assert.equal((await fields(first)).samsungSleep.actualMinutes, 50);
      assert.equal((await fields(first)).breakfast, '测试早餐');
      console.log(`PASS TRAIN-03: offline batch import, explicit revision, duplicate and old ZIP protection, ${viewport.width}px`);
    } finally {
      await context.close();
    }
  }
} finally {
  await browser?.close();
  server.kill();
}
