import {label} from './journal.mjs';
const esc=x=>String(x??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export function planCard(e,log){
  if(e.paused)return `<article class="card" data-paused-exercise="${esc(e.id)}"><div class="row start"><span class="name">${esc(e.name)}</span><span class="pill">已暂停</span></div><p class="rest-note">${esc(e.pauseReason||'等待本人确认后恢复。')}</p><p class="hint">本次不安排次数或阻力。历史记录仍可在「记录」中查看；恢复需在「调整后续训练安排」中确认。</p></article>`;
  return `<article class="card"><div class="row start"><span class="name">${esc(e.name)}</span><span class="pill">${log?label('exerciseStatus',log.fields.exerciseStatus):'尚未记录'}</span></div><div class="dose">${e.sets}组 <small>· ${e.sides?'每侧 ':''}${e.min===e.max?e.min:`${e.min}–${e.max}`}次</small></div><p class="rest-note">组间休息 ${e.rest===90?'90–120':e.rest}秒 · 目标余力约2–3次</p><details class="exercise-help"><summary>动作要点与版本</summary><p>${esc(e.cue)}<br>${esc(e.variant)} · ${esc(e.load)}</p></details><button class="open" data-journal-exercise="${esc(e.id)}">记录这一项 <span>＋</span></button></article>`;
}
