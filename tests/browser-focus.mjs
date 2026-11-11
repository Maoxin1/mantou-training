import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {mkdir} from 'node:fs/promises';
import {chromium} from 'playwright';
const port='4196',base=process.env.TRAINING_BASE_URL||`http://127.0.0.1:${port}/`;
const server=process.env.TRAINING_BASE_URL?null:spawn(process.execPath,['scripts/serve.mjs'],{env:{...process.env,PORT:port},stdio:['ignore','pipe','inherit']});
let browser;
try{
  if(server)await new Promise((resolve,reject)=>{server.stdout.once('data',resolve);server.once('error',reject);});
  browser=await chromium.launch({channel:process.env.BROWSER_CHANNEL||(process.platform==='win32'?'msedge':undefined),headless:true});
  const context=await browser.newContext({viewport:{width:390,height:844}}),page=await context.newPage(),errors=[];
  page.on('pageerror',e=>errors.push(e.message));page.setDefaultTimeout(4000);
  const read=()=>page.evaluate(()=>JSON.parse(localStorage.getItem('mantou-training-v1')));
  const close=()=>page.click('#closeDialog');
  await mkdir('test-output',{recursive:true});
  const response=await page.goto(base);
  assert.match(response.headers()['content-security-policy'],/script-src 'self'/);
  await page.evaluate(()=>{const el=document.createElement('script');el.textContent='window.injectedMarker=true';document.body.append(el);});
  assert.equal(await page.evaluate(()=>window.injectedMarker),undefined,'inline injection is blocked by actual HTTP CSP');
  await page.click('#startStrength');await page.click('#confirmStrength');
  await page.selectOption('#strengthWorkout','A');
  if(!process.env.FOCUS_CASE||process.env.FOCUS_CASE==='training'){
    assert.equal(await page.locator('#sessionActions').getAttribute('open'),null);
    await page.click('#beginSession');
    assert.equal(await page.locator('#trialSetRows').count(),1,'T05-M01: start goes directly to exercise rows');
    assert.equal(await page.locator('[data-field=pain]').count(),0,'post-workout fields are not the start step');
    assert.equal(await page.locator('[data-row="0"][data-key=load]').isVisible(),true,'load is visible without expanding');
    assert.equal(await page.locator('[data-row="0"][data-key=left]').inputValue(),'');
    await page.locator('[data-row="0"][data-key=left]').fill('0');await close();
    const s=await read(),log=Object.values(s.journal.entries).find(e=>e.kind==='exercise');
    assert.equal(log.fields.rows[0].left,0);assert.equal(log.fields.rows[1].left,null);
    await page.click('#beginSession');assert.match(await page.locator('#dialogTitle').innerText(),/划船/,'T05-B03: continue must not skip a partly recorded exercise');
    await page.locator('[data-row="0"][data-key=right]').fill('0');
    await close();
    await page.getByText('第 2 组次数待填',{exact:true}).waitFor();
    assert.match(await page.locator('.training-resume').innerText(),/第 2 组次数待填/);
    assert.equal(await page.getByRole('img',{name:'次数已填 1/2 组'}).count(),1);
    await page.screenshot({path:'test-output/focus-continue.png'});
    await page.click('#beginSession');
    assert.match(await page.locator('.next-training-group legend').innerText(),/第2组/);
    const beforeFailure=await read();
    await page.evaluate(()=>{
      window.originalSetItem=Storage.prototype.setItem;
      Storage.prototype.setItem=function(key,value){
        if(key==='mantou-training-v1')throw new Error('模拟设备存储失败');
        return window.originalSetItem.call(this,key,value);
      };
    });
    await page.locator('[data-row="1"][data-key=left]').fill('8');
    assert.match(await page.locator('#journalSave').innerText(),/保存失败/);
    assert.equal(await page.locator('[data-row="1"][data-key=left]').inputValue(),'8');
    assert.deepEqual(await read(),beforeFailure);
    await page.screenshot({path:'test-output/focus-save-error.png'});
    await page.evaluate(()=>{Storage.prototype.setItem=window.originalSetItem;delete window.originalSetItem;});
    await page.locator('[data-row="1"][data-key=left]').fill('10');await page.locator('[data-row="1"][data-key=right]').fill('10');
    await close();await page.click('#beginSession');assert.match(await page.locator('#dialogTitle').innerText(),/俯卧撑/);
    await close();
    console.log('PASS T05-M01: exercise first, visible load, empty vs zero, continue to unrecorded action');
  }
  if(!process.env.FOCUS_CASE||process.env.FOCUS_CASE==='meal'){
    await page.click('#todayFeedback');
    assert.equal(await page.locator('#mealFile').count(),1);
    assert.equal(await page.locator('[data-field=sleepQuality]').count(),0,'T05-M02: meal is independent of daily feedback');
    const [chooser]=await Promise.all([page.waitForEvent('filechooser'),page.locator('.meal-camera').click()]);
    assert.equal(await chooser.element().getAttribute('id'),'mealCamera');
    assert.equal(await page.locator('#mealPortionDetails').getAttribute('open'),null);
    await page.click('[data-meal=lunch]');await page.click('#mealPortionDetails > summary');await page.locator('#mealAmounts select').selectOption('part');
    await close();await page.click('#todayFeedback');await page.click('[data-meal=lunch]');
    assert.equal(await page.locator('#mealAmounts select').inputValue(),'part');await close();
    console.log('PASS T05-M02: independent meal entry retains actual portion');
  }
  if(!process.env.FOCUS_CASE||process.env.FOCUS_CASE==='review'){
    const original=await read();
    await page.click('#quickReview');
    assert.equal(await page.locator('#reviewSummary').count(),1,'T05-M03: human-readable summary');
    assert.equal(await page.locator('.review-preview').isVisible(),false,'raw frontmatter is folded');
    await page.click('#reviewMissing > summary');
    assert.match(await page.locator('#reviewMissing').innerText(),/未填|未记录/);
    await close();assert.deepEqual(await read(),original,'viewing review does not write facts');
    await page.evaluate(async()=>{
      const {writeEntry,today}=await import('/journal.mjs');const s=JSON.parse(localStorage.getItem('mantou-training-v1'));
      writeEntry(s,'daily:'+today(),'daily',{date:today(),notes:'<img src=x onerror="window.badReview=true">'});
      localStorage.setItem('mantou-training-v1',JSON.stringify(s));
    });await page.reload();await page.click('#quickReview');
    await page.click('#reviewDaily > summary');
    const d=page.locator('#reviewDaily > details');await d.locator('summary').click();
    assert((await d.innerText()).includes('<img src=x'));assert.equal(await d.locator('img').count(),0);
    assert.equal(await page.evaluate(()=>window.badReview),undefined);await close();
    console.log('PASS T05-M03: factual summary, optional original, no mutation or HTML injection');
  }
  if(!process.env.FOCUS_CASE||process.env.FOCUS_CASE==='layout'){
    for(const width of [390,820,320]){
      await page.setViewportSize({width,height:900});
      assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
      for(const selector of ['#accountShortcut','#beginSession','#todayFeedback']){
        const b=await page.locator(selector).boundingBox();assert(b.width>=44&&b.height>=44,selector+' touch target');
      }
    }
    await page.click('#todayFeedback');
    const font=await page.locator('#mealAmounts select').evaluate(el=>parseFloat(getComputedStyle(el).fontSize));assert(font>=16);
    await close();await page.click('[data-page=export]');
    assert.equal(await page.locator('#exportMealBackup').isVisible(),true);
    assert.equal(await page.locator('#exportMarkdown').isVisible(),false,'legacy report is optional');
    await page.click('#legacyExports summary');assert.equal(await page.locator('#exportBackup').isVisible(),true);
    await page.click('[data-page=plan]');await page.setViewportSize({width:390,height:844});
    await page.evaluate(()=>document.documentElement.style.fontSize='200%');
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true,'200% text keeps main within viewport');
    await page.click('#beginSession');
    assert.equal(await page.locator('#exerciseDialog').evaluate(el=>el.scrollWidth<=el.clientWidth+1),true,'200% exercise form fits');
    await close();await page.evaluate(()=>document.documentElement.style.fontSize='');
    console.log('PASS T05-M04: touch targets, font and legacy export disclosure');
  }
  if(!process.env.FOCUS_CASE||process.env.FOCUS_CASE==='paused'){
    await page.evaluate(async()=>{
      const {fresh}=await import('/engine.mjs');const {startTrial,activeTrial,changePlan,today}=await import('/journal.mjs');
      const s=fresh();startTrial(s,{start:today(),routine:'strength3-v1'});
      changePlan(s,activeTrial(s).plan.map(p=>({...p,paused:true,pauseReason:'fixture'})),'paused fixture');
      localStorage.setItem('mantou-training-v1',JSON.stringify(s));
    });await page.reload();const before=await read();await page.click('#beginSession');
    assert.equal(await page.locator('#exerciseDialog').isVisible(),false);assert.deepEqual(await read(),before,'all paused does not create an empty session');
    console.log('PASS T05-M01 edge: all paused preserves state');
  }
  await page.evaluate(async()=>{
    const {fresh}=await import('/engine.mjs');const {startTrial,today}=await import('/journal.mjs');
    const s=fresh();startTrial(s,{start:today(),routine:'strength3-v1'});localStorage.setItem('mantou-training-v1',JSON.stringify(s));
  });await page.reload();
  for(const [label,width,height] of [['phone',390,844],['tablet',820,1180]]){
    await page.setViewportSize({width,height});await page.screenshot({path:`test-output/focus-${label}.png`,fullPage:true});
  }
  await page.setViewportSize({width:390,height:844});
  for(const [name,selector]of [['exercise','#beginSession'],['meal','#todayFeedback'],['review','#quickReview']]){
    await page.click(selector);await page.screenshot({path:`test-output/focus-${name}.png`,fullPage:true});await close();
  }
  await page.evaluate(async()=>{
    const {mountJournal}=await import('/journal-ui.mjs');
    const state=JSON.parse(localStorage.getItem('mantou-training-v1'));
    window.focusFixture=mountJournal({getState:()=>state,transact:fn=>fn(state),notify:()=>{},download:()=>{}});
    window.focusFixture.renderPlan();
  });
  await page.click('#planDetails > summary');
  await page.click('#sessionActions > summary');
  await page.evaluate(()=>window.focusFixture.renderPlan());
  assert.equal(await page.locator('#adjustTrial').isVisible(),true,'T05-B02: background render preserves an open plan menu');
  assert.equal(await page.locator('#sessionActions').getAttribute('open'),'','background render keeps an open action list');
  const historicalDate=await page.evaluate(async()=>{
    const {fresh}=await import('/engine.mjs');
    const {startTrial,startSession,today,plusDays}=await import('/journal.mjs');
    const s=fresh(),date=plusDays(today(),-9);
    startTrial(s,{start:date,routine:'strength3-v1'});
    startSession(s,{date,workout:'A'});
    localStorage.setItem('mantou-training-v1',JSON.stringify(s));
    return date;
  });
  await page.reload();await page.click('[data-page=history]');
  await page.locator('#journalDate').fill(historicalDate);
  await page.locator('#journalDate').dispatchEvent('change');
  await page.locator('.card [data-session]').click();await close();await page.click('[data-page=plan]');
  assert.equal(await page.locator('#main h1').innerText(),'补记历史场次');
  assert.equal(await page.locator('.training-date').innerText(),historicalDate);
  assert.equal(await page.locator('#newSession').innerText(),'新建今天训练');
  const beforeHistorical=await read();
  await page.click('#beginSession');
  assert.match(await page.locator('#dialogContent > .muted').first().innerText(),new RegExp(historicalDate));
  await close();
  assert.deepEqual(await read(),beforeHistorical,'opening historical training keeps its existing session');
  await page.click('#quickReview');
  await page.click('.review-date-picker > summary');
  await page.locator('[data-field=reviewDate]').fill(historicalDate);
  await page.locator('.review-date > p').filter({hasText:historicalDate}).waitFor();
  await page.click('#reviewSessions > summary');
  assert.match(await page.locator('#reviewSessions').innerText(),new RegExp(historicalDate));
  await close();
  assert.deepEqual(await read(),beforeHistorical,'changing the review date only changes the view');
  assert.deepEqual(errors,[]);
}finally{await browser?.close();server?.kill();}
