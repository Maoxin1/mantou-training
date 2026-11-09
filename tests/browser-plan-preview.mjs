import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { chromium } from 'playwright';
import { activeTrial, changePlan, copy, startTrial, today, writeEntry } from '../dist/journal.mjs';

const port = '4189';
const server = spawn(process.execPath, ['scripts/serve.mjs'], {
  env: { ...process.env, PORT: port },
  stdio: ['ignore', 'pipe', 'inherit']
});
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
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
  page.setDefaultTimeout(5000);
  await page.goto(`http://127.0.0.1:${port}/`);
  await page.click('#startTrial');
  await page.locator('#startTrialForm button[type="submit"]').click();

  const readState = () => page.evaluate(() => JSON.parse(localStorage.getItem('mantou-training-v1')));
  const sessionTargets = s => Object.values(s.journal.entries)
    .filter(e => e.kind === 'session')
    .map(e => e.fields.plan[0].min);
  async function edit(target = page) {
    await target.click('#adjustTrial');
    await target.locator('#adjustTrialForm summary').first().click();
  }
  async function preview(min, target = page) {
    await edit(target);
    await target.locator('[data-field="0-min"]').fill(String(min));
    await target.locator('[data-field="reason"]').fill('核对上一次训练记录');
    await target.locator('#adjustTrialForm button[type="submit"]').click();
  }

  await preview(7);
  let saved = activeTrial(await readState());
  assert.equal(saved.plan[0].min, 6, 'T01-M01: preview must leave the stored plan at 6');
  assert.equal(saved.changes.length, 0);
  const dialog = page.getByRole('dialog');
  assert.match(await dialog.innerText(), /次数下限.*6\s*→\s*7/u);
  assert.match(await dialog.innerText(), /核对上一次训练记录/u);

  await page.click('#closeDialog');
  await page.click('#beginSession');
  assert.deepEqual(sessionTargets(await readState()), [6]);
  await page.click('#closeDialog');

  await preview(7);
  await dialog.getByRole('button', { name: '确认并保存改动', exact: true }).click();
  let state = await readState();
  saved = activeTrial(state);
  assert.equal(saved.plan[0].min, 7);
  assert.equal(saved.changes.length, 1);
  assert.equal(saved.changes[0].reason, '核对上一次训练记录');
  assert.deepEqual(sessionTargets(state), [6]);

  await page.click('#newSession');
  await page.click('#closeDialog');
  await page.reload();
  state = await readState();
  assert.deepEqual(sessionTargets(state), [6, 7]);
  assert.equal(activeTrial(state).changes.length, 1);
  console.log('PASS T01-M01: preview leaves the original plan; confirmation applies to future sessions only');

  await page.setViewportSize({ width: 820, height: 1180 });
  await edit();
  const submit = page.locator('#adjustTrialForm button[type="submit"]');
  const reason = page.locator('[data-field="reason"]');
  const min = page.locator('[data-field="0-min"]');
  const max = page.locator('[data-field="0-max"]');
  const previewPanel = page.locator('#adjustPreview');
  const beforeDrafts = await readState();
  const invalidCases = [
    { lower: '7', upper: '12', text: '核对原安排', error: /没有需要保存的改动/u },
    { lower: '8', upper: '12', text: '　', error: /请填写调整原因/u },
    { lower: '8', upper: '7', text: '无效范围', error: /无效试行动作/u }
  ];
  for(const {lower,upper,text,error} of invalidCases) {
    await min.fill(lower);
    await max.fill(upper);
    await reason.fill(text);
    await submit.click();
    assert.match(await page.locator('#toast').innerText(), error);
    assert.equal(await previewPanel.isVisible(), false);
    assert.deepEqual(await readState(), beforeDrafts, JSON.stringify({lower,upper,text}));
  }
  await max.fill('12');
  await min.fill('8');
  const tokens = ['字', '💪', '\u0301', '&', '"', "'", '<', '>', '\n', 'Ａ'];
  let seed = 0x104;
  const generated = Array.from({length:6}, () => '起' + Array.from({length:12}, () => {
    seed = (Math.imul(seed,1664525)+1013904223)>>>0;
    return tokens[seed%tokens.length];
  }).join('') + '止');
  const textCases = ['中文💪 Ａ', 'Cafe\u0301 & "握距"', '<img src=x onerror=alert(1)>', '第一行\n第二行', 'a'.repeat(6000), ...generated];
  for(const text of textCases) {
    await reason.fill(text);
    await submit.click();
    assert.ok((await previewPanel.textContent()).includes(text), JSON.stringify(text));
    assert.equal(await previewPanel.locator('img').count(), 0);
    assert(await previewPanel.evaluate(el => el.scrollWidth <= el.clientWidth),
      `T01-M02: preview must wrap a reason of length ${text.length}`);
    assert.deepEqual(await readState(), beforeDrafts);
    await page.click('#editAdjust');
    assert.equal(await reason.inputValue(), text);
    assert.equal(await min.inputValue(), '8');
  }
  assert.equal(await page.locator('#adjustTrialForm').isVisible(), true);
  console.log('PASS T01-M02: invalid drafts and preview/edit sequences never write; text is preserved and escaped');

  await reason.fill('确认后的本地保存重试');
  await submit.click();
  await page.evaluate(() => {
    const write = Storage.prototype.setItem;
    Storage.prototype.setItem = function(key, value) {
      if (key === 'mantou-training-v1') {
        Storage.prototype.setItem = write;
        throw new DOMException('synthetic quota', 'QuotaExceededError');
      }
      return write.call(this, key, value);
    };
  });
  await page.click('#confirmAdjust');
  assert.match(await page.locator('#journalSave').innerText(), /保存失败/u);
  assert.equal(await previewPanel.isVisible(), true);
  assert.deepEqual(await readState(), beforeDrafts);
  await page.locator('#confirmAdjust').evaluate(button => {
    button.click();
    button.click();
  });
  state = await readState();
  assert.equal(activeTrial(state).changes.length, 2, 'successful retry plus repeat click count as one new change');
  assert.equal(activeTrial(state).plan[0].min, 8);
  assert.deepEqual(sessionTargets(state), [6, 7]);
  await page.evaluate(() => navigator.serviceWorker.ready.then(() => true));
  await page.context().setOffline(true);
  await page.reload();
  await page.locator('#adjustTrial').waitFor();
  assert.deepEqual(await readState(), state);
  await page.context().setOffline(false);
  console.log('PASS T01-M03: failed write retains the preview, repeat confirmation saves once, offline reopen retains it');

  // Exercise the production journal UI with a controlled replacement of the
  // state it reads. This simulates an already-observed update, without cloud I/O.
  await page.evaluate(async () => {
    const { mountJournal } = await import('/journal-ui.mjs');
    const { activeTrial, changePlan, copy } = await import('/journal.mjs');
    let current = JSON.parse(localStorage.getItem('mantou-training-v1'));
    function transact(fn) {
      const next = copy(current);
      const result = fn(next);
      current = next;
      return result;
    }
    const journal = mountJournal({
      getState: () => current,
      transact,
      notify: message => { document.getElementById('toast').textContent = message; }
    });
    window.planFixture = {
      read: () => activeTrial(current),
      replacePlan() {
        transact(next => {
          const plan = copy(activeTrial(next).plan);
          plan[0].min = 10;
          changePlan(next, plan, '预览后读到的新安排');
        });
      }
    };
    journal.renderPlan();
  });
  await preview(9);
  await page.evaluate(() => window.planFixture.replacePlan());
  await page.click('#confirmAdjust');
  const latest = await page.evaluate(() => window.planFixture.read());
  assert.equal(latest.plan[0].min, 10, 'T01-M04: a stale preview must not overwrite the newly observed plan');
  assert.equal(latest.changes.length, 3);
  assert.match(await page.locator('#journalSave').innerText(), /已更新.*重新/u);
  console.log('PASS T01-M04: confirmation is blocked after the observed plan changes');

  async function openAccountPage(user, envelope, routeSync) {
    const cache = 'mantou-training-account:' + user;
    const context = await browser.newContext({serviceWorkers:'block'});
    await context.addInitScript(({user,cache,envelope})=>{
      localStorage.setItem('mantou-training-account', JSON.stringify({id:user,email:'preview@example.test'}));
      if(!localStorage.getItem(cache))localStorage.setItem(cache,JSON.stringify(envelope));
    }, {user,cache,envelope});
    const target = await context.newPage();
    target.setDefaultTimeout(5000);
    const stub = body => ({contentType:'text/javascript',body});
    await target.route('**/cloud-config.mjs', route => route.fulfill(stub("export const AUTH_URL='https://preview.example.test'")));
    await target.route('**/auth-sdk.mjs', route => route.fulfill(stub('export const BetterAuthVanillaAdapter=()=>({}); export const createAuthClient=()=>({});')));
    await target.route('**/cloud-token.mjs', route => route.fulfill(stub("export const getSyncToken=async()=> 'synthetic-token';")));
    await target.route('**/api/sync', routeSync);
    return {target,cache};
  }

  let remote = copy(state), revision = 2;
  const updated = copy(activeTrial(remote).plan);
  updated[0].min = 10;
  changePlan(remote, updated, '另一设备已确认');
  const date = today(), daily = 'daily:' + date;
  writeEntry(remote, daily, 'daily', {date, notes: '同一次同步带来的训练反馈'});
  let sendSync;
  const allowReply = new Promise(resolve => { sendSync = resolve; });
  const initial = {local:state,base:state,revision:1,pending:false,conflict:null};
  const {target:accountPage,cache} = await openAccountPage('synthetic-plan-preview', initial, async route => {
    await allowReply;
    if(route.request().method()==='GET'){
      await route.fulfill({json:{state:remote,revision}});
      return;
    }
    const incoming=route.request().postDataJSON();
    assert.equal(incoming.revision,revision);
    remote=incoming.state;
    await route.fulfill({json:{revision:++revision}});
  });
  const syncRequest = accountPage.waitForRequest('**/api/sync');
  await accountPage.goto(`http://127.0.0.1:${port}/`);
  await syncRequest;
  try {
    await preview(9, accountPage);
  } finally {
    sendSync();
  }
  await accountPage.waitForFunction(key=>JSON.parse(localStorage.getItem(key)).revision===2,cache);
  await accountPage.click('#confirmAdjust');
  const syncedLocal = await accountPage.evaluate(key=>JSON.parse(localStorage.getItem(key)).local,cache);
  assert.equal(activeTrial(syncedLocal).plan[0].min,10,'T01-M05: sync already saved the newer plan to this device');
  assert.equal(syncedLocal.journal.entries[daily].fields.notes,remote.journal.entries[daily].fields.notes);
  assert.match(await accountPage.locator('#journalSave').innerText(), /已更新.*重新/u);
  await accountPage.click('#closeDialog');
  await edit(accountPage);
  assert.equal(await accountPage.locator('[data-field="0-min"]').inputValue(), '10');
  await accountPage.locator('[data-field="0-min"]').fill('11');
  await accountPage.locator('[data-field="reason"]').fill('核对最新安排后确认');
  await accountPage.locator('#adjustTrialForm button[type="submit"]').click();
  await accountPage.click('#confirmAdjust');
  await accountPage.waitForFunction(key=>JSON.parse(localStorage.getItem(key)).revision===3,cache);
  assert.equal(activeTrial(remote).plan[0].min,11);
  assert.equal(activeTrial(remote).changes.length,4);
  assert.equal(remote.journal.entries[daily].fields.notes,'同一次同步带来的训练反馈');
  console.log('PASS T01-M05: a sync finishing under the open preview cannot be overwritten by confirmation');

  const left = copy(state), right = copy(state);
  const sameTime = new Date(Date.parse(activeTrial(state).changes.at(-1).at)+1000).toISOString();
  for(const [branch,lower] of [[left,9],[right,10]]) {
    const plan = copy(activeTrial(branch).plan);
    plan[0].min = lower;
    changePlan(branch,plan,'同时间的不同设备改动');
    activeTrial(branch).changes.at(-1).at = sameTime;
  }
  let sendConflict;
  const allowConflict = new Promise(resolve => { sendConflict = resolve; });
  let conflictRemote = right, conflictRevision = 2;
  let rejectUpload = false;
  const {target:conflictPage,cache:conflictCache} = await openAccountPage(
    'synthetic-plan-conflict', {...initial,local:left,pending:true}, async route => {
      await allowConflict;
      if(route.request().method()==='GET'){
        await route.fulfill({json:{state:conflictRemote,revision:conflictRevision}});
        return;
      }
      const incoming = route.request().postDataJSON();
      assert.equal(incoming.revision,conflictRevision);
      if(rejectUpload){
        await route.fulfill({status:503,json:{error:'模拟同步服务暂不可用'}});
        return;
      }
      conflictRemote = incoming.state;
      await route.fulfill({json:{revision:++conflictRevision}});
    });
  const conflictRequest = conflictPage.waitForRequest('**/api/sync');
  await conflictPage.goto(`http://127.0.0.1:${port}/`);
  await conflictRequest;
  try {
    await preview(11, conflictPage);
  } finally {
    sendConflict();
  }
  const conflictKey = 'journal:'+JSON.stringify(['trials',activeTrial(state).id,'plan']);
  await conflictPage.waitForFunction(({cache,key})=>JSON.parse(localStorage.getItem(cache)).conflict?.conflicts.some(c=>c.key===key),
    {cache:conflictCache,key:conflictKey});
  const readConflictCache = () => conflictPage.evaluate(key=>localStorage.getItem(key),conflictCache);
  const beforeConflictConfirm = await readConflictCache();
  await conflictPage.click('#confirmAdjust');
  assert.equal(activeTrial(JSON.parse(await readConflictCache()).local).plan[0].min,9,
    'T01-M10: confirmation must not write over the unresolved trial plan');
  assert.equal(await readConflictCache(),beforeConflictConfirm,'T01-M10: both conflict versions must remain available');
  assert.match(await conflictPage.locator('#journalSave').innerText(),/处理.*差异/u);
  await conflictPage.click('#closeDialog');
  await conflictPage.click('#accountShortcut');
  await conflictPage.getByRole('button',{name:'保留云端差异并合并',exact:true}).click();
  await conflictPage.waitForFunction(key=>{
    const current = JSON.parse(localStorage.getItem(key));
    return !current.conflict&&!current.pending&&current.revision===3;
  },conflictCache);
  const archived = await conflictPage.evaluate(key=>JSON.parse(localStorage.getItem(key+':conflict-archive')),conflictCache);
  const archivedPlan = archived[0].conflicts.find(c=>c.key===conflictKey);
  assert.deepEqual([archivedPlan.local[0].min,archivedPlan.remote[0].min],[9,10]);
  await conflictPage.locator('[data-page="plan"]').click();
  await preview(11,conflictPage);
  assert.match(await conflictPage.locator('#adjustPreview').innerText(),/次数下限.*10\s*→\s*11/u);
  await conflictPage.click('#confirmAdjust');
  await conflictPage.waitForFunction(key=>JSON.parse(localStorage.getItem(key)).revision===4,conflictCache);
  assert.equal(activeTrial(conflictRemote).plan[0].min,11);
  assert.equal(activeTrial(conflictRemote).changes.length,5);

  const stageLeft = copy(state), stageRight = copy(state);
  for(const branch of [stageLeft,stageRight]){
    startTrial(branch);
    activeTrial(branch).created = sameTime;
  }
  const {target:stagePage,cache:stageCache} = await openAccountPage(
    'synthetic-active-stage-conflict', {...initial,local:stageLeft,pending:true}, route =>
      route.fulfill({json:{state:stageRight,revision:2}}));
  const stageKey = 'journal:'+JSON.stringify(['settings','activeTrial']);
  await stagePage.goto(`http://127.0.0.1:${port}/`);
  await stagePage.waitForFunction(({cache,key})=>JSON.parse(localStorage.getItem(cache)).conflict?.conflicts.some(c=>c.key===key),
    {cache:stageCache,key:stageKey});
  const readStageCache = () => stagePage.evaluate(key=>localStorage.getItem(key),stageCache);
  const beforeStageConfirm = await readStageCache();
  await preview(7,stagePage);
  await stagePage.click('#confirmAdjust');
  assert.equal(await readStageCache(),beforeStageConfirm);
  assert.match(await stagePage.locator('#journalSave').innerText(),/处理.*差异/u);
  console.log('PASS T01-M10: plan and active-stage conflicts block confirmation; choosing a plan allows a fresh preview');

  async function openGuestPage(initialState) {
    const target = await browser.newPage();
    target.setDefaultTimeout(5000);
    await target.addInitScript(initial=>{
      if(!localStorage.getItem('mantou-training-v1'))localStorage.setItem('mantou-training-v1',JSON.stringify(initial));
    },initialState);
    await target.goto(`http://127.0.0.1:${port}/`);
    return target;
  }
  const readGuest = target => target.evaluate(()=>localStorage.getItem('mantou-training-v1'));
  const legacy = copy(state);
  const oldLoad = '40 磅\r\n短握 · 保持站位';
  const oldVariant = '标准俯卧撑\r\n脚放地面';
  const oldPauseReason = '以前的暂停说明\r\n保留原文';
  activeTrial(legacy).plan[0].load = oldLoad;
  activeTrial(legacy).plan[0].variant = oldVariant;
  activeTrial(legacy).plan[0].pauseReason = oldPauseReason;
  const legacyPage = await openGuestPage(legacy);
  await preview(9, legacyPage);
  assert.doesNotMatch(await legacyPage.locator('#adjustPreview').innerText(),/阻力／握距|动作版本|暂停说明/u,
    'T01-M11: browser-normalized but untouched input must not be previewed as a change');
  await legacyPage.click('#confirmAdjust');
  const legacySaved = activeTrial(JSON.parse(await readGuest(legacyPage)));
  for(const [field,original] of [['load',oldLoad],['variant',oldVariant],['pauseReason',oldPauseReason]]){
    assert.equal(legacySaved.plan[0][field],original);
    assert.equal(legacySaved.changes.at(-1).before[0][field],original);
    assert.equal(legacySaved.changes.at(-1).after[0][field],original);
  }
  assert.equal(legacySaved.plan[0].min,9);
  console.log('PASS T01-M11: confirmation retains untouched historical text exactly');

  const interruptedPage = await openGuestPage(state);
  const beforeInterruption = await readGuest(interruptedPage);
  await preview(9,interruptedPage);
  await interruptedPage.keyboard.press('Escape');
  await interruptedPage.getByRole('dialog').waitFor({state:'hidden'});
  assert.equal(await readGuest(interruptedPage),beforeInterruption);
  await preview(9,interruptedPage);
  await interruptedPage.reload();
  await interruptedPage.locator('#adjustTrial').waitFor();
  assert.equal(await readGuest(interruptedPage),beforeInterruption);
  await edit(interruptedPage);
  assert.equal(await interruptedPage.locator('[data-field="0-min"]').inputValue(),'8');
  assert.equal(await interruptedPage.locator('[data-field="reason"]').inputValue(),'');
  console.log('PASS T01-M12: Escape and reload abandon the unconfirmed draft without writing');

  const fullHistory = copy(state);
  const previousChange = activeTrial(fullHistory).changes[0];
  activeTrial(fullHistory).changes = Array.from({length:200},(_,i)=>({...copy(previousChange),id:'fixture-'+i}));
  const fullHistoryPage = await openGuestPage(fullHistory);
  const beforeFullConfirm = await readGuest(fullHistoryPage);
  await preview(9,fullHistoryPage);
  await fullHistoryPage.click('#confirmAdjust');
  assert.match(await fullHistoryPage.locator('#journalSave').innerText(),/保存失败.*尚未保存/u);
  assert.equal(await fullHistoryPage.locator('#adjustPreview').isVisible(),true);
  assert.equal(await readGuest(fullHistoryPage),beforeFullConfirm);
  await fullHistoryPage.reload();
  await fullHistoryPage.locator('#adjustTrial').waitFor();
  assert.equal(await readGuest(fullHistoryPage),beforeFullConfirm);
  console.log('PASS T01-M13: exceeding the current history limit preserves the stored plan and all 200 entries');

  rejectUpload = true;
  await preview(12,conflictPage);
  await conflictPage.click('#confirmAdjust');
  await conflictPage.locator('#systemAlert').filter({hasText:'同步失败 · 模拟同步服务暂不可用'}).waitFor();
  const afterFailedUpload = JSON.parse(await readConflictCache());
  assert.equal(afterFailedUpload.pending,true);
  assert.equal(afterFailedUpload.revision,4);
  assert.equal(activeTrial(afterFailedUpload.local).plan[0].min,12);
  assert.equal(activeTrial(afterFailedUpload.local).changes.length,6);
  assert.equal(activeTrial(conflictRemote).plan[0].min,11);
  assert.doesNotMatch(await conflictPage.locator('#systemStatus').innerText(),/已同步/u);

  rejectUpload = false;
  await conflictPage.click('#accountShortcut');
  await conflictPage.getByRole('button',{name:'立即同步',exact:true}).click();
  await conflictPage.waitForFunction(key=>{
    const current = JSON.parse(localStorage.getItem(key));
    return !current.pending&&current.revision===5;
  },conflictCache);
  assert.equal(activeTrial(conflictRemote).plan[0].min,12);
  assert.equal(activeTrial(conflictRemote).changes.length,6);
  console.log('PASS T01-M14: a failed upload leaves the plan pending and retry syncs without a duplicate change');
} finally {
  try { await browser?.close(); } finally { server.kill(); }
}
