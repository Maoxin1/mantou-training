import assert from 'node:assert/strict';
import {test} from 'node:test';
import {fresh,validateBackup} from '../dist/engine.mjs';
import {writeEntry} from '../dist/journal.mjs';
import {parseHealthConnect} from '../dist/health-connect-sleep.mjs';
import {createSleepRequest,acceptSleepResult,openSleepResult,applyOneTapSleep} from '../dist/one-tap-sleep.mjs';

const date='2020-01-02';
const raw={
  origin:'nl.appyhapps.healthsync',id:'demo',start:'2020-01-01T15:00:00Z',end:'2020-01-01T23:00:00Z',
  startOffsetSeconds:28800,endOffsetSeconds:28800,lastModified:'2020-01-02T02:00:00Z',stages:[]
};
const [night]=parseHealthConnect(JSON.stringify({format:'mantou-health-connect-sleep',version:1,complete:true,records:[raw]}));
const base64=bytes=>Buffer.from(bytes).toString('base64url');
async function result(request,payload){
  const iv=crypto.getRandomValues(new Uint8Array(12));
  const key=await crypto.subtle.importKey('raw',Buffer.from(request.key,'base64url'),'AES-GCM',false,['encrypt']);
  const ciphertext=await crypto.subtle.encrypt({
    name:'AES-GCM',iv,additionalData:new TextEncoder().encode(request.id)
  },key,new TextEncoder().encode(JSON.stringify(payload)));
  return [request.id,base64(iv),base64(ciphertext)].join('.');
}

test('one tap writes only unambiguous new nights and repeat reads do not write again',()=>{
  const state=fresh();
  writeEntry(state,'daily:'+date,'daily',{date,notes:'已有反馈'});
  const a={...night,id:'split1',start:'2020-01-03T03:00:00.000Z',end:'2020-01-03T04:00:00.000Z',date:'2020-01-03',intervalMinutes:60};
  const b={...a,id:'split2',start:'2020-01-03T07:00:00.000Z',end:'2020-01-03T08:00:00.000Z'};
  const {saved,skipped,review}=applyOneTapSleep(state,[night,a,b]);
  assert.deepEqual({saved,skipped,review:review.map(({date,reason})=>({date,reason}))},{saved:1,skipped:0,review:[
    {date:a.date,reason:'文件中有同日多段或重叠记录，请核对'},
    {date:b.date,reason:'文件中有同日多段或重叠记录，请核对'}
  ]});
  const snapshot=validateBackup(state);
  assert.equal(snapshot.journal.entries['daily:'+date].fields.notes,'已有反馈');
  assert.equal(snapshot.journal.entries['daily:'+a.date],undefined);
  assert.equal(applyOneTapSleep(state,[night]).skipped,1);
  assert.deepEqual(state,snapshot);
});

test('return must match a live request and authenticate before data is accepted',async()=>{
  const clock=Date.now(),request=createSleepRequest('account-a',clock);
  const sealed=await result(request,{version:1,records:[night]});
  assert.equal(acceptSleepResult(request,sealed,clock),true);
  assert.equal(acceptSleepResult(request,sealed,clock+180001),false);
  assert.equal(acceptSleepResult(createSleepRequest('account-a',clock),sealed,clock),false);
  assert.deepEqual(await openSleepResult(request,sealed),{records:[night]});
  const [id,iv,body]=sealed.split('.');
  await assert.rejects(openSleepResult(request,[id,iv,(body[0]==='A'?'B':'A')+body.slice(1)].join('.')));
  await assert.rejects(openSleepResult(request,await result(request,{version:1,records:[{...night,actualMinutes:-2}]})));
  await assert.rejects(openSleepResult(request,await result(request,{version:1,records:[night,{...night}]})));
  const unknown={...night,date:null,endOffsetSeconds:null};
  assert.deepEqual(await openSleepResult(request,await result(request,{version:1,records:[unknown]})),{records:[unknown]});
  assert.deepEqual(await openSleepResult(request,await result(request,{version:1,error:'permission'})),{error:'permission'});
});
