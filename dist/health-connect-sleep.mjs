export const HEALTH_CONNECT_FILE_LIMIT = 10 * 1024 * 1024;
const DAY = 86400000;
const SOURCE = 'Health Connect';
const identity = record => record.origin + '|' + record.id;
const validOrigin = origin => typeof origin === 'string' && origin.length <= 200 &&
  /^[a-zA-Z]\w*(\.[a-zA-Z]\w*)+$/.test(origin);
const validId = id => typeof id === 'string' && /^[\w-]{1,200}$/.test(id);
const validOffset = offset => offset === null || (Number.isInteger(offset) && Math.abs(offset) <= 64800);
const object = value => value && typeof value === 'object' && !Array.isArray(value);

function readInstant(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{1,9})?Z$/.test(value)) return NaN;
  const time = Date.parse(value);
  return Number.isFinite(time) && new Date(time).toISOString().slice(0,19) === value.slice(0,19) ? time : NaN;
}

const iso = time => new Date(time).toISOString();
const wakeDate = (end, offset) => offset === null ? null : iso(end + offset * 1000).slice(0,10);

function readStages(raw, start, end) {
  if (!Array.isArray(raw) || raw.length > 2000) throw Error('阶段列表无效或过大');
  const stages = raw.map(stage => {
    if (!object(stage)) throw Error('睡眠阶段格式无效');
    const a = readInstant(stage.start), b = readInstant(stage.end);
    if (!(a >= start && b <= end && b > a) || !Number.isSafeInteger(stage.type)) {
      throw Error('睡眠阶段超出记录或格式无效');
    }
    return [a, b, stage.type];
  }).sort((a,b) => a[0]-b[0] || a[1]-b[1] || a[2]-b[2]);
  let cursor = start, asleep = 0, complete = stages.length > 0;
  for (const [a,b,type] of stages) {
    if (a !== cursor || type < 1 || type > 7) complete = false;
    if ([2,4,5,6].includes(type)) asleep += b-a;
    cursor = b;
  }
  return {stages, actualMinutes:complete && cursor === end ? asleep/60000 : null};
}

export function parseHealthConnect(text) {
  if (typeof text !== 'string' || text.length > HEALTH_CONNECT_FILE_LIMIT) throw Error('睡眠 JSON 超过 10 MB 或不是文本');
  let data;
  try { data = JSON.parse(text.replace(/^\uFEFF/, '')); }
  catch { throw Error('睡眠 JSON 格式无效'); }
  if (!object(data) || data.format !== 'mantou-health-connect-sleep' || data.version !== 1 ||
      data.complete !== true || !Array.isArray(data.records) || data.records.length > 1000) {
    throw Error('请选择完整的 mantou 睡眠导出 JSON');
  }
  const seen = new Map();
  for (const raw of data.records) {
    if (!object(raw) || !validId(raw.id) || !validOrigin(raw.origin)) throw Error('睡眠记录的来源或标识无效');
    const start = readInstant(raw.start), end = readInstant(raw.end), modified = readInstant(raw.lastModified);
    if (!(end > start && end-start <= DAY) || !Number.isFinite(modified) ||
        !validOffset(raw.startOffsetSeconds) || !validOffset(raw.endOffsetSeconds)) {
      throw Error('睡眠时间、来源版本或时区无效');
    }
    const {actualMinutes, stages} = readStages(raw.stages, start, end);
    const record = {
      source:SOURCE, id:raw.id, origin:raw.origin, start:iso(start), end:iso(end),
      startOffsetSeconds:raw.startOffsetSeconds, endOffsetSeconds:raw.endOffsetSeconds,
      lastModified:iso(modified), date:wakeDate(end,raw.endOffsetSeconds),
      intervalMinutes:(end-start)/60000, actualMinutes
    };
    const key = identity(record);
    if (seen.has(key) && JSON.stringify(seen.get(key)) !== JSON.stringify({record, stages})) {
      throw Error('同一来源和标识存在不同版本，请重新导出');
    }
    seen.set(key, {record, stages});
  }
  return [...seen.values()].map(value => value.record)
    .sort((a,b) => b.end.localeCompare(a.end) || identity(a).localeCompare(identity(b)));
}

const SUMMARY_FIELDS = ['source','id','origin','start','end','startOffsetSeconds','endOffsetSeconds',
  'lastModified','date','intervalMinutes','actualMinutes'];

export function validHealthConnectSleep(r,{allowUndated=false}={}) {
  if (!object(r) || Object.keys(r).length !== SUMMARY_FIELDS.length ||
      !SUMMARY_FIELDS.every(k => Object.hasOwn(r,k)) || r.source !== SOURCE || !validId(r.id) ||
      !validOrigin(r.origin) || !validOffset(r.startOffsetSeconds) ||
      !validOffset(r.endOffsetSeconds) || (!allowUndated && r.endOffsetSeconds === null)) return false;
  const start = readInstant(r.start), end = readInstant(r.end), modified = readInstant(r.lastModified);
  return end > start && end-start <= DAY && Number.isFinite(modified) &&
    r.start === iso(start) && r.end === iso(end) && r.lastModified === iso(modified) &&
    r.date === wakeDate(end,r.endOffsetSeconds) && r.intervalMinutes === (end-start)/60000 &&
    (r.actualMinutes === null || (Number.isFinite(r.actualMinutes) && r.actualMinutes >= 0 && r.actualMinutes <= r.intervalMinutes));
}

