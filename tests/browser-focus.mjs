import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {mkdir} from 'node:fs/promises';
import {chromium} from 'playwright';
const port='4196',base=`http://127.0.0.1:${port}/`;
const server=spawn(process.execPath,['scripts/serve.mjs'],{env:{...process.env,PORT:port},stdio:['ignore','pipe','inherit']});
let browser;
try{
  await new Promise((resolve,reject)=>{server.stdout.once('data',resolve);server.once('error',reject);});
  browser=await chromium.launch({channel:process.env.BROWSER_CHANNEL||(process.platform==='win32'?'msedge':undefined),headless:true});
  const context=await browser.newContext({viewport:{width:390,height:844}}),page=await context.newPage(),errors=[];
  page.on('pageerror',e=>errors.push(e.message));page.setDefaultTimeout(4000);
  const read=()=>page.evaluate(()=>JSON.parse(localStorage.getItem('mantou-training-v1')));
  const close=()=>page.click('#closeDialog');
  const response=await page.goto(base);
  assert.match(response.headers()['content-security-policy'],/script-src 'self'/);
  await page.evaluate(()=>{const el=document.createElement('script');el.textContent='window.injectedMarker=true';document.body.append(el);});
  assert.equal(await page.evaluate(()=>window.injectedMarker),undefined,'inline injection is blocked by actual HTTP CSP');
  await page.click('#startStrength');await page.click('#confirmStrength');
  await page.selectOption('#strengthWorkout','A');
  if(!process.env.FOCUS_CASE||process.env.FOCUS_CASE==='training'){
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
    await page.locator('[data-row="1"][data-key=left]').fill('10');await page.locator('[data-row="1"][data-key=right]').fill('10');
    await close();await page.click('#beginSession');assert.match(await page.locator('#dialogTitle').innerText(),/俯卧撑/);
    await close();
    console.log('PASS T05-M01: exercise first, visible load, empty vs zero, continue to unrecorded action');
  }
  if(!process.env.FOCUS_CASE||process.env.FOCUS_CASE==='meal'){
    await page.click('#todayFeedback');
    assert.equal(await page.locator('#mealFile').count(),1);
    assert.equal(await page.locator('[data-field=sleepQuality]').count(),0,'T05-M02: meal is independent of daily feedback');
    await page.click('[data-meal=lunch]');await page.locator('#mealAmounts select').selectOption('part');
    await close();await page.click('#todayFeedback');await page.click('[data-meal=lunch]');
    assert.equal(await page.locator('#mealAmounts select').inputValue(),'part');await close();
    console.log('PASS T05-M02: independent meal entry retains actual portion');
  }
  if(!process.env.FOCUS_CASE||process.env.FOCUS_CASE==='review'){
    const original=await read();
    await page.click('#quickReview');
    assert.equal(await page.locator('#reviewSummary').count(),1,'T05-M03: human-readable summary');
    assert.equal(await page.locator('.review-preview').isVisible(),false,'raw frontmatter is folded');
    assert.match(await page.locator('#reviewSummary').innerText(),/未填|未记录/);
    await close();assert.deepEqual(await read(),original,'viewing review does not write facts');
    await page.evaluate(async()=>{
      const {writeEntry,today}=await import('/journal.mjs');const s=JSON.parse(localStorage.getItem('mantou-training-v1'));
      writeEntry(s,'daily:'+today(),'daily',{date:today(),notes:'<img src=x onerror="window.badReview=true">'});
      localStorage.setItem('mantou-training-v1',JSON.stringify(s));
    });await page.reload();await page.click('#quickReview');
    const d=page.locator('#reviewSummary details').last();await d.locator('summary').click();
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
  });await page.reload();await mkdir('test-output',{recursive:true});
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
  await page.evaluate(()=>window.focusFixture.renderPlan());
  assert.equal(await page.locator('#adjustTrial').isVisible(),true,'T05-B02: background render preserves an open plan menu');
  assert.deepEqual(errors,[]);
}finally{await browser?.close();server.kill();}
