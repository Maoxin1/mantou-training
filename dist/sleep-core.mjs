// Samsung export timestamps are UTC text; time_offset describes the local zone.
export function csvRows(text){
  const rows=[];let row=[],cell='',quoted=false;
  for(let i=0;i<text.length;i++){const c=text[i];if(c==='"'){if(quoted&&text[i+1]==='"'){cell+='"';i++;}else quoted=!quoted;}else if(!quoted&&c===','){row.push(cell);cell='';}else if(!quoted&&c==='\n'){row.push(cell.replace(/\r$/,''));rows.push(row);row=[];cell='';}else cell+=c;}
  if(quoted)throw Error('CSV 引号未闭合');if(cell||row.length){row.push(cell.replace(/\r$/,''));rows.push(row);}
  const h=rows[1];if(!h)throw Error('缺少三星 CSV 表头');
  return rows.slice(2).filter(r=>r.some(Boolean)).map(r=>Object.fromEntries(h.map((k,i)=>[k,r[i]||''])));
}
const get=(r,k)=>r[k]||r['com.samsung.health.sleep.'+k]||'';
function utc(s){if(!/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}(\.\d{3})?$/.test(s))return NaN;return Date.parse(s.replace(' ','T')+'Z');}
function offset(s){const m=/^UTC([+-])(\d{2})(\d{2})$/.exec(s);if(!m||+m[2]>14||+m[3]>59)return null;return (m[1]==='-'?-1:1)*(+m[2]*60+ +m[3]);}
export function parseSleep(sleepText,stageText){
  const stages=new Map();for(const r of csvRows(stageText)){if(!stages.has(r.sleep_id))stages.set(r.sleep_id,[]);stages.get(r.sleep_id).push(r);}
  const records=[],warnings=[];
  for(const r of csvRows(sleepText)){
    const id=get(r,'datauuid'),start=utc(get(r,'start_time')),end=utc(get(r,'end_time')),zone=offset(get(r,'time_offset'));
    if(!/^[\w-]{1,100}$/.test(id)||!Number.isFinite(start)||!Number.isFinite(end)||end<=start||end-start>86400000||zone===null){warnings.push('一条记录的日期、时区或时长无效，已跳过');continue;}
    const parts=(stages.get(id)||[]).map(x=>({start:utc(x.start_time),end:utc(x.end_time),stage:+x.stage})).sort((a,b)=>a.start-b.start);
    let cursor=start,actual=0,valid=parts.length>0;
    for(const p of parts){if(p.start!==cursor||p.end<=p.start||p.end>end||![40001,40002,40003,40004].includes(p.stage)){valid=false;break;}if(p.stage!==40001)actual+=(p.end-p.start)/60000;cursor=p.end;}
    if(cursor!==end)valid=false;
    const date=new Date(end+zone*60000).toISOString().slice(0,10);
    records.push({source:'Samsung Health',sourceId:id,groupId:/^[\w-]{1,100}$/.test(r.combined_id||'')?r.combined_id:'',date,start:new Date(start).toISOString(),end:new Date(end).toISOString(),offsetMinutes:zone,intervalMinutes:(end-start)/60000,actualMinutes:valid?actual:null});
  }
  const unique=new Map();for(const r of records){if(unique.has(r.sourceId)&&JSON.stringify(unique.get(r.sourceId))!==JSON.stringify(r))throw Error('同一睡眠标识存在不同版本，请重新导出');unique.set(r.sourceId,r);}
  return {records:[...unique.values()].sort((a,b)=>b.end.localeCompare(a.end)),warnings};
}
export function validSleep(r){return r&&r.source==='Samsung Health'&&/^[\w-]{1,100}$/.test(r.sourceId)&&/^\d{4}-\d{2}-\d{2}$/.test(r.date)&&Number.isFinite(Date.parse(r.start))&&Number.isFinite(Date.parse(r.end))&&Number.isInteger(r.offsetMinutes)&&Math.abs(r.offsetMinutes)<=840&&r.intervalMinutes>0&&r.intervalMinutes<=1440&&(r.actualMinutes===null||(Number.isFinite(r.actualMinutes)&&r.actualMinutes>=0&&r.actualMinutes<=r.intervalMinutes));}
export function mergeSleepSegments(selected){
  if(!selected.length||selected.length>20)throw Error('请选择1–20段属于同一晚的记录');
  const rows=[...selected].sort((a,b)=>a.start.localeCompare(b.start));
  if(rows.some(r=>!validSleep(r)||r.segments||r.offsetMinutes!==rows[0].offsetMinutes))throw Error('记录无效或时区不同，请分别核对');
  for(let i=1;i<rows.length;i++)if(Date.parse(rows[i].start)<Date.parse(rows[i-1].end))throw Error('所选片段重叠，可能是重复来源；请取消重复片段');
  if(rows.length===1)return rows[0];
  const last=rows.at(-1),span=(Date.parse(last.end)-Date.parse(rows[0].start))/60000;
  if(span>1440)throw Error('所选片段跨越超过24小时，请按每晚分别导入');
  return {...last,sourceId:'merged_'+last.sourceId,start:rows[0].start,intervalMinutes:span,actualMinutes:rows.some(r=>r.actualMinutes===null)?null:rows.reduce((n,r)=>n+r.actualMinutes,0),gapMinutes:span-rows.reduce((n,r)=>n+r.intervalMinutes,0),segments:rows};
}
export function validateSleepSegments(r){
  if(!validSleep(r))return false;
  if(!r.segments)return true;
  try{const expected=mergeSleepSegments(r.segments);return ['sourceId','date','start','end','offsetMinutes','intervalMinutes','actualMinutes','gapMinutes'].every(k=>expected[k]===r[k]);}catch{return false;}
}
export function sleepLine(r){if(!validateSleepSegments(r))return '睡眠数据待核对';const time=s=>new Date(Date.parse(s)+r.offsetMinutes*60000).toISOString().slice(11,16);const duration=n=>n===null?'缺少完整阶段数据':`${Math.floor(n/60)}小时${Math.floor(n%60)}分`;return `${time(r.start)}—${time(r.end)} · 区间${duration(r.intervalMinutes)} · ${r.segments?'所选片段内':''}设备估计实际睡眠${duration(r.actualMinutes)}${r.segments?` · 已合并${r.segments.length}段；未记录间隔${r.gapMinutes}分钟`:''}（三星健康）`;}