export const sameHealthConnectSleep = (a,b) => Boolean(a && b && SUMMARY_FIELDS.every(k => a[k] === b[k]));

const span = record => ({record, start:Date.parse(record.start), end:Date.parse(record.end)});
const clashes = (a,b) => Boolean(a.record.date && a.record.date === b.record.date) ||
  (a.start < b.end && b.start < a.end);
const sourceFields = entries => Object.values(entries).filter(e => e.kind === 'daily');
const storedHealth = fields => [fields.healthConnectSleep,...(fields.healthConnectSleepParts||[])].filter(Boolean);
const storedSleep = fields => [fields.samsungSleep,...storedHealth(fields)].filter(Boolean);

export function savedHealthConnectSpans(entries) {
  return sourceFields(entries).filter(e => !e.deleted).flatMap(e => storedHealth(e.fields).map(span));
}

export function overlappingSavedSleep(record,entries) {
  return sourceFields(entries).filter(e=>!e.deleted)
    .flatMap(e=>storedSleep(e.fields)).filter(saved=>clashes(span(record),span(saved)));
}

export function conflictsWithHealthConnect(record, savedSpans) {
  const interval = span(record);
  return savedSpans.some(saved => clashes(interval,saved));
}

export function planHealthConnectImport(records, entries, today) {
  const days = sourceFields(entries);
  const stored = days.flatMap(e=>storedHealth(e.fields).map(record=>({
    record,deleted:e.deleted,parts:e.fields.healthConnectSleepParts?.includes(record)?e.fields.healthConnectSleepParts:null
  })));
  const saved = days.filter(e => !e.deleted)
    .flatMap(e => storedSleep(e.fields).map(span));
  const incoming = records.map(span);
  return incoming.map(interval => {
    const {record} = interval;
    const review = reason => ({record,status:'review',reason});
    if (!record.date) return review('结束时区缺失，请核对醒来日期');
    if (record.date > today) return review('醒来日期晚于今天');
    if (entries['daily:'+record.date]?.deleted) return review('这天的每日记录已删除');
    const sameId = stored.filter(other => identity(other.record) === identity(record));
    if (sameId.some(other=>other.deleted||!sameHealthConnectSleep(record,other.record))) {
      return review('同一来源和标识已有不同版本，保留已存记录');
    }
    const confirmed=sameId.find(other=>other.parts)?.parts;
    if(confirmed&&!saved.some(other=>!confirmed.includes(other.record)&&
      !sameHealthConnectSleep(record,other.record)&&clashes(interval,other)))return {record,status:'same'};
    if (incoming.some(other => other !== interval && clashes(interval,other))) {
      return review('文件中有同日多段或重叠记录，请核对');
    }
    if (saved.some(other => !sameHealthConnectSleep(record,other.record) && clashes(interval,other))) {
      return review('与已存睡眠同日或重叠，保留已存记录');
    }
    return {record,status:sameId.length?'same':'new'};
  });
}

export function summarizeSleepParts(records) {
  if(!Array.isArray(records)||records.length<2||records.length>20||
     !records.every(record=>validHealthConnectSleep(record)))throw Error('请选择 2–20 段有效睡眠');
  const parts=[...records].sort((a,b)=>a.start.localeCompare(b.start));
  const first=parts[0],last=parts.at(-1),offset=first.startOffsetSeconds;
  if(offset===null||parts.some(part=>part.date!==first.date||part.origin!==first.origin||
    part.startOffsetSeconds!==offset||part.endOffsetSeconds!==offset))throw Error('片段的醒来日期、来源或时区不同');
  for(let i=1;i<parts.length;i++){
    if(parts[i].start<parts[i-1].end)throw Error('片段重叠，请分别核对');
  }
  const intervalMinutes=(Date.parse(last.end)-Date.parse(first.start))/60000;
  if(intervalMinutes>1440||new Set(parts.map(identity)).size!==parts.length)throw Error('片段重复或跨度超过 24 小时');
  const recorded=parts.reduce((total,part)=>total+part.intervalMinutes,0);
  const actualMinutes=parts.some(part=>part.actualMinutes===null)?null:parts.reduce((total,part)=>total+part.actualMinutes,0);
  return {date:first.date,parts,intervalMinutes,gapMinutes:Math.max(0,intervalMinutes-recorded),actualMinutes};
}

export function healthConnectPartsLine(parts) {
  const {actualMinutes,gapMinutes}=summarizeSleepParts(parts);
  const minutes=actualMinutes===null?'未知（有片段的阶段不完整）':Math.round(actualMinutes)+' 分钟';
  return `Health Connect · 已确认 ${parts.length} 段 · 估计睡眠 ${minutes} · 未记录间隔 ${Math.round(gapMinutes)} 分钟`;
}

export function healthConnectLine(r) {
  const local = (value,offset) => offset === null ? '时区未知' :
    iso(Date.parse(value) + offset*1000).slice(11,16);
  const actual = r.actualMinutes === null ? '未知（阶段不完整）' : Math.round(r.actualMinutes) + ' 分钟';
  const origin = {'nl.appyhapps.healthsync':'Health Sync','com.sec.android.app.shealth':'三星健康'}[r.origin] || r.origin;
  return `${local(r.start,r.startOffsetSeconds)}—${local(r.end,r.endOffsetSeconds)} · 区间 ${Math.round(r.intervalMinutes)} 分钟 · 估计睡眠 ${actual}（${origin} · Health Connect）`;
}
