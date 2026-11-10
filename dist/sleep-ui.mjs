import {unzipSync,strFromU8} from './meal-zip.mjs';
import {parseSleep,sleepLine,mergeSleepSegments,planSleepImport,sameSleep,includesOlderSleepPart} from './sleep-core.mjs';
import {dateOK,entry,plusDays,writeEntry,today} from './journal.mjs';
const esc=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export function sleepSection(s,date){const r=entry(s,'daily:'+date)?.fields.samsungSleep;return r?`<p class="hint">${esc(sleepLine(r))}</p>${!r.segments&&!Object.hasOwn(r,'groupId')?'<p class="hint">旧版单条导入：可能未包含同一晚的其他片段。可重新导入原ZIP核对完整性。</p>':''}`:'';}

function bindBatch({root,records,state,save,notify,refresh}){
  const end=today();
  root.innerHTML=`<div class="journal-columns">
    <label>起始日期<input class="text-input" type="date" id="sleepFrom" value="${plusDays(end,-13)}" max="${end}"></label>
    <label>结束日期<input class="text-input" type="date" id="sleepTo" value="${end}" max="${end}"></label>
  </div><p id="batchSleepCount" class="hint" role="status"></p><div id="batchSleepRows"></div>
  <button class="btn" id="saveBatchSleep" disabled>保存勾选的夜晚</button>`;
  const $=id=>root.querySelector('#'+id);
  const from=$('sleepFrom'),to=$('sleepTo'),count=$('batchSleepCount'),list=$('batchSleepRows'),button=$('saveBatchSleep');
  const range=()=>({from:from.value,to:to.value});
  const plan=s=>planSleepImport(records,s.journal?.entries||{},range());
  const canSave=x=>x.status==='new'||x.status==='update';
  let preview=[];
  function render(){
    if(!dateOK(from.value)||!dateOK(to.value)||from.value>to.value||to.value>end||to.value>plusDays(from.value,30)){
      count.textContent='请选择不晚于今天、最多31天的日期范围。';
      list.replaceChildren();
      button.disabled=true;
      return;
    }
    preview=plan(state());
    const total=status=>preview.filter(x=>x.status===status).length;
    count.textContent=`新增 ${total('new')} 晚 · 修订 ${total('update')} 晚 · 重复跳过 ${total('same')} 晚 · 旧版跳过 ${total('older')} 晚 · 待核对 ${total('review')} 晚`;
    list.innerHTML=preview.filter(x=>x.status!=='same'&&x.status!=='older').map(x=>{
      if(x.status==='review')return `<p class="hint">${x.date} · ${esc(x.reason)}</p>`;
      const change=x.previous?`<small>原记录 · ${esc(sleepLine(x.previous))}</small><br>`:'';
      return `<label class="journal-field"><span><input type="checkbox" data-sleep-batch="${x.date}" ${x.status==='new'?'checked':''}>
        ${x.date} · ${x.previous?'修订':'新增'}</span>${change}<small>${esc(sleepLine(x.sleep))}</small></label>`;
    }).join('');
    button.disabled=!list.querySelector('[data-sleep-batch]:checked');
  }
  from.onchange=to.onchange=render;
  list.onchange=()=>{button.disabled=!list.querySelector('[data-sleep-batch]:checked');};
  button.onclick=()=>{
    const checked=new Set([...list.querySelectorAll('[data-sleep-batch]:checked')].map(el=>el.dataset.sleepBatch));
    const selected=preview.filter(x=>canSave(x)&&checked.has(x.date));
    if(!selected.length)return;
    if(save(s=>{
      const current=new Map(plan(s).map(x=>[x.date,x]));
      for(const x of selected){
        const next=current.get(x.date);
        if(!next||next.status!==x.status||!sameSleep(next.previous,x.previous,true)||!sameSleep(next.sleep,x.sleep,true)){
          throw Error('睡眠记录已变化，请核对最新预览后再保存');
        }
      }
      for(const {date,sleep} of selected)writeEntry(s,'daily:'+date,'daily',{date,samsungSleep:sleep});
    },{requireCurrentAccountCache:true})===false){render();return;}
    refresh();
    render();
    notify(`已保存 ${selected.length} 晚睡眠；登录后联网自动同步`);
  };
  render();
}

