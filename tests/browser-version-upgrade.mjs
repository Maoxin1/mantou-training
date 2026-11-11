import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { once } from 'node:events';
import { readFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import { createRequire } from 'node:module';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { neonConfig } from '@neondatabase/serverless';
import { exportJWK, generateKeyPair, SignJWT } from 'jose';
import { chromium } from 'playwright';
import { strToU8, zipSync } from 'fflate';

// Run with a separately installed PGlite. All records and authentication stay on loopback.
assert(process.env.TRAINING_PGLITE_ROOT, 'Set TRAINING_PGLITE_ROOT to the isolated PGlite install');
const { PGlite } = createRequire(resolve(process.env.TRAINING_PGLITE_ROOT, 'package.json'))('@electric-sql/pglite');
const root = fileURLToPath(new URL('../', import.meta.url));
const production = process.env.TRAINING_UPGRADE_BASE || '2879a6c590e20033874cfe1dc159e6e680f6cd4c';
const git = args => execFileSync('git', args, { cwd: root });
function dependencyLock(bytes) {
  const lock = JSON.parse(bytes);
  delete lock.version;
  delete lock.packages[''].version;
  return lock;
}
assert.deepEqual(dependencyLock(git(['show', production + ':package-lock.json'])),
  dependencyLock(await readFile(resolve(root, 'package-lock.json'))), 'old build must use the same dependency lock');
const oldVersion = JSON.parse(git(['show', production + ':package.json'])).version;
const newVersion = JSON.parse(await readFile(resolve(root, 'package.json'))).version;
assert.notEqual(newVersion, oldVersion);
const oldPaths = git(['ls-tree', '-r', '--name-only', production, '--', 'dist']).toString().trim().split(/\r?\n/u);
const oldFiles = new Map(oldPaths.map(path => [path.slice(5), git(['show', production + ':' + path])]));
const newPaths = [...new Set((git(['ls-files', '--', 'dist']).toString() + git(['ls-files', '--others', '--exclude-standard', '--', 'dist']).toString()).trim().split(/\r?\n/u))];
const newFiles = new Map(await Promise.all(newPaths.map(async path => [path.slice(5), await readFile(resolve(root, path))])));
for (const name of ['auth-sdk.mjs', 'meal-zip.mjs']) {
  const bytes = await readFile(resolve(root, 'dist', name));
  oldFiles.set(name, bytes);
  newFiles.set(name, bytes);
}
const cacheName = files => files.get('sw.js').toString().match(/mantou-training-shell-v\d+/u)[0];
const oldCache = cacheName(oldFiles), newCache = cacheName(newFiles);
const oldSupportsStrength=oldFiles.has('strength-plan.mjs');
const securityHeaders=JSON.parse(await readFile(resolve(root,'vercel.json'),'utf8')).headers.find(x=>x.source==='/(.*)')?.headers||[];
assert.notEqual(newCache, oldCache);
assert(oldFiles.get('sw.js').includes(oldCache));
assert(newFiles.get('sw.js').includes(newCache));

const db = await PGlite.create('memory://');
const { publicKey, privateKey } = await generateKeyPair('EdDSA');
const jwk = { ...await exportJWK(publicKey), kid: 'release-rehearsal', alg: 'EdDSA' };
const user = { id: crypto.randomUUID(), email: 'upgrade@example.invalid' };
const other = { id: crypto.randomUUID(), email: 'other@example.invalid' };
const sessionCookie = 'rehearsal=' + crypto.randomUUID();
const mime = { '.mjs': 'text/javascript', '.js': 'text/javascript', '.html': 'text/html', '.css': 'text/css',
  '.png': 'image/png', '.svg': 'image/svg+xml', '.webmanifest': 'application/manifest+json' };
const rawParsers = Object.fromEntries([16, 20, 25, 3802].map(oid => [oid, value => value]));
let origin, token, handlers, assets = oldFiles, pauseSync = false, signIns = 0, sqlCalls = 0;
const serverErrors = [];
const server = createServer(async (req, res) => {
  const u = new URL(req.url, 'http://127.0.0.1');
  const path = u.pathname;
  const json = (status, value) => {
    res.statusCode = status;
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify(value));
  };
  try {
    if(assets===newFiles)for(const {key,value}of securityHeaders)res.setHeader(key,value);
    res.setHeader('Cache-Control', 'no-store');
    if (path === '/cloud-config.mjs') {
      res.setHeader('Content-Type', 'text/javascript');
      return res.end('export const AUTH_URL=' + JSON.stringify(origin + '/neondb/auth') + ';');
    }
    if (path.startsWith('/neondb/auth/') || path.startsWith('/api/') || path === '/__sql') {
      let raw = '';
      for await (const chunk of req) raw += chunk;
      req.body = raw ? JSON.parse(raw) : undefined;
    }
    if (path.startsWith('/neondb/auth/')) {
      const authorized = (req.headers.cookie || '').split('; ').includes(sessionCookie);
      if (path.endsWith('/.well-known/jwks.json')) return json(200, { keys: [jwk] });
      if (path.endsWith('/email-otp/send-verification-otp') && req.body?.email === user.email) return json(200, { success: true });
      if (path.endsWith('/sign-in/email-otp') && req.body?.email === user.email && req.body?.otp === '123456') {
        signIns++;
        res.setHeader('Set-Cookie', sessionCookie + '; Path=/neondb/auth; HttpOnly; SameSite=Lax');
        return json(200, { user, token: 'rehearsal-session' });
      }
      if (path.endsWith('/get-session')) return json(200, authorized ? { user, session: { id: 'rehearsal-session' } } : null);
      if (path.endsWith('/token') && authorized) return json(200, { token });
      return json(401, { error: 'Isolated fixture: invalid session' });
    }
    if (path === '/__sql') {
      sqlCalls++;
      const { query, params } = req.body;
      const result = await db.query(query, params, { rowMode: 'array', parsers: rawParsers });
      return json(200, { ...result, rowCount: result.affectedRows || result.rows.length });
    }
    if (handlers[path]) {
      if (pauseSync) return json(503, { error: 'Isolated fixture: sync unavailable' });
      req.query = Object.fromEntries(u.searchParams);
      const reply = {
        setHeader: (...args) => res.setHeader(...args),
        status(code) { res.statusCode = code; return this; },
        json(value) { return json(res.statusCode, value); }
      };
      return await handlers[path](req, reply);
    }
    const name = path === '/' ? 'index.html' : path.slice(1);
    if (!assets.has(name)) return json(404, { error: 'Missing rehearsal asset' });
    res.setHeader('Content-Type', mime[name.slice(name.lastIndexOf('.'))] || 'application/octet-stream');
    res.end(assets.get(name));
  } catch (error) {
    serverErrors.push(error.message);
    if (!res.headersSent) json(500, { error: 'Rehearsal server failed' });
    else res.end();
  }
});
let browser;
try {
  for (const file of ['001-training-sync.sql', '002-meal-photos.sql']) {
    await db.exec(await readFile(resolve(root, 'migrations', file), 'utf8'));
  }
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  origin = 'http://127.0.0.1:' + server.address().port;
  process.env.AUTH_URL = origin + '/neondb/auth';
  process.env.DATABASE_URL = 'postgresql://rehearsal:synthetic@db.example.invalid/rehearsal';
  neonConfig.fetchEndpoint = () => origin + '/__sql';
  const sign = person => new SignJWT({ role: 'authenticated', email: person.email })
    .setProtectedHeader({ alg: 'EdDSA', kid: jwk.kid }).setSubject(person.id)
    .setIssuer(origin).setAudience(origin).setIssuedAt().setExpirationTime('30m').sign(privateKey);
  token = await sign(user);
  handlers = { '/api/sync': (await import('../api/sync.mjs')).default, '/api/meals': (await import('../api/meals.mjs')).default };
  const wrong = await fetch(origin + '/api/sync', { headers: { Authorization: 'Bearer ' + token, 'X-Account-Id': other.id } });
  assert.equal(wrong.status, 401);
  assert.equal(sqlCalls, 0);

  browser = await chromium.launch({ channel: process.env.BROWSER_CHANNEL || (process.platform === 'win32' ? 'msedge' : undefined), headless: true });
  const pageErrors = [], cacheKey = 'mantou-training-account:' + user.id;
  async function device(viewport) {
    const context = await browser.newContext({ viewport, timezoneId: 'Asia/Shanghai' });
    const page = await context.newPage();
    page.setDefaultTimeout(12000);
    page.on('pageerror', e => pageErrors.push(e.message));
    await page.goto(origin);
    await waitCache(page, oldCache);
    assert((await page.locator('footer').innerText()).endsWith('v' + oldVersion));
    return page;
  }
  const waitCache = async (page, key) => {
    await page.waitForFunction(() => Boolean(navigator.serviceWorker.controller), null, { timeout: 25000 });
    assert(await page.evaluate(async key => Boolean(await (await caches.open(key)).match('/')), key));
  };
  const envelope = page => page.evaluate(key => JSON.parse(localStorage.getItem(key)), cacheKey);
  const settled = page => page.waitForFunction(key => {
    const state = JSON.parse(localStorage.getItem(key) || 'null');
    return state?.revision > 0 && !state.pending && !state.conflict;
  }, cacheKey);
  const close = async page => {
    await page.locator('#closeDialog').click();
    await page.locator('#exerciseDialog').waitFor({ state: 'hidden' });
  };
  const selectPlan = page => page.locator('[data-page="plan"]').click();
  const syncNow = async page => {
    await page.locator('#accountShortcut').click();
    await page.getByRole('button', { name: '立即同步', exact: true }).click();
    await settled(page);
    await selectPlan(page);
  };
  async function login(page) {
    await page.locator('#accountShortcut').click();
    await page.getByRole('textbox', { name: '邮箱', exact: true }).fill(user.email);
    await page.getByRole('button', { name: '发送邮箱验证码', exact: true }).click();
    await page.getByRole('textbox', { name: '邮箱验证码', exact: true }).fill('123456');
    await page.getByRole('button', { name: '登录并同步', exact: true }).click();
    await settled(page);
    await selectPlan(page);
  }
  const photos = page => page.evaluate(async () => {
    const { mealStore } = await import('/meal-photos.mjs');
    return (await mealStore().all()).filter(photo => !photo.deleted);
  });
  const oldLocal = state => Object.values(state.journal.entries).find(e => e.kind === 'session');
  const active = state => state.journal.trials[state.journal.settings.activeTrial];
  const firstNight = '2020-01-02', secondNight = '2020-01-03';
  const sleepRecord = (state, date) => state.journal.entries['daily:' + date]?.fields.samsungSleep;
  const zip = { name: 'synthetic-sleep.zip', mimeType: 'application/zip', buffer: Buffer.from(zipSync({
    'com.samsung.shealth.sleep.20200103.csv': strToU8(
      'samsung,1\ndatauuid,start_time,end_time,time_offset,update_time\n' +
      'night-one,2020-01-01 23:00:00.000,2020-01-02 00:00:00.000,UTC+0800,2020-01-02 01:00:00.000\n' +
      'night-two,2020-01-02 23:00:00.000,2020-01-03 00:00:00.000,UTC+0800,2020-01-03 01:00:00.000\n'),
    'com.samsung.health.sleep_stage.20200103.csv': strToU8(
      'samsung,1\nsleep_id,start_time,end_time,stage\n' +
      'night-one,2020-01-01 23:00:00.000,2020-01-02 00:00:00.000,40002\n' +
      'night-two,2020-01-02 23:00:00.000,2020-01-03 00:00:00.000,40002\n')
  })) };
  async function openSleepZip(page) {
    await page.locator('[data-page="history"]').click();
    await page.locator('#importSleep').click();
    await page.locator('#sleepFile').setInputFiles(zip);
  }
  const lowerTargets = state => Object.values(state.journal.entries)
    .filter(e => e.kind === 'session' && !e.fields.workout).map(e => e.fields.plan[0].min).sort((a, b) => a - b);
  async function openMeal(page, meal, {daily=false}={}) {
    await page.locator('#todayFeedback').click();
    if(daily&&await page.locator('#moreDaily').count())await page.locator('#moreDaily').click();
    await page.locator('[data-meal="' + meal + '"]').click();
  }
  async function openTrainingFeedback(page) {
    await page.locator('#beginSession').click();
    if(await page.locator('#backSession').count())await page.locator('#backSession').click();
  }
  async function savePhoto(page, meal, bytes, pending) {
    await page.locator('#mealFile').setInputFiles({ name: meal + '.jpg', mimeType: 'image/jpeg', buffer: bytes });
    await page.waitForFunction(async ({ meal, pending }) => {
      const { mealStore } = await import('/meal-photos.mjs');
      return (await mealStore().all()).some(photo => photo.meal === meal && !photo.deleted && photo.pending === pending);
    }, { meal, pending });
  }
  async function upgrade(page) {
    await page.goto(origin + '/update.html');
    await page.locator('#update').click();
    await page.waitForURL(url => url.searchParams.get('updated') === newVersion, { timeout: 60000 });
    await waitCache(page, newCache);
    assert((await page.locator('footer').innerText()).endsWith('v' + newVersion));
    assert(!(await page.evaluate(() => caches.keys())).includes(oldCache));
  }

  const phone = await device({ width: 390, height: 844 });
  await login(phone);
  await phone.locator('#startTrial').click();
  await phone.locator('#startTrialForm button[type="submit"]').click();
  await openTrainingFeedback(phone);
  await phone.locator('[data-field="notes"]').fill('生产旧版训练样例');
  await close(phone);
  const first = oldLocal((await envelope(phone)).local);
  assert.equal(first.fields.notes, '生产旧版训练样例');
  assert.equal(first.fields.plan[0].min, 6);
  const image = Buffer.from(await phone.evaluate(() => {
    const canvas = document.createElement('canvas');
    canvas.width = 640;
    canvas.height = 480;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#537753';
    ctx.fillRect(0, 0, 640, 480);
    return canvas.toDataURL('image/jpeg').split(',')[1];
  }), 'base64');
  await openMeal(phone, 'lunch');
  await savePhoto(phone, 'lunch', image, false);
  await close(phone);
  await openSleepZip(phone);
  if (oldVersion === '2.3.7') {
    await phone.locator('#sleepSelect').selectOption(firstNight);
    await phone.locator('#saveSleep').click();
  } else {
    await phone.locator('#sleepFrom').fill(firstNight);
    await phone.locator('#sleepTo').fill(firstNight);
    await phone.locator('#saveBatchSleep').click();
  }
  await close(phone);
  const oldNight = sleepRecord((await envelope(phone)).local, firstNight);
  assert.equal(oldNight.actualMinutes, 60);
  await syncNow(phone);

  const tablet = await device({ width: 820, height: 1180 });
  await login(tablet);
  await tablet.locator('#beginSession').waitFor();
  assert.equal(oldLocal((await envelope(tablet)).local).fields.notes, first.fields.notes);
  await tablet.context().setOffline(true);
  await openTrainingFeedback(tablet);
  await tablet.locator('#recoveryFields summary').click();
  await tablet.locator('[data-field="recoveryNotes"]').fill('旧版平板离线补记');
  await close(tablet);
  assert.equal((await envelope(tablet)).pending, true);

  await phone.context().setOffline(true);
  await openMeal(phone, 'dinner', {daily:true});
  await phone.locator('[data-field="notes"]').fill('更新前未同步的每日记录');
  await savePhoto(phone, 'dinner', image, true);
  await close(phone);
  const before = await envelope(phone), beforePhotos = await photos(phone);
  assert.equal(before.pending, true);
  assert.deepEqual(beforePhotos.map(p => [p.meal, p.pending]).sort(), [['dinner', true], ['lunch', false]]);
  assert.equal(signIns, 2);
  console.log(`PASS ${oldVersion} writes training, meal photos and a sleep night via an isolated signed account`);

  pauseSync = true;
  assets = newFiles;
  await phone.context().setOffline(false);
  await upgrade(phone);
  assert.deepEqual(await envelope(phone), before);
  assert.deepEqual(await photos(phone), beforePhotos);
  assert.equal(await phone.evaluate(() => JSON.parse(localStorage.getItem('mantou-training-account')).email), user.email);
  if(await phone.locator('#planDetails').count())await phone.locator('#planDetails > summary').click();
  await phone.locator('#adjustTrial').click();
  await phone.locator('#adjustTrialForm summary').first().click();
  await phone.locator('[data-field="0-min"]').fill('7');
  await phone.locator('[data-field="reason"]').fill('升级演练');
  await phone.getByRole('button', { name: '预览改动', exact: true }).click();
  assert.deepEqual(await envelope(phone), before);
  await phone.locator('#confirmAdjust').click();
  await phone.locator('#newSession').click();
  await close(phone);
  assert.deepEqual(lowerTargets((await envelope(phone)).local), [6, 7]);
  await openSleepZip(phone);
  await phone.locator('#sleepFrom').fill(firstNight);
  await phone.locator('#sleepTo').fill(secondNight);
  await phone.getByText(/新增 1 晚 · 修订 0 晚 · 重复跳过 1 晚/u).waitFor();
  await phone.locator('#saveBatchSleep').click();
  await phone.getByText(/重复跳过 2 晚/u).waitFor();
  assert(await phone.locator('#saveBatchSleep').isDisabled());
  await close(phone);
  assert.deepEqual(sleepRecord((await envelope(phone)).local, firstNight), oldNight);
  assert.equal(sleepRecord((await envelope(phone)).local, secondNight).actualMinutes, 60);
  console.log(`PASS ${oldVersion} → ${newVersion} preserves the account, pending writes and old sleep; only the new night is added`);

  pauseSync = false;
  await syncNow(phone);
  await openMeal(phone, 'dinner');
  if(await phone.locator('#mealPhotoDetails > summary').count())await phone.locator('#mealPhotoDetails > summary').click();
  await phone.locator('#retryPhotos').click();
  await phone.getByText('照片已同步；其他设备打开同一天即可查看', { exact: true }).waitFor();
  await close(phone);
  assert((await photos(phone)).every(photo => !photo.pending));

  await tablet.context().setOffline(false);
  await syncNow(tablet);
  assert((await tablet.evaluate(() => caches.keys())).includes(oldCache), 'tablet still runs the old version');
  const mixed = (await envelope(tablet)).local;
  assert.deepEqual(lowerTargets(mixed), [6, 7]);
  assert.equal(active(mixed).plan[0].min, 7);
  assert.equal(active(mixed).changes.length, 1);
  assert.equal(mixed.journal.entries[first.id].fields.recoveryNotes, '旧版平板离线补记');
  assert.deepEqual(sleepRecord(mixed, firstNight), oldNight);
  assert.equal(sleepRecord(mixed, secondNight).actualMinutes, 60);
  assert(Object.values(mixed.journal.entries).some(e => e.fields.notes === '更新前未同步的每日记录'));
  await openMeal(tablet, 'dinner');
  await tablet.locator('#mealGallery img').waitFor();
  await close(tablet);
  await syncNow(phone);
  await phone.waitForFunction(({ key, id }) =>
    JSON.parse(localStorage.getItem(key)).local.journal.entries[id]?.fields.recoveryNotes === '旧版平板离线补记',
    { key: cacheKey, id: first.id });
  assert.deepEqual((await envelope(phone)).local, (await envelope(tablet)).local);
  assert.deepEqual((await photos(tablet)).find(p => p.meal === 'dinner').data, beforePhotos.find(p => p.meal === 'dinner').data);
  const stored = await db.query('SELECT user_id,state FROM training_sync');
  assert.equal(stored.rows.length, 1);
  assert.equal(stored.rows[0].user_id, user.id);
  assert.deepEqual(stored.rows[0].state, (await envelope(phone)).local);
  assert.equal((await db.query('SELECT object_key FROM training_meal_photos')).rows.length, 2);
  console.log('PASS mixed versions converge after reconnect; two sessions, two photos and both sleep nights persist');

  // Older unsupported clients must stop before PUT. 2.4.0 already understands this schema.
  await tablet.context().setOffline(true);
  await openTrainingFeedback(tablet);
  await tablet.locator('[data-field="notes"]').fill('旧版等待更新时补记');
  await close(tablet);
  const pendingOld = await envelope(tablet);
  assert.equal(pendingOld.pending, true);
  await phone.locator('#startStrength').click();
  await phone.locator('#confirmStrength').click();
  await phone.locator('#beginSession').click();await close(phone);
  await syncNow(phone);
  const phase = active((await envelope(phone)).local);
  assert.equal(phase.routine, 'strength3-v1');
  const afterActivation = (await db.query('SELECT state,revision FROM training_sync')).rows[0];
  await tablet.context().setOffline(false);
  await tablet.locator('#accountShortcut').click();
  await tablet.getByRole('button', { name: '立即同步', exact: true }).click();
  if(!oldSupportsStrength){
    await tablet.locator('#systemAlert').filter({ hasText: '同步失败' }).waitFor();
    assert.deepEqual(await envelope(tablet), pendingOld, 'unsupported remote data must not replace pending local data');
    assert.deepEqual((await db.query('SELECT state,revision FROM training_sync')).rows[0], afterActivation);
    console.log('PASS T04-M09: old client rejects journal v2 without dropping pending data or writing over the server');
  }else{
    await settled(tablet);await syncNow(phone);
    assert.equal(active((await envelope(tablet)).local).id,phase.id);
    assert.equal((await envelope(tablet)).local.journal.entries[first.id].fields.notes,'旧版等待更新时补记');
    assert.deepEqual((await envelope(tablet)).local,(await envelope(phone)).local);
    console.log(`PASS schema-compatible ${oldVersion} merges the new phase with its pending feedback`);
  }

  const otherResponse = await fetch(origin + '/api/sync', {
    headers: { Authorization: 'Bearer ' + await sign(other), 'X-Account-Id': other.id }
  });
  assert.equal(otherResponse.status, 200);
  assert.deepEqual(await otherResponse.json(), { state: null, revision: 0 });

  await upgrade(tablet);
  await syncNow(tablet);await syncNow(phone);
  assert.equal(active((await envelope(tablet)).local).id, phase.id);
  assert.equal((await envelope(tablet)).local.journal.entries[first.id].fields.notes, '旧版等待更新时补记');
  assert.deepEqual((await envelope(tablet)).local, (await envelope(phone)).local);
  assert.deepEqual(sleepRecord((await envelope(tablet)).local, firstNight), oldNight);
  assert.deepEqual(lowerTargets((await envelope(tablet)).local), [6, 7]);
  await tablet.context().setOffline(true);
  await tablet.reload();
  await tablet.locator('#beginSession').waitFor();
  await openMeal(tablet, 'dinner');
  await tablet.locator('#mealGallery img').waitFor();
  assert.deepEqual(lowerTargets((await envelope(tablet)).local), [6, 7]);
  assert.deepEqual(serverErrors, []);
  assert.deepEqual(pageErrors, []);
  console.log('PASS T04-M09: second-device upgrade merges the new phase and old pending edit; account isolation, old snapshots, photos, sleep and offline reopen persist');
} finally {
  await browser?.close();
  if (server.listening) {
    server.closeAllConnections();
    await new Promise(resolve => server.close(resolve));
  }
  await db.close();
}
