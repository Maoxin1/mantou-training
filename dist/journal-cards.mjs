import {label} from './journal.mjs';
const esc=x=>String(x??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export function planCard(e,log){
  if(e.paused)return `<article class="card" data-paused-exercise="${esc(e.id)}"><div class="row start"><span class="name">${esc(e.name)}</span><span class="pill">已暂停</span></div><p class="rest-note">${esc(e.pauseReason||'等待本人确认后恢复。')}</p><p class="hint">本次不安排次数或阻力。历史记录仍可在「记录」中查看；恢复需在「调整后续训练安排」中确认。</p></article>`;
  return `<article class="card exercise-card"><button class="exercise-entry" data-journal-exercise="${esc(e.id)}"><span class="name">${esc(e.name)}</span><span class="exercise-dose">${e.sets}组 · ${e.sides?'每侧 ':''}${e.min===e.max?e.min:`${e.min}–${e.max}`}次</span><span class="exercise-state">${log?label('exerciseStatus',log.fields.exerciseStatus):'记录'} <span aria-hidden="true">›</span></span></button><details class="exercise-help"><summary>动作要点</summary><p>${esc(e.cue)}<br>${esc(e.variant)} · ${esc(e.load)}<br>休息 ${e.restMax?`${e.rest}–${e.restMax}`:e.rest===90?'90–120':e.rest}秒</p></details></article>`;
}
