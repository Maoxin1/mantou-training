import {validHealthConnectSleep,planHealthConnectImport,healthConnectLine,healthConnectPartsLine,
  overlappingSavedSleep,sameHealthConnectSleep,summarizeSleepParts} from './health-connect-sleep.mjs';
import {today,writeHealthConnectNights,writeReviewedSleepParts} from './journal.mjs';
import {sleepLine} from './sleep-core.mjs';

const HANDOFF_MS=180000;
const B64=/^[A-Za-z0-9_-]+$/;
const statuses={
  permission:'未授予读取睡眠权限。允许后可重新点击导入。',
  interrupted:'读取中断，请回到训练卡重试。',
  unavailable:'暂时无法读取 Health Connect，请稍后重试。',
  limit:'近 7 天的睡眠数据超出一键导入上限，请用睡眠 JSON 分批导入。'
};
const encode=bytes=>btoa(String.fromCharCode(...bytes)).replaceAll('+','-').replaceAll('/','_').replace(/=+$/,'');
const decode=value=>Uint8Array.from(atob(value.replaceAll('-','+').replaceAll('_','/')),char=>char.charCodeAt(0));

export function createSleepRequest(scope,now=Date.now()){
  const random=size=>encode(crypto.getRandomValues(new Uint8Array(size)));
  return {id:random(16),key:random(32),expiresAt:now+HANDOFF_MS,scope};
}

export function acceptSleepResult(request,value,now=Date.now()){
  if(!request||!Number.isFinite(request.expiresAt)||request.expiresAt<=now||typeof value!=='string'||value.length>36000)return false;
  const parts=value.split('.');
  return parts.length===3&&parts[0]===request.id&&parts[0].length===22&&parts[1].length===16&&parts.every(part=>B64.test(part));
}

export async function openSleepResult(request,value){
  if(!acceptSleepResult(request,value))throw Error('导入已过期，请重新点击一键导入');
  const [id,iv,ciphertext]=value.split('.');
  const key=await crypto.subtle.importKey('raw',decode(request.key),'AES-GCM',false,['decrypt']);
  const clear=await crypto.subtle.decrypt({name:'AES-GCM',iv:decode(iv),additionalData:new TextEncoder().encode(id)},key,decode(ciphertext));
  const result=JSON.parse(new TextDecoder().decode(clear));
  if(result?.version===1&&Object.hasOwn(statuses,result.error)&&Object.keys(result).length===2)return {error:result.error};
  if(result?.version!==1||!Array.isArray(result.records)||result.records.length>64||
      result.records.some(record=>!validHealthConnectSleep(record,{allowUndated:true}))){
    throw Error('收到的睡眠摘要格式无效');
  }
  const keys=result.records.map(r=>r.origin+'|'+r.id);
  if(new Set(keys).size!==keys.length)throw Error('睡眠摘要包含重复标识，请重试');
  return {records:result.records};
}

export function applyOneTapSleep(state,records,asOf=today()){
  const preview=planHealthConnectImport(records,state.journal?.entries||{},asOf);
  const newNights=preview.filter(item=>item.status==='new').map(item=>item.record);
  if(newNights.length)writeHealthConnectNights(state,newNights);
  return {
    saved:newNights.length,
    skipped:preview.filter(item=>item.status==='same').length,
    review:preview.filter(item=>item.status==='review').map(({record,reason})=>({
      date:record.date, reason, detail:healthConnectLine(record), record
    }))
  };
}

const REQUEST='mantou-training-sleep-request';
const RETURN='mantou-training-sleep-return';
const LAST='mantou-training-sleep-last';
const IGNORED='mantou-training-sleep-kept';
const RESULT_HASH='#mantou-sleep=';
const FALLBACK_HASH='#sleep-tool-missing=';
function load(key){
  const raw=localStorage.getItem(key);
  try{return JSON.parse(raw);}catch{return null;}
}
const matchingCandidate=(a,b)=>sameHealthConnectSleep(a.record,b.record)&&a.reason===b.reason;
const storedSignature=rows=>JSON.stringify(rows.map(row=>JSON.stringify(row)).sort());
function ignoredFor(scope){
  const ignored=load(IGNORED);
  return Array.isArray(ignored)?ignored.filter(item=>item?.scope===scope):[];
}
function element(tag,text){
  const node=document.createElement(tag);
  if(text)node.textContent=text;
  return node;
}

