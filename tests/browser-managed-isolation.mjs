// Managed staging auth + unmodified app/API + actual staging SQL. Password sessions,
// not email OTP delivery. No token, cookie, credential or user data is logged.
import assert from 'node:assert/strict';
import {randomBytes,randomUUID,createHash} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import {chromium} from 'playwright';
import {unzipSync,strFromU8} from 'fflate';
import {managedFixture} from './helpers/managed-fixture.mjs';

let fixture,browser,phase='configuration';
const assertSafe=(ok,message)=>{if(!ok)throw Error(message);};
const digest=bytes=>createHash('sha256').update(bytes).digest('hex');
try{
  fixture=await managedFixture(process.env.TRAINING_MANAGED_CONFIG);
  browser=await chromium.launch({channel:process.env.BROWSER_CHANNEL||(process.platform==='win32'?'msedge':undefined),headless:true});
  const contexts=[],errors=[];
  const newPage=async(storageState)=>{
    const context=await browser.newContext({viewport:{width:390,height:844},...(storageState?{storageState}:{})});contexts.push(context);
    const page=await context.newPage();page.setDefaultTimeout(30000);page.on('pageerror',()=>errors.push('Browser runtime error'));
    // These are blocked as an additional guard: this script must never send OTP mail.
    await page.route('**/email-otp/**',route=>route.abort());
    await page.goto(fixture.origin);return page;
  };
  const authenticate=async(page,account,{register=false}={})=>{
    const user=await page.evaluate(async({account,register})=>{
      const {createAuthClient,BetterAuthVanillaAdapter}=await import('/auth-sdk.mjs');const {AUTH_URL}=await import('/cloud-config.mjs');
      const auth=createAuthClient(AUTH_URL,{adapter:BetterAuthVanillaAdapter({fetchOptions:{credentials:'include'}})});
      if(register){const r=await auth.signUp.email({email:account.email,password:account.password,name:'TRAIN-05 synthetic QA'});if(r.error)return {failure:'managed password registration rejected',code:r.error.code||'unknown'};await auth.signOut();}
      const signed=await auth.signIn.email({email:account.email,password:account.password});if(signed.error)return {failure:'managed password sign-in rejected',code:signed.error.code||'unknown'};
      const session=await auth.getSession();if(!session.data?.user)return {failure:'managed getSession did not return a user'};
      if(session.data.user.email!==account.email)return {failure:'managed session identity does not match requested account'};
      // The app currently exposes OTP UI only and restores its pointer on reload.
      // Seed only the identity returned by the real managed service; never seed a JWT.
      const user={id:session.data.user.id,email:session.data.user.email};
      localStorage.setItem('mantou-training-account',JSON.stringify(user));return user;
    },{account,register});
    assertSafe(!user.failure,(user.failure||'Authentication failed')+(user.code?' ('+user.code+')':''));
    await page.reload();return user;
  };
  const snapshot=page=>page.evaluate(async()=>{
    const {AUTH_URL}=await import('/cloud-config.mjs'),{getSyncToken}=await import('/cloud-token.mjs');
    const account=JSON.parse(localStorage.getItem('mantou-training-account'));
    const token=await getSyncToken(AUTH_URL);const r=await fetch('/api/sync',{headers:{Authorization:'Bearer '+token,'X-Account-Id':account.id},cache:'no-store'});
    return {status:r.status,...await r.json()};
  });
  const waitMarker=async(page,marker)=>{
    await page.waitForFunction(marker=>{const id=JSON.parse(localStorage.getItem('mantou-training-account')||'null')?.id;const raw=id&&localStorage.getItem('mantou-training-account:'+id);if(!raw)return false;const s=JSON.parse(raw);return !s.pending&&JSON.stringify(s.local).includes(marker);},marker,{timeout:45000});
    const remote=await snapshot(page);assertSafe(remote.status===200&&JSON.stringify(remote.state).includes(marker),'Managed SQL did not retain the account marker');return remote;
  };
  const logout=async page=>{
    await page.click('#accountShortcut');await page.getByRole('button',{name:'退出账号',exact:true}).click();
    await page.waitForFunction(()=>localStorage.getItem('mantou-training-account')===null);
  };
  const seed=async(page,marker,color)=>{
    await page.click('#startStrength');await page.click('#confirmStrength');await page.click('#beginSession');
    await page.locator('[data-row="0"][data-key="left"], [data-row="0"][data-key="reps"]').first().fill('8');await page.click('#closeDialog');
    await page.click('#todayFeedback');await page.click('[data-meal=lunch]');await page.locator('#mealAmounts input').fill(marker);await page.locator('#mealAmounts select').selectOption('part');
    const image=await page.evaluate(color=>{const c=document.createElement('canvas');c.width=160;c.height=120;c.getContext('2d').fillStyle=color;c.getContext('2d').fillRect(0,0,160,120);return c.toDataURL('image/jpeg').split(',')[1];},color);
    await page.locator('#mealFile').setInputFiles({name:'synthetic.jpg',mimeType:'image/jpeg',buffer:Buffer.from(image,'base64')});
    await page.waitForFunction(()=>!document.getElementById('mealFile').disabled);
    await page.waitForFunction(()=>document.getElementById('photoStatus').textContent.includes('照片已同步'));
    const photos=await page.evaluate(async()=>{const {mealStore}=await import('/meal-photos.mjs');return (await mealStore().all()).filter(p=>!p.deleted);});
    assertSafe(photos.length===1&&!photos[0].pending,'Managed photo upload did not complete');
    await page.click('#closeDialog');await waitMarker(page,marker);return photos[0];
  };
  const downloadZip=async(page,selector)=>{
    const ready=page.waitForEvent('download');await page.click(selector);const item=await ready;const filename=await item.path();return unzipSync(await readFile(filename));
  };
  const verifyZip=(files,self,other,photo,otherPhoto,{full=false}={})=>{
    const manifest=JSON.parse(strFromU8(files['照片清单.json']));
    assertSafe(manifest.complete===true&&manifest.photos.length===1,'ZIP is incomplete or contains an unexpected photo count');
    assertSafe(manifest.photos[0].id===photo.id&&!manifest.photos.some(p=>p.id===otherPhoto.id),'ZIP contains a foreign photo ID');
    const photoFile=files[manifest.photos[0].path];assertSafe(!!photoFile&&digest(photoFile)===digest(Buffer.from(photo.data,'base64')),'ZIP photo differs from the account photo');
    assertSafe(digest(photoFile)!==digest(Buffer.from(otherPhoto.data,'base64')),'ZIP contains the other account image');
    const markdown=strFromU8(files['复盘.md']);assertSafe(markdown.includes(self)&&!markdown.includes(other),'ZIP Markdown account isolation failed');
    if(full){assertSafe(!!files['训练记录.json'],'Full ZIP has no records');const records=strFromU8(files['训练记录.json']);assertSafe(records.includes(self)&&!records.includes(other),'ZIP records account isolation failed');}
  };
  const verifyPage=async(page,self,other,photo,otherPhoto)=>{
    await waitMarker(page,self);const remote=await snapshot(page);assertSafe(!JSON.stringify(remote.state).includes(other),'Remote state contains the other account marker');
    await page.click('[data-page=plan]');await page.click('#todayFeedback');await page.click('[data-meal=lunch]');
    await page.waitForFunction(()=>document.getElementById('photoStatus').textContent.includes('照片已同步'));
    assertSafe(await page.locator('#mealAmounts input').inputValue()===self,'Meal note belongs to the wrong account');
    assertSafe(await page.locator('#mealGallery img').count()===1,'Unexpected account photo count');
    await page.click('#closeDialog');await page.click('#quickReview');verifyZip(await downloadZip(page,'#downloadTrialPhotos'),self,other,photo,otherPhoto);await page.click('#closeDialog');
    await page.click('[data-page=export]');verifyZip(await downloadZip(page,'#exportMealBackup'),self,other,photo,otherPhoto,{full:true});await page.click('[data-page=plan]');
  };
  const sessionOnly=state=>({...state,origins:state.origins.map(origin=>({...origin,localStorage:origin.localStorage.filter(item=>item.name==='mantou-training-account')}))});

  const run=randomUUID().slice(0,12),accounts=['a','b'].map(label=>({email:`train05-${label}-${run}@example.invalid`,password:'Qa!'+randomBytes(24).toString('base64url')}));
  const markers=['TRAIN05-A-'+run,'TRAIN05-B-'+run];
  phase='real managed account A registration/sign-in';const a=await newPage();const userA=await authenticate(a,accounts[0],{register:true});
  console.log('QA identity A user ID: '+userA.id);
  phase='real managed account A app/photo/SQL writes';const photoA=await seed(a,markers[0],'#a20b17');
  const stateA=await a.context().storageState();
  phase='real managed account B registration/sign-in';const b=await newPage();const userB=await authenticate(b,accounts[1],{register:true});
  console.log('QA identity B user ID: '+userB.id);
  assertSafe(userA.id!==userB.id,'Managed identities are not distinct');
  phase='real managed account B app/photo/SQL writes';const photoB=await seed(b,markers[1],'#0869a5');const stateB=await b.context().storageState();
  console.log('PASS real managed password sign-up/sign-in/getSession/token and staging SQL/photo writes for two distinct accounts');
  phase='empty-cache browser account A cloud read and two ZIP exports';const freshA=await newPage(sessionOnly(stateA));await verifyPage(freshA,markers[0],markers[1],photoA,photoB);
  phase='empty-cache browser account B cloud read and two ZIP exports';const freshB=await newPage(sessionOnly(stateB));await verifyPage(freshB,markers[1],markers[0],photoB,photoA);
  console.log('PASS empty-cache browser contexts restore real sessions, read cloud records/photos and export only their own data in full and weekly ZIPs');
  phase='same browser real sign-out A and password sign-in B';await logout(a);await authenticate(a,accounts[1]);await verifyPage(a,markers[1],markers[0],photoB,photoA);
  phase='same browser real sign-out B and password sign-in A';await logout(a);await authenticate(a,accounts[0]);await verifyPage(a,markers[0],markers[1],photoA,photoB);
  console.log('PASS same browser A -> B -> A session switch preserves per-account records, photos and ZIP isolation with old caches retained');
  phase='real token with mismatched account-header rejection';
  const beforeA=await snapshot(a),beforeB=await snapshot(freshB);
  const denied=await a.evaluate(async({other,photo})=>{
    const {AUTH_URL}=await import('/cloud-config.mjs'),{getSyncToken}=await import('/cloud-token.mjs');const token=await getSyncToken(AUTH_URL);
    const headers={Authorization:'Bearer '+token,'X-Account-Id':other,'Content-Type':'application/json'};
    const requests=[['/api/sync','GET'],['/api/sync','PUT',{revision:0,state:{}}],['/api/meals?index=1','GET'],['/api/meals?date='+photo.date,'GET'],['/api/meals?date='+photo.date,'PUT',photo],['/api/meals?date='+photo.date,'DELETE',photo]];
    const statuses=[];for(const [url,method,body]of requests){const r=await fetch(url,{method,headers,...(body?{body:JSON.stringify(body)}:{})});statuses.push(r.status);}return statuses;
  },{other:userB.id,photo:photoB});
  assertSafe(denied.length===6&&denied.every(status=>status===401),'Mismatched managed identity headers were not consistently rejected');
  assert.deepEqual(await snapshot(a),beforeA,'A data changed after rejected requests');assert.deepEqual(await snapshot(freshB),beforeB,'B data changed after rejected requests');
  await verifyPage(freshB,markers[1],markers[0],photoB,photoA);
  assertSafe(fixture.failures.length===0&&errors.length===0,'Managed validation had server/browser runtime errors');
  console.log('PASS six genuine-token/wrong-account API requests rejected; both remote states and B photo/exports remain intact');
  console.log('PASS managed staging isolation acceptance. Password sessions tested; OTP mail delivery and production configuration not tested. Synthetic accounts retained; credentials and sessions stayed in memory.');
}catch(error){
  // Do not print an SDK/driver error: it can contain credentials or session data.
  console.error('FAIL managed isolation phase: '+phase);
  if(error?.name==='AssertionError')console.error('Assertion failed (sensitive values withheld)');
  else if(/^(Managed |managed |ZIP |Meal |Remote |Unexpected |Mismatched )/.test(error?.message||''))console.error(error.message.slice(0,180));
  else console.error('Error category: '+(error?.name||'Unknown')+'; full details withheld to protect authentication material');
  process.exitCode=1;
}finally{await browser?.close();await fixture?.close();}