export function bindSleepImport({state,save,modal,notify,refresh}){
  document.getElementById('importSleep').onclick=()=>{
    modal('导入三星睡眠',`<p class="hint">选择三星健康导出 ZIP。只在本机读取睡眠 CSV，按醒来日期预览新增与修订。已保存且内容相同的夜晚会跳过。</p><input type="file" id="sleepFile" accept=".zip"><p id="sleepStatus" role="status"></p><div id="sleepPreview"></div>`);
    document.getElementById('sleepFile').onchange=async ev=>{
      const input=ev.target,f=input.files[0];if(!f)return;const status=document.getElementById('sleepStatus'),preview=document.getElementById('sleepPreview');preview.innerHTML='';
      try{status.textContent='正在本机读取…';if(f.size>250*1024*1024)throw Error('ZIP超过250MB，请仅压缩睡眠和睡眠阶段CSV');
        const bytes=new Uint8Array(await f.arrayBuffer());
        if(!preview.isConnected||input.files[0]!==f)return;
        let total=0;const files=unzipSync(bytes,{filter:x=>{const yes=/(^|\/)com\.samsung\.(shealth\.sleep|health\.sleep_stage)\.\d+\.csv$/.test(x.name);if(yes){total+=x.originalSize;if(total>50*1024*1024)throw Error('睡眠文件解压后超过50MB');}return yes;}});
        const names=Object.keys(files),a=names.filter(x=>/\/com\.samsung\.shealth\.sleep\./.test('/'+x)),b=names.filter(x=>/\/com\.samsung\.health\.sleep_stage\./.test('/'+x));
        if(a.length!==1||b.length!==1)throw Error('需要且只能包含一份睡眠CSV和一份睡眠阶段CSV');
        const result=parseSleep(strFromU8(files[a[0]]),strFromU8(files[b[0]]));const rows=result.records.filter(r=>r.date<=today());
        status.textContent=`读到 ${rows.length} 条睡眠片段，跳过 ${result.warnings.length} 条异常记录。`;
        if(!rows.length)return;
        const dates=[...new Set(rows.map(r=>r.date))];
        preview.innerHTML=`<div id="sleepBatch"></div><details><summary>手动核对一晚</summary><label>醒来日期<select class="text-input" id="sleepSelect">${dates.map(d=>`<option value="${d}">${d}</option>`).join('')}</select></label><div id="sleepSegments"></div><p id="sleepCombined" class="hint"></p><p id="sleepExisting" class="hint"></p><button class="btn" id="saveSleep">确认保存所选睡眠</button></details>`;
        const batch=()=>bindBatch({root:document.getElementById('sleepBatch'),records:rows,state,save,notify,refresh:()=>{refresh();update();}});
        const select=document.getElementById('sleepSelect'),existing=document.getElementById('sleepExisting'),combined=document.getElementById('sleepCombined'),button=document.getElementById('saveSleep');let chosen=null,shownEntry;
        const update=()=>{try{chosen=mergeSleepSegments([...document.querySelectorAll('[data-sleep-segment]:checked')].map(el=>rows[+el.dataset.sleepSegment]));if(chosen.date!==select.value)throw Error('请至少选择一段在所选日期结束的睡眠');combined.textContent='保存预览：'+sleepLine(chosen);shownEntry=state().journal?.entries['daily:'+chosen.date];const old=shownEntry?.fields.samsungSleep;
          if(shownEntry?.deleted)throw Error('这天的每日记录已删除');
          if(includesOlderSleepPart(old,chosen))throw Error('所选文件含有旧版片段，已保留已保存记录');
          existing.textContent=old?'当天已保存：'+sleepLine(old)+'。确认后将替换这条睡眠，保留手填反馈。':'当天尚未保存睡眠。';button.disabled=false;}catch(e){chosen=null;combined.textContent=e.message;existing.textContent='';button.disabled=true;}};
        const show=()=>{const anchor=rows.find(r=>r.date===select.value),end=Date.parse(anchor.end);document.getElementById('sleepSegments').innerHTML=rows.map((r,i)=>({r,i})).filter(({r})=>Date.parse(r.end)<=end&&Date.parse(r.start)>=end-86400000).map(({r,i})=>`<label class="journal-field"><span><input type="checkbox" data-sleep-segment="${i}" ${r.sourceId===anchor.sourceId||(anchor.groupId&&r.groupId===anchor.groupId)?'checked':''}> ${esc(r.date+' · '+sleepLine(r))}</span></label>`).join('');document.querySelectorAll('[data-sleep-segment]').forEach(el=>el.onchange=update);update();};select.onchange=show;show();
        button.onclick=()=>{
          if(!chosen)return;
          const r=chosen,id='daily:'+r.date,old=shownEntry?.fields.samsungSleep;
          if(sameSleep(old,r)){notify('所选睡眠已经保存，无需重复导入');return;}
          if(save(s=>{
            const current=s.journal?.entries[id];
            if(current?.deleted||!sameSleep(current?.fields.samsungSleep,old,true))throw Error('睡眠记录已变化，请核对最新预览后再保存');
            writeEntry(s,id,'daily',{date:r.date,samsungSleep:r});
          },{requireCurrentAccountCache:true})===false){update();batch();return;}
          notify('已保存到'+r.date+'每日记录；联网后账号同步');refresh();update();batch();
        };
        batch();
      }catch(e){if(input.files[0]===f){status.textContent='导入失败：'+e.message;preview.innerHTML='';}}
    };
  };
}