export function mountOneTapSleep({currentScope,editableScope,getState,transact,showRecords,renderRecords,notify,releaseEditor,needsReturnReload}){
  let processing=false;
  let expiryTimer;

  function drawReview(target,last){
    const entries=()=>getState().journal?.entries||{};
    const ignored=ignoredFor(last.scope);
    const pending=last.review.filter(item=>!validHealthConnectSleep(item.record)||
      !ignored.some(kept=>matchingCandidate(kept,item)&&
        kept.storedSignature===storedSignature(overlappingSavedSleep(item.record,entries()))));
    const groups=new Map();
    for(const item of pending){
      const group=groups.get(item.date)||[];
      group.push(item);
      groups.set(item.date,group);
    }
    for(const [date,items] of groups){
      const section=element('section');
      section.className='card';
      section.append(element('h3',date||'醒来日期未知'));
      for(const item of items)section.append(element('p',item.detail+'。'+item.reason));
      target.append(section);
      const records=items.map(item=>item.record);
      if(!records.every(record=>validHealthConnectSleep(record))){
        if(items.some(item=>!item.record))section.append(element('p','请重新一键导入一次，载入可处理的明细。'));
        continue;
      }
      const existing=()=>[...new Set(records.flatMap(record=>overlappingSavedSleep(record,entries())))];
      const current=existing();
      const check=()=>{
        const active=load(LAST);
        if(editableScope()!==last.scope||currentScope()!==last.scope||active?.scope!==last.scope||
           JSON.stringify(active.review)!==JSON.stringify(last.review)){
          throw Error('待核对记录或账号已变化，请重新打开记录页');
        }
        return active;
      };
      function action(label,run){
        const button=element('button',label);
        button.type='button';
        button.className='btn secondary';
        button.onclick=()=>{try{run();}catch(error){notify(error.message);}};
        section.append(button);
        return button;
      }
      if(current.length){
        section.append(element('p','已存睡眠'));
        for(const row of current)section.append(element('p',row.date+' · '+
          (row.source==='Health Connect'?healthConnectLine(row):sleepLine(row))));
        action('保留原记录',()=>{
          check();
          if(storedSignature(existing())!==storedSignature(current))throw Error('原记录已变化，请重新打开待核对');
          if(!window.confirm('保留已存睡眠，并在此设备隐藏这批待核对记录？'))return;
          const history=load(IGNORED);
          localStorage.setItem(IGNORED,JSON.stringify([
            ...(Array.isArray(history)?history:[]),...items.map(({record,reason})=>({scope:last.scope,record,reason,storedSignature:storedSignature(overlappingSavedSleep(record,entries()))}))
          ].slice(-200)));
          draw();
          const details=document.querySelector('#oneTapSleepResult details');
          if(details)details.open=true;
          notify('已保留原记录');
        });
        continue;
      }
      if(records.length<2)continue;
      try{
        summarizeSleepParts(records);
        if(pending.some(other=>other.date!==date&&validHealthConnectSleep(other.record,{allowUndated:true})&&
          records.some(record=>other.record.start<record.end&&record.start<other.record.end))){
          throw Error('与另一组待核对记录重叠，请分别核对');
        }
      }catch(error){section.append(element('p',error.message));continue;}
      action('预览合并',()=>{
        check();
        if(section.querySelector('[data-sleep-merge-preview]'))return;
        const preview=element('p',healthConnectPartsLine(records));
        preview.dataset.sleepMergePreview='';
        section.append(preview);
        action('确认同一晚并保存',()=>{
          check();
          transact(state=>writeReviewedSleepParts(state,records),{requireCurrentAccountCache:true});
          const active=load(LAST);
          try{
            localStorage.setItem(LAST,JSON.stringify({...active,review:active.review.filter(item=>
              !items.some(candidate=>matchingCandidate(candidate,item)))}));
          }catch{/* The journal was saved. A reread will identify the confirmed parts. */}
          renderRecords();
          draw();
          notify('已保存合并睡眠');
        });
      });
    }
    return pending.length;
  }

  function draw(){
    const link=document.getElementById('oneTapSleep');
    if(!link)return;
    const agent=navigator.userAgent;
    const supported=/Android/i.test(agent)&&/Chrome\//.test(agent)&&
      !/SamsungBrowser|EdgA|OPR\/|UCBrowser|Vivaldi|; wv\)/i.test(agent)&&window.isSecureContext;
    link.hidden=!supported;
    if(!supported)return;
    const last=load(LAST);
    const feedback=document.getElementById('oneTapSleepResult');
    feedback.replaceChildren();
    if(last&&last.scope===currentScope()){
      const summary=document.createElement('p');
      summary.textContent=last.message;
      feedback.append(summary);
      if(last.review?.length){
        const details=document.createElement('details'),title=document.createElement('summary');
        title.textContent='查看待核对的睡眠';
        details.append(title);
        const count=drawReview(details,last);
        summary.textContent=last.message.replace(/待核对 \d+ 条/,`待核对 ${count} 条`);
        if(count)feedback.append(details);
      }
    }
    link.onclick=event=>{
      try{
        const scope=editableScope();
        if(!scope||scope!==currentScope())throw Error('请在原训练卡窗口重新尝试');
        const request=createSleepRequest(scope);
        const fallback=encodeURIComponent(location.origin+'/'+FALLBACK_HASH+request.id);
        link.href='intent://import/sleep#Intent;scheme=mantou-sleep;package=app.mantou.sleep.bridge;'
          +'S.ticket='+request.id+';S.key='+request.key+';S.site='+encodeURIComponent(location.origin)
          +';S.browser_fallback_url='+fallback+';end';
        localStorage.removeItem(RETURN);
        localStorage.setItem(REQUEST,JSON.stringify(request));
        try{releaseEditor();}
        catch(error){localStorage.removeItem(REQUEST);throw error;}
        clearTimeout(expiryTimer);
        expiryTimer=setTimeout(()=>void consume(),HANDOFF_MS+50);
        feedback.textContent='正在从 Health Connect 读取近 7 天睡眠…';
      }catch(error){event.preventDefault();notify(error.message);}
    };
  }

  function release(request,result){
    // A later click can replace this request while crypto is pending.
    if(load(REQUEST)?.id!==request.id)return;
    localStorage.removeItem(REQUEST);
    localStorage.removeItem(RETURN);
    if(request.scope!==currentScope())return;
    try{
      const previous=load(LAST);
      const review=result.review??(previous?.scope===request.scope?previous.review:undefined);
      localStorage.setItem(LAST,JSON.stringify({scope:request.scope,message:result.message,review}));
    }
    catch{notify(result.message);}
    renderRecords();
    draw();
  }

  function stageReturn(){
    const hash=location.hash;
    if(!hash.startsWith(RESULT_HASH)&&!hash.startsWith(FALLBACK_HASH))return;
    // Reload a reused tab before reacquiring the writer lock and current account cache.
    if(needsReturnReload()){location.reload();return;}
    history.replaceState(history.state,'',location.pathname+location.search);
    const request=load(REQUEST);
    showRecords();
    if(!request||request.scope!==currentScope()||request.expiresAt<=Date.now()){
      notify('没有有效的睡眠导入请求，请重新点击一键导入');
      return;
    }
    if(hash.startsWith(FALLBACK_HASH)){
      if(hash.slice(FALLBACK_HASH.length)!==request.id)return;
      release(request,{message:'未能打开睡眠小工具。请安装匹配版本后在安卓 Chrome 重试。'});
      return;
    }
    const value=hash.slice(RESULT_HASH.length);
    if(!acceptSleepResult(request,value)){notify('睡眠导入响应无效，请重试');return;}
    try{localStorage.setItem(RETURN,value);}
    catch{notify('浏览器存储空间不足，睡眠未保存');}
  }

  async function consume(){
    if(processing||document.querySelector('dialog[open]'))return;
    const request=load(REQUEST);
    const value=localStorage.getItem(RETURN);
    if(!request)return;
    if(request.expiresAt<=Date.now()){
      if(editableScope())release(request,{message:'读取已超时，请在训练卡重新点击一键导入。'});
      return;
    }
    if(!value||editableScope()!==request.scope||currentScope()!==request.scope)return;
    processing=true;
    try{
      const result=await openSleepResult(request,value);
      if(load(REQUEST)?.id!==request.id)return;
      if(editableScope()!==request.scope||currentScope()!==request.scope||request.expiresAt<=Date.now()||
        document.querySelector('dialog[open]'))return;
      if(result.error){release(request,{message:statuses[result.error]});return;}
      const asOf=today();
      const hasNew=planHealthConnectImport(result.records,getState().journal?.entries||{},asOf).some(item=>item.status==='new');
      const summary=hasNew
        ?transact(state=>applyOneTapSleep(state,result.records,asOf),{requireCurrentAccountCache:true})
        :applyOneTapSleep(getState(),result.records,asOf);
      release(request,{message:`已保存 ${summary.saved} 条 · 重复跳过 ${summary.skipped} 条 · 待核对 ${summary.review.length} 条`,
        review:summary.review});
    }catch(error){
      const message=error.name==='OperationError'?'睡眠响应无法验证，请重试。':error.message;
      release(request,{message:'一键导入失败。'+message});
    }finally{processing=false;}
  }

  window.addEventListener('storage',event=>{
    if(event.key===RETURN)void consume();
    if(event.key===LAST)draw();
  });
  window.addEventListener('hashchange',()=>{stageReturn();void consume();});
  window.addEventListener('pageshow',()=>void consume());
  window.addEventListener('training:editor-ready',()=>void consume());
  document.addEventListener('visibilitychange',()=>{if(!document.hidden)void consume();});
  document.addEventListener('close',()=>void consume(),true);
  document.addEventListener('training:render',draw);
  stageReturn();
  void consume();
  draw();
}
