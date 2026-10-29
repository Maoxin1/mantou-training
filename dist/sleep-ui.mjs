import {unzipSync,strFromU8} from './meal-zip.mjs';
import {parseSleep,sleepLine} from './sleep-core.mjs';
import {entry,writeEntry,today} from './journal.mjs';
const esc=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export function sleepSection(s,date){const r=entry(s,'daily:'+date)?.fields.samsungSleep;return r?`<p class="hint">${esc(sleepLine(r))}</p>`:'';}
export function bindSleepImport({state,save,modal,notify,refresh}){
  document.getElementById('importSleep').onclick=()=>{
    modal('导入三星睡眠',`<p class="hint">选择三星健康导出 ZIP，只在本机读取睡眠 CSV。选择一晚后预览确认；记录按醒来日期归档，登录后随每日记录同步。此入口为文件导入。</p><input type="file" id="sleepFile" accept=".zip"><p id="sleepStatus" role="status"></p><div id="sleepPreview"></div>`);
    document.getElementById('sleepFile').onchange=async ev=>{
      const f=ev.target.files[0];if(!f)return;const status=document.getElementById('sleepStatus'),preview=document.getElementById('sleepPreview');preview.innerHTML='';
      try{status.textContent='正在本机读取…';if(f.size>250*1024*1024)throw Error('ZIP超过250MB，请仅压缩睡眠和睡眠阶段CSV');
        let total=0;const files=unzipSync(new Uint8Array(await f.arrayBuffer()),{filter:x=>{const yes=/(^|\/)com\.samsung\.(shealth\.sleep|health\.sleep_stage)\.\d+\.csv$/.test(x.name);if(yes){total+=x.originalSize;if(total>50*1024*1024)throw Error('睡眠文件解压后超过50MB');}return yes;}});
        const names=Object.keys(files),a=names.filter(x=>/\/com\.samsung\.shealth\.sleep\./.test('/'+x)),b=names.filter(x=>/\/com\.samsung\.health\.sleep_stage\./.test('/'+x));
        if(a.length!==1||b.length!==1)throw Error('需要且只能包含一份睡眠CSV和一份睡眠阶段CSV');
        const result=parseSleep(strFromU8(files[a[0]]),strFromU8(files[b[0]]));const rows=result.records.filter(r=>r.date<=today());
        status.textContent=`可读取${rows.length}条睡眠记录；${result.warnings.length}条异常已跳过。每次选择一条，避免将午睡或重叠来源自动累加。`;
        if(!rows.length)return;
        preview.innerHTML=`<label>选择记录<select class="text-input" id="sleepSelect">${rows.map((r,i)=>`<option value="${i}">${r.date} · ${esc(sleepLine(r))}</option>`).join('')}</select></label><p id="sleepExisting" class="hint"></p><button class="btn" id="saveSleep">确认保存这条睡眠</button>`;
        const select=document.getElementById('sleepSelect'),existing=document.getElementById('sleepExisting');const update=()=>{const r=rows[+select.value],old=entry(state(),'daily:'+r.date)?.fields.samsungSleep;existing.textContent=old?'当天已有导入记录：'+sleepLine(old)+'。保存将替换该条；手填感受保持独立。':'当天尚无导入睡眠。';};select.onchange=update;update();
        document.getElementById('saveSleep').onclick=()=>{const r=rows[+select.value],old=entry(state(),'daily:'+r.date)?.fields.samsungSleep;if(JSON.stringify(old)===JSON.stringify(r)){notify('这条睡眠已经保存，无需重复导入');return;}if(save(s=>writeEntry(s,'daily:'+r.date,'daily',{date:r.date,samsungSleep:r}))===false)return;notify('已保存到'+r.date+'每日记录；联网后账号同步');update();};
      }catch(e){status.textContent='导入失败：'+e.message;preview.innerHTML='';}
    };
  };
}
