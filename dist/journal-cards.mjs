import {label} from './journal.mjs';
const esc=x=>String(x??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const icons={
  training:'<path d="M8 8v8m8-8v8M5 6v12m14-12v12M2 9v6m20-6v6M8 12h8"/>',
  camera:'<path d="M3 7h4l2-3h6l2 3h4v13H3z"/><circle cx="12" cy="13" r="4"/>',
  gallery:'<rect x="3" y="3" width="18" height="18" rx="3"/><circle cx="8" cy="8" r="1"/><path d="m3 17 6-6 4 4 3-3 5 6"/>',
  review:'<rect x="5" y="3" width="14" height="18" rx="2"/><path d="M8 8h8M8 12h8M8 16h5"/>',
  list:'<path d="M9 6h12M9 12h12M9 18h12M3 6h1M3 12h1M3 18h1"/>',
  down:'<path d="m6 9 6 6 6-6"/>',
  arrow:'<path d="m9 5 7 7-7 7"/>',
  check:'<path d="m5 12 4 4L19 6"/>',
  plus:'<path d="M12 5v14M5 12h14"/>',
  recovery:'<path d="M4 12h4l3-6 3 12 2-6h4"/>',
  download:'<path d="M12 3v12m-5-5 5 5 5-5M4 17v4h16v-4"/>',
};
export function journalIcon(name){
  return `<svg class="journal-icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false">${icons[name]}</svg>`;
}
export function countedGroups(plan,log){
  return Array.from({length:plan.sets},(_,i)=>{
    const row=log?.fields.rows?.[i];
    return plan.sides ? row?.left!=null&&row?.right!=null : row?.reps!=null;
  });
}
export function planCard(e,log){
  if(e.paused)return `<article class="card" data-paused-exercise="${esc(e.id)}"><div class="row start"><span class="name">${esc(e.name)}</span><span class="pill">已暂停</span></div><p class="rest-note">${esc(e.pauseReason||'等待本人确认后恢复。')}</p><p class="hint">本次不安排次数或阻力。历史记录仍可在「记录」中查看；恢复需在「调整后续训练安排」中确认。</p></article>`;
  const status=log?.fields.exerciseStatus;
  const entered=countedGroups(e,log).filter(Boolean).length;
  const count=entered?`次数已填 ${entered}/${e.sets} 组`:'';
  return `<article class="card exercise-card">
    <button class="exercise-entry" data-journal-exercise="${esc(e.id)}">
      <span class="name">${esc(e.name)}</span>
      <span class="exercise-dose">${e.sets}组 · ${e.sides?'每侧 ':''}${e.min===e.max?e.min:`${e.min}–${e.max}`}次</span>
      <span class="exercise-state">${journalIcon('arrow')}</span>
      ${count||status?`<span class="exercise-progress">${[count,status&&label('exerciseStatus',status)].filter(Boolean).join(' · ')}</span>`:''}
    </button>
  </article>`;
}
