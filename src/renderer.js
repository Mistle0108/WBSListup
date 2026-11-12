const $ = selector => document.querySelector(selector);
const status = $('#status');
let data, view, busy = false, pendingContent = 0;
const scheduleHistory = new Map();
function historyFor(projectId) { if (!scheduleHistory.has(projectId)) scheduleHistory.set(projectId, {undo:[], redo:[]}); return scheduleHistory.get(projectId); }
window.agentBridge = {
  begin() { if (!data || !view || busy || pendingContent || document.querySelector('dialog[open]') || document.body.inert) return false; document.body.inert = true; return true; },
  finish(content) { data = domain.normalize(content); render(); document.body.inert = false; status.textContent = '에이전트 변경 사항이 저장됨'; },
  cancel() { document.body.inert = false; }
};
const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const action = (name, id, label, title = label, extra = '') => `<button type="button" data-action="${name}" data-id="${esc(id || '')}" class="${extra ? 'label' : 'small'}" title="${esc(title)}" aria-label="${esc(title)}">${esc(label)}</button>`;
function lockIcon(locked) {
  const shackle = locked ? '<path d="M7 10V7a5 5 0 0 1 10 0v3"/>' : '<path d="M8 10V7a5 5 0 0 1 9-3"/>';
  return `<svg class="lock-icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${shackle}<rect x="5" y="10" width="14" height="11" rx="2"/><path d="M12 14v3"/></svg>`;
}
function validBarColor(item) { return /^#[0-9a-fA-F]{6}$/.test(item.barColor || '') ? item.barColor.toLowerCase() : item.type === 'group' ? '#526a8f' : '#6f95df'; }
function barTextColor(color) {
  const channels = [1,3,5].map(i => parseInt(color.slice(i,i+2),16) / 255).map(c => c <= .04045 ? c / 12.92 : ((c + .055) / 1.055) ** 2.4);
  const luminance = .2126 * channels[0] + .7152 * channels[1] + .0722 * channels[2];
  return luminance > .179 ? '#000000' : '#ffffff';
}
function projectView(id) { return view.projects[id] ||= { collapsed: [], selected: null }; }
function render() {
  const selectedProject = data.projects.find(p => p.id === view.selectedProject);
  $('#sidebar').hidden = !!view.sidebarClosed;
  $('#sidebar-toggle').setAttribute('aria-expanded', String(!view.sidebarClosed));
  $('#sidebar-toggle').setAttribute('aria-label', view.sidebarClosed ? '사이드바 펼치기' : '사이드바 접기');
  function folders(parentId, depth) {
    let html = '';
    for (const folder of data.folders.filter(f => (f.parentId || null) === parentId)) {
      const open = view.expandedFolders.includes(folder.id);
      html += `<div class="tree-row ${view.selectedFolder === folder.id ? 'selected' : ''}" style="padding-left:${depth * 14}px">${action('toggle-folder', folder.id, open ? '▾' : '▸', open ? '폴더 접기' : '폴더 펼치기')}${action('select-folder', folder.id, '📁 ' + folder.name, '폴더 선택', 'class="label"')}${action('rename-folder', folder.id, '이름')}${action('move-folder', folder.id, '이동')}${action('delete-folder', folder.id, '삭제')}</div>`;
      if (open) html += folders(folder.id, depth + 1);
    }
    for (const project of data.projects.filter(p => (p.parentId || null) === parentId)) {
      html += `<div class="tree-row ${view.selectedProject === project.id ? 'selected' : ''}" style="padding-left:${depth * 14 + 24}px">${action('select-project', project.id, project.name, '프로젝트 선택', 'class="label"')}${action('detail-project', project.id, '상세')}${action('rename-project', project.id, '이름')}${action('move-project', project.id, '이동')}${action('delete-project', project.id, '삭제')}</div>`;
    }
    return html;
  }
  $('#folders').innerHTML = `<div class="tree-row ${!view.selectedFolder ? 'selected' : ''}">${action('select-folder', '', '⌂ 최상위', '최상위 선택', 'class="label"')}</div>` + folders(null, 0) + (!data.projects.length ? '<p class="hint">프로젝트를 추가해 시작하세요.</p>' : '');
  if (!selectedProject) { $('#workspace').innerHTML = '<div class="notice"><h1>프로젝트를 선택하세요</h1><p class="empty">왼쪽에서 프로젝트를 만들거나 선택하세요.</p></div>'; return; }
  const pv = projectView(selectedProject.id);
  const rows = domain.numbered(data, selectedProject.id);
  const byId = new Map(rows.map(row => [row.item.id, row.item]));
  function visible(item) { let id = item.parentId; while (id) { if (pv.collapsed.includes(id)) return false; id = byId.get(id)?.parentId; } return true; }
  const periods = timeline.aggregate(data.workItems, selectedProject.id);
  const history = historyFor(selectedProject.id);
  const html = rows.filter(r => visible(r.item)).map(({item, number, depth}) => {
    const isGroup = item.type === 'group', collapsed = pv.collapsed.includes(item.id), inherited = domain.inheritedLock(data.workItems,item), effective = domain.isLocked(data.workItems,item);
    const endDay = timeline.parse(item.endDate), canExtend = !isGroup && !effective && periods.get(item.id)?.start !== null && endDay !== null && endDay < timeline.MAX_DAY;
    const completionInherited = domain.inheritedCompletion(data.workItems,item), completed = domain.isCompleted(data.workItems,item);
    const lockTitle = inherited ? '상위 그룹 일정 잠금 적용 중' : item.isScheduleLocked ? '일정 잠금 해제' : '일정 잠금';
    return `<div class="schedule-row ${completed ? 'completed' : ''}" data-row-id="${esc(item.id)}"><div class="tree-row work-name ${pv.selected === item.id ? 'selected' : ''}" style="padding-left:${12 + depth * 22}px">${isGroup ? action('toggle-work', item.id, collapsed ? '▸' : '▾', collapsed ? '그룹 펼치기' : '그룹 접기') : '<span class="icon"></span>'}<span class="number">${number}</span><input type="checkbox" class="complete-toggle" data-action="complete-work" data-id="${esc(item.id)}" aria-label="${esc(item.name)} 완료${completionInherited ? ' (상위 그룹 완료 적용 중)' : ''}" title="${completionInherited ? '상위 그룹 완료 적용 중' : '완료 상태 변경'}" ${completed ? 'checked' : ''} ${completionInherited ? 'disabled' : ''}><button type="button" data-action="select-work" data-id="${esc(item.id)}" class="label" aria-label="${esc(item.name)}">${esc((isGroup ? '▣ ' : '') + item.name)}</button>${isGroup ? '' : `<button type="button" data-action="extend-work" data-id="${esc(item.id)}" class="small" title="종료일 하루 연장" aria-label="종료일 하루 연장" ${canExtend ? '' : 'disabled'}>+1일</button>`}<button type="button" data-action="lock-work" data-id="${esc(item.id)}" class="small lock-toggle" title="${esc(lockTitle)}" aria-label="${esc(lockTitle)}" aria-pressed="${effective}" ${inherited ? 'disabled' : ''}>${lockIcon(effective)}</button></div><div class="timeline-cell" data-timeline-id="${esc(item.id)}"></div></div>`;
  }).join('');
  $('#workspace').innerHTML = `<div class="project-header"><div class="project-title"><h1>${esc(selectedProject.name)}</h1>${action('detail-project', selectedProject.id, '프로젝트 상세')}${action('overview-project', selectedProject.id, '문서 모아보기')}</div><p>휠로 목록을 세로 이동하고 Ctrl+휠로 확대하세요. 작업 이름은 드래그해 순서와 그룹을 바꿀 수 있습니다.</p></div><div class="work-heading"><h2>작업 목록</h2><div class="toolbar"><button type="button" data-action="undo-schedule" title="되돌리기 (Ctrl+Z)" ${history.undo.length ? '' : 'disabled'}>되돌리기</button><button type="button" data-action="redo-schedule" title="다시 실행 (Ctrl+Y 또는 Ctrl+Shift+Z)" ${history.redo.length ? '' : 'disabled'}>다시 실행</button>${action('create-task', '', '+ 작업')}${action('create-group', '', '+ 그룹')}</div></div><div class="schedule-board" tabindex="0" aria-label="일정 탐색"><div class="schedule-head"><div class="work-head">작업<div class="column-divider" role="separator" aria-label="작업 영역 너비 조절" aria-orientation="vertical" tabindex="0" title="드래그하여 작업 영역 너비 조절"></div></div><div class="time-ruler"></div></div>${html || '<p class="empty" style="padding:12px 20px">작업이나 그룹을 추가하세요.</p>'}</div>`;
  const board = $('.schedule-board'); if (Number.isFinite(pv.workColumnWidth)) board.style.setProperty('--work-width', `${pv.workColumnWidth}px`); board.scrollTop = pv.scrollTop || 0;
  setupTimeline(selectedProject.id, periods);
  setupWorkDrag(board, selectedProject.id);

}
function openDetail(item) {
  return new Promise(resolve => {
    const dialog = $('#detail-dialog'), form = $('#detail-form');
    const name = $('#detail-name'), start = $('#detail-start'), end = $('#detail-end'), color = $('#detail-color'), overview = $('#detail-overview'), summary = $('#detail-summary'), lock = $('#detail-lock'), error = $('#detail-error');
    const period = timeline.aggregate(data.workItems, item.projectId).get(item.id);
    const isGroup = item.type === 'group';
    const detailEvents = new AbortController();
    const detailSignal = detailEvents.signal;
    const collections = createTaskCollections(item, detailSignal);
    const comments = structuredClone(item.comments || []), commentInput = $('#comment-input');
    commentInput.value = '';
    function renderComments() {
      $('#comment-count').textContent = String(comments.length);
      const list = $('#comment-list'); list.replaceChildren();
      if (!comments.length) { const empty = document.createElement('p'); empty.className = 'empty comment-empty'; empty.textContent = '아직 코멘트가 없습니다.'; list.append(empty); }
      comments.forEach((comment, index) => {
        const row = document.createElement('div'); row.className = 'comment-row';
        const body = document.createElement('div'); body.className = 'comment-body';
        const text = document.createElement('div'); text.className = 'comment-text'; text.textContent = comment.text;
        const time = document.createElement('div'); time.className = 'comment-time'; time.textContent = new Intl.DateTimeFormat('ko-KR', {dateStyle:'medium',timeStyle:'short'}).format(new Date(comment.createdAt));
        const remove = document.createElement('button'); remove.type = 'button'; remove.className = 'comment-delete'; remove.textContent = '삭제'; remove.setAttribute('aria-label', comment.text + ' 삭제');
        remove.addEventListener('click', () => { comments.splice(index,1); renderComments(); });
        body.append(text,time); row.append(body,remove); list.append(row);
      });
    }
    function addComment() {
      const text = commentInput.value.trim(); if (!text) { commentInput.value = ''; return; }
      comments.unshift({id:crypto.randomUUID(), text, createdAt:new Date().toISOString()}); commentInput.value = ''; renderComments();
    }
    $('#comment-add').addEventListener('click', () => { addComment(); commentInput.focus(); }, {signal:detailSignal});
    commentInput.addEventListener('keydown', event => { if (event.key === 'Enter' && !event.isComposing) { event.preventDefault(); addComment(); } }, {signal:detailSignal});
    renderComments();
    function selectTab(which) {
      for (const tab of ['notes','document','comments']) { $(`#${tab}-panel`).hidden = which !== tab; $(`#tab-${tab}`).setAttribute('aria-selected',String(which === tab)); }
    }
    for (const tab of ['notes','document','comments']) $(`#tab-${tab}`).addEventListener('click', () => selectTab(tab), {signal:detailSignal});
    selectTab('notes');
    let original = {name:item.name, startDate:item.type === 'group' ? '' : item.startDate || '', endDate:item.type === 'group' ? '' : item.endDate || '', overview:item.overview || '', hoverSummary:item.hoverSummary || '', barColor:validBarColor(item), comments:structuredClone(comments), commentDraft:'', ...collections.snapshot()};
    name.value = original.name; overview.value = original.overview; summary.value = original.hoverSummary; color.value = original.barColor;
    start.value = isGroup && period?.start !== null ? timeline.format(period.start) : original.startDate;
    end.value = isGroup && period?.end !== null ? timeline.format(period.end) : original.endDate;
    error.textContent = '';
    function syncDates() {
      if (isGroup || locked()) return;
      end.min = start.value || '0001-01-01';
      if (start.value && (!end.value || end.value < start.value)) end.value = start.value;
    }
    end.min = start.value || '0001-01-01';
    start.addEventListener('change', () => syncDates(), {signal:detailSignal});
    end.addEventListener('change', () => syncDates(), {signal:detailSignal});
    function current() { return {name:name.value, startDate:isGroup ? '' : start.value, endDate:isGroup ? '' : end.value, overview:overview.value, hoverSummary:summary.value, barColor:color.value, comments:structuredClone(comments), commentDraft:commentInput.value, ...collections.snapshot()}; }
    function locked() { const currentItem = data.workItems.find(x => x.id === item.id); return currentItem ? domain.isLocked(data.workItems,currentItem) : false; }
    function inherited() { const currentItem = data.workItems.find(x => x.id === item.id); return currentItem ? domain.inheritedLock(data.workItems,currentItem) : false; }
    function updateLock() {
      start.disabled = end.disabled = isGroup || locked(); lock.hidden = false; lock.disabled = inherited();
      lock.innerHTML = lockIcon(locked()) + (inherited() ? ' 상위 그룹에서 잠김' : item.isScheduleLocked ? ' 일정 잠금 해제' : ' 일정 잠금');
      lock.setAttribute('aria-pressed', String(locked()));
      $('#detail-period-hint').textContent = isGroup ? '그룹 기간은 하위 작업에서 자동 계산됩니다.' : locked() ? '일정이 잠겨 있어 날짜를 변경할 수 없습니다.' : '날짜를 모두 비우면 기간 미정입니다.';
    }
    function finish() { detailEvents.abort(); collections.destroy(); dialog.close(); const target = document.querySelector(`[data-action="select-work"][data-id="${CSS.escape(item.id)}"]`); if (target) target.focus(); resolve(); }
    let saving = false;
    async function save() {
      if (saving) return false;
      saving = true; form.inert = true; $('#detail-save').disabled = true; lock.disabled = true; error.textContent = '';
      try {
        await collections.waitPending();
        addComment(); const {commentDraft, ...draft} = current(); if (!isGroup) timeline.validate(draft.startDate, draft.endDate);
        await changeContent({op:'detail',kind:'work',id:item.id,...draft});
        finish(); return true;
      } catch (e) { error.textContent = e.message; return false; }
      finally { saving = false; form.inert = false; $('#detail-save').disabled = false; lock.disabled = inherited(); }
    }
    async function close() {
      if (saving) return;
      saving = true; form.inert = true;
      try { await collections.waitPending(); } finally { saving = false; form.inert = false; }
      if (JSON.stringify(current()) === JSON.stringify(original)) { finish(); return; }
      const choice = await new Promise(done => {
        const confirm = $('#discard-dialog');
        const endChoice = value => { confirm.close(); done(value); };
        $('#discard-continue').onclick = () => endChoice('continue'); $('#discard-changes').onclick = () => endChoice('discard'); $('#discard-save').onclick = () => endChoice('save');
        confirm.oncancel = event => { event.preventDefault(); endChoice('continue'); }; confirm.showModal();
      });
      if (choice === 'discard') finish(); else if (choice === 'save') await save();
    }
    form.onsubmit = event => { event.preventDefault(); save(); };
    $('#detail-cancel').onclick = close;
    $('#detail-delete').onclick = async () => {
      if (saving) return;
      saving = true; form.inert = true; error.textContent = '';
      try { await handle('delete-work', item.id); if (!data.workItems.some(entry => entry.id === item.id)) finish(); }
      catch (e) { error.textContent = e.message; }
      finally { saving = false; form.inert = false; }
    };
    dialog.oncancel = event => { event.preventDefault(); close(); };
    lock.onclick = async () => {
      if (saving) return;
      if (!isGroup && !locked() && (start.value !== original.startDate || end.value !== original.endDate)) { error.textContent = '날짜 변경을 먼저 저장하거나 버린 뒤 잠가 주세요.'; return; }
      try { saving = true; lock.disabled = true; await changeContent({op:'lock',kind:'work',id:item.id,locked:!item.isScheduleLocked}); item = data.workItems.find(x => x.id === item.id); error.textContent = ''; updateLock(); }
      catch (e) { error.textContent = e.message; }
      finally { saving = false; lock.disabled = inherited(); }
    };
    updateLock(); dialog.showModal(); name.focus();
  });
}
function hideTooltip() { clearTimeout(hideTooltip.timer); $('#tooltip').hidden = true; }
function showTooltip(bar, delay = 0) {
  hideTooltip();
  hideTooltip.timer = setTimeout(() => {
    if (!bar.isConnected) return;
    const item = data.workItems.find(x => x.id === (bar.dataset.barId || bar.dataset.id || bar.closest('.schedule-row')?.dataset.rowId)); if (!item) return;
    const p = timeline.aggregate(data.workItems,item.projectId).get(item.id);
    const text = p?.start === null || !p ? '기간 미정' : `${timeline.format(p.start)} ~ ${timeline.format(p.end)}`;
    const tip = $('#tooltip'); tip.textContent = [item.name,text,item.hoverSummary || ''].filter(Boolean).join('\n'); tip.hidden = false;
    const rect = bar.getBoundingClientRect(), box = tip.getBoundingClientRect();
    tip.style.left = `${Math.max(8,Math.min(innerWidth-box.width-8,rect.left))}px`;
    tip.style.top = `${Math.max(8,Math.min(innerHeight-box.height-8,rect.bottom+8))}px`;
  }, delay);
}
let timelineObserver, cancelActiveDrag = null, redrawTimeline = () => {};
document.addEventListener('keydown', event => { if (event.key === 'Escape' && cancelActiveDrag) { event.preventDefault(); cancelActiveDrag(); } });
function setupTimeline(projectId, periods) {
  if (timelineObserver) timelineObserver.disconnect();
  const board = $('.schedule-board'), ruler = $('.time-ruler'), state = projectView(projectId);
  let level, pending = [], frame = 0, drag = null, shift = null, suppressDoubleUntil = 0;
  const originalPeriods = periods;
  function width() { return ruler.clientWidth; }
  function ensure() {
    const w = width(); if (!w) return false;
    if (!Number.isFinite(state.centerDay) || !Number.isFinite(state.pixelsPerDay) || state.pixelsPerDay <= 0) {
      const initial = timeline.initial(data.workItems, projectId, w); state.centerDay = initial.center; state.pixelsPerDay = initial.ppd; scheduleViewSave();
    }
    const bounded = timeline.limit(state.centerDay, state.pixelsPerDay, w);
    if (bounded.center !== state.centerDay || bounded.ppd !== state.pixelsPerDay) { state.centerDay = bounded.center; state.pixelsPerDay = bounded.ppd; scheduleViewSave(); }
    return true;
  }
  function draw() {
    if (!board.isConnected || !ensure()) return;
    const w = width(), left = state.centerDay - w / state.pixelsPerDay / 2;
    const generated = timeline.ticks(state.centerDay, state.pixelsPerDay, w, level); level = generated.level;
    const showYearBand = generated.level < 4;
    ruler.classList.toggle('day-view', generated.level === 0);
    ruler.classList.toggle('has-year-band', showYearBand);
    const years = showYearBand ? timeline.yearBands(state.centerDay, state.pixelsPerDay, w).map(b => `<span class="year-label" style="left:${b.left}px;width:${b.width}px">${b.year}년</span>`).join('') : '';
    const tickLabel = tick => {
      const month = new Date(tick.day * timeline.DAY).getUTCMonth() + 1;
      return generated.level === 3 ? `${Math.floor((month - 1) / 3) + 1}분기` : generated.level === 2 ? `${month}월` : tick.label;
    };
    const weekendBands = generated.level === 0 ? generated.ticks.map(t => {
      const weekday = new Date(t.day * timeline.DAY).getUTCDay();
      if (weekday !== 0 && weekday !== 6) return '';
      const x = (t.day-left)*state.pixelsPerDay, l = Math.max(0,x), r = Math.min(w,x+state.pixelsPerDay);
      if (r <= l) return '';
      return `<span class="weekend-band ${weekday === 6 ? 'saturday' : 'sunday'}" data-day="${t.day}" style="left:${l}px;width:${r-l}px"></span>`;
    }).join('') : '';
    const labelInterval = generated.level === 0 ? timeline.dayLabelInterval(state.pixelsPerDay) : 1;
    ruler.innerHTML = years + weekendBands + generated.ticks.filter(t => generated.level !== 0 || ((t.day % labelInterval) + labelInterval) % labelInterval === 0).map(t => `<span class="tick-label" style="left:${(t.day-left)*state.pixelsPerDay}px">${esc(tickLabel(t))}</span>`).join('');
    const lines = generated.ticks.map(t => `<i class="tick-line" style="left:${(t.day-left)*state.pixelsPerDay}px"></i>`).join('');
    for (const cell of board.querySelectorAll('.timeline-cell')) {
      const period = periods.get(cell.dataset.timelineId), item = data.workItems.find(x => x.id === cell.dataset.timelineId);
      let bar = '';
      if (period && period.start !== null) {
        const begin = (period.start-left)*state.pixelsPerDay, end = (period.end+1-left)*state.pixelsPerDay;
        if (end > 0 && begin < w) {
          const l = Math.max(0, begin), r = Math.min(w, end);
          bar = `<button type="button" class="bar ${item.type === 'group' ? 'group-bar' : 'task-bar'} ${domain.isLocked(data.workItems,item) ? 'locked' : ''} ${begin < 0 ? 'continued-left' : ''} ${end > w ? 'continued-right' : ''}" data-bar-id="${esc(item.id)}" aria-label="${esc(item.name)} ${timeline.format(period.start)} ~ ${timeline.format(period.end)}${domain.isLocked(data.workItems,item) ? ' 일정 잠김' : ''}" style="left:${l}px;width:${Math.max(1,r-l)}px;--bar-color:${validBarColor(item)};--bar-text-color:${barTextColor(validBarColor(item))}"><span class="bar-label">${esc(item.name)}</span>${domain.isLocked(data.workItems,item) ? `<span class="bar-lock" aria-hidden="true">${lockIcon(true)}</span>` : ''}</button>`;
        }
      }
      cell.innerHTML = weekendBands + lines + bar;
    }
  }
  function update(center, ppd) { const v = timeline.limit(center, ppd, width()); state.centerDay = v.center; state.pixelsPerDay = v.ppd; draw(); scheduleViewSave(); }
  board.addEventListener('wheel', event => {
    if (!event.target.closest('.time-ruler, .timeline-cell')) return;
    hideTooltip();
    if (shift || busy) { event.preventDefault(); return; }
    event.preventDefault(); const unit = event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? board.clientHeight : 1;
    const dx = event.deltaX * unit, dy = event.deltaY * unit, rect = ruler.getBoundingClientRect();
    if (!event.ctrlKey && Math.abs(dy) >= Math.abs(dx)) { board.scrollTop += dy; return; }
    if (event.ctrlKey && !dy) return;
    pending.push({ctrl:event.ctrlKey, dx, dy, x:event.clientX-rect.left});
    if (!frame) frame = requestAnimationFrame(() => {
      frame = 0; if (!board.isConnected || !ensure()) { pending = []; return; }
      for (const e of pending) {
        if (e.ctrl) { const v = timeline.zoom(state.centerDay, state.pixelsPerDay, width(), e.x, e.dy); state.centerDay = v.center; state.pixelsPerDay = v.ppd; }
        else { const delta = Math.abs(e.dx) > Math.abs(e.dy) ? e.dx : e.dy; state.centerDay += delta / state.pixelsPerDay; const v = timeline.limit(state.centerDay,state.pixelsPerDay,width()); state.centerDay = v.center; }
      }
      pending = []; draw(); scheduleViewSave();
    });
  }, {passive:false});
  function periodLabels() {
    for (const cell of board.querySelectorAll('.schedule-row')) {
      const p = periods.get(cell.dataset.rowId), label = cell.querySelector('.period'); if (!p || !label) continue;
      const text = p.start === null ? '기간 미정' : `${timeline.format(p.start)} ~ ${timeline.format(p.end)}${p.undated ? ` · 미정 ${p.undated}개` : ''}`;
      label.textContent = text; label.title = text;
    }
  }
  function resetShift() {
    if (!shift) return; shift = null; cancelActiveDrag = null; periods = originalPeriods; board.classList.remove('panning'); draw(); periodLabels();
  }
  board.addEventListener('pointerdown', event => {
    if (busy || event.button !== 0 || !event.target.closest('.timeline-cell, .time-ruler')) return;
    hideTooltip();
    const bar = event.target.closest('.bar');
    if (bar) {
      const item = data.workItems.find(x => x.id === (bar.dataset.barId || bar.dataset.id || bar.closest('.schedule-row')?.dataset.rowId));
      if (!item || item.type !== 'task') return;
      if (domain.isLocked(data.workItems,item)) { status.textContent = '일정이 잠겨 있습니다.'; return; }
      shift = {id:event.pointerId, itemId:item.id, item, x:event.clientX, ppd:state.pixelsPerDay, started:false, days:0};
      cancelActiveDrag = resetShift;
      document.addEventListener('pointerup', () => { if (shift && !shift.started) { shift = null; cancelActiveDrag = null; } }, {once:true});
      return;
    }
    drag = {x:event.clientX, center:state.centerDay, id:event.pointerId}; board.setPointerCapture(event.pointerId); board.classList.add('panning'); event.preventDefault();
  });
  board.addEventListener('pointermove', event => {
    if (shift && event.pointerId === shift.id) {
      const dx = event.clientX - shift.x; if (!shift.started && Math.abs(dx) < 4) return;
      if (!shift.started) { shift.started = true; board.setPointerCapture(event.pointerId); } board.classList.add('panning');
      const begin = timeline.parse(shift.item.startDate), end = timeline.parse(shift.item.endDate);
      const days = Math.max(timeline.MIN_DAY-begin, Math.min(timeline.MAX_DAY-end, Math.round(dx/shift.ppd)));
      if (days === shift.days) return;
      shift.days = days;
      const changed = domain.shiftDates(shift.item, days);
      periods = timeline.aggregate(data.workItems.map(x => x.id === shift.itemId ? {...x,...changed} : x),projectId);
      draw(); periodLabels(); return;
    }
    if (drag && event.pointerId === drag.id) update(drag.center - (event.clientX - drag.x) / state.pixelsPerDay, state.pixelsPerDay);
  });
  board.addEventListener('pointerup', async event => {
    if (shift && event.pointerId === shift.id) {
      const current = shift; if (!current.started) { shift = null; cancelActiveDrag = null; return; }
      suppressDoubleUntil = Date.now()+500; resetShift();
      if (current.days === 0) return;
      busy = true; status.textContent = '저장 중';
      try { await changeSchedule({op:'shift',kind:'work',id:current.itemId,days:current.days}); status.textContent = '저장됨'; status.className = ''; }
      catch (error) { status.textContent = '저장 실패: ' + error.message; status.className = 'error'; }
      finally { busy = false; }
      return;
    }
    if (drag && event.pointerId === drag.id) { drag = null; board.classList.remove('panning'); }
  });
  board.addEventListener('pointercancel', event => { if (shift && event.pointerId === shift.id) resetShift(); if (drag && event.pointerId === drag.id) { drag = null; board.classList.remove('panning'); } });
  board.addEventListener('lostpointercapture', event => { if (shift && event.pointerId === shift.id) resetShift(); if (drag && event.pointerId === drag.id) { drag = null; board.classList.remove('panning'); } });
  board.addEventListener('dblclick', async event => {
    if (busy || Date.now() < suppressDoubleUntil) return;
    const bar = event.target.closest('.bar'), label = event.target.closest('[data-action="select-work"]');
    const row = event.target.closest('.work-name');
    if (row && event.target.closest('button, input') && !label) return;
    const id = bar?.dataset.barId || label?.dataset.id || row?.closest('.schedule-row')?.dataset.rowId; if (!id) return;
    const item = data.workItems.find(x => x.id === id); if (!item) return;
    hideTooltip(); busy = true;
    try { await openDetail(item); } finally { busy = false; }
  });
  board.addEventListener('pointerover', event => { const bar = event.target.closest('.bar, .work-name'); if (bar && !shift && !drag && !board.classList.contains('work-dragging')) showTooltip(bar,350); });
  board.addEventListener('pointerout', event => { if (event.target.closest('.bar, .work-name')) hideTooltip(); });
  board.addEventListener('focusin', event => { const bar = event.target.closest('.bar, .work-name'); if (bar) showTooltip(bar); });
  board.addEventListener('focusout', event => { if (event.target.closest('.bar, .work-name')) hideTooltip(); });
  board.addEventListener('scroll', () => { hideTooltip(); if (!board.isConnected) return; state.scrollTop = board.scrollTop; scheduleViewSave(); });
  board.addEventListener('keydown', event => {
    if (event.key === 'Enter' && event.target.matches('.bar') && !busy) { const item = data.workItems.find(x => x.id === event.target.dataset.barId); if (item) { hideTooltip(); busy = true; openDetail(item).finally(() => { busy = false; }); event.preventDefault(); } return; }
    if (event.target !== board || busy) return;
    if (event.key === '+' || event.key === '=' || event.key === '-') { const v = timeline.zoom(state.centerDay,state.pixelsPerDay,width(),width()/2,event.key === '-' ? 120 : -120); update(v.center,v.ppd); }
    else if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') update(state.centerDay + (event.key === 'ArrowLeft' ? -1 : 1)*width()*.15/state.pixelsPerDay,state.pixelsPerDay);
    else if (event.key === 'ArrowUp' || event.key === 'ArrowDown') board.scrollTop += event.key === 'ArrowUp' ? -48 : 48;
    else return;
    event.preventDefault();
  });
  const divider = board.querySelector('.column-divider');
  let resizing = null;
  function setColumnWidth(value) {
    const max = Math.max(300, Math.max(board.clientWidth, 760) - 240);
    state.workColumnWidth = Math.max(300, Math.min(max, value));
    board.style.setProperty('--work-width', `${state.workColumnWidth}px`);
    divider.setAttribute('aria-valuenow', String(Math.round(state.workColumnWidth)));
  }
  divider.addEventListener('pointerdown', event => {
    if (busy || event.button !== 0) return;
    event.preventDefault(); event.stopPropagation(); hideTooltip();
    resizing = {id:event.pointerId, x:event.clientX, width:board.querySelector('.work-head').getBoundingClientRect().width};
    divider.setPointerCapture(event.pointerId); board.classList.add('resizing');
  });
  divider.addEventListener('pointermove', event => { if (resizing && resizing.id === event.pointerId) setColumnWidth(resizing.width + event.clientX - resizing.x); });
  divider.addEventListener('pointerup', event => { if (resizing && resizing.id === event.pointerId) { resizing = null; board.classList.remove('resizing'); scheduleViewSave(); } });
  const cancelResize = event => { if (resizing && resizing.id === event.pointerId) { setColumnWidth(resizing.width); resizing = null; board.classList.remove('resizing'); } };
  divider.addEventListener('pointercancel', cancelResize); divider.addEventListener('lostpointercapture', cancelResize);
  divider.addEventListener('keydown', event => {
    if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;
    event.preventDefault(); event.stopPropagation(); setColumnWidth(board.querySelector('.work-head').getBoundingClientRect().width + (event.key === 'ArrowLeft' ? -20 : 20)); scheduleViewSave();
  });
  redrawTimeline = draw;
  timelineObserver = new ResizeObserver(draw); timelineObserver.observe(ruler); draw();
}
function ask({title, description = '', value = '', options, confirm = false}) {
  return new Promise(resolve => {
    const dlg = $('#dialog'), input = $('#dialog-input'), select = $('#dialog-select');
    $('#dialog-title').textContent = title; $('#dialog-description').textContent = description;
    $('#dialog-error').textContent = ''; $('#dialog-label').textContent = options ? '이동할 위치' : '이름';
    input.hidden = !!options || confirm; select.hidden = !options || confirm; $('#dialog-label').hidden = confirm;
    input.value = value; select.replaceChildren();
    if (options) for (const option of options) { const el = document.createElement('option'); el.value = option.id || ''; el.textContent = option.label; select.append(el); }
    const finish = result => { dlg.close(); resolve(result); };
    $('#dialog-cancel').onclick = () => finish(null);
    dlg.oncancel = event => { event.preventDefault(); finish(null); };
    $('#dialog-form').onsubmit = event => { event.preventDefault(); const result = confirm ? true : options ? select.value : input.value.trim(); if (!confirm && !options && !result) { $('#dialog-error').textContent = '이름을 입력해 주세요.'; return; } finish(result); };
    dlg.showModal(); if (!confirm) (options ? select : input).focus(); else $('#dialog-cancel').focus();
  });
}
let viewSaveChain = Promise.resolve(), viewSaveTimer;
function persistView(snapshot) {
  const pending = viewSaveChain.catch(() => {}).then(() => window.storage.saveViewState(snapshot));
  viewSaveChain = pending; return pending;
}
window.addEventListener('beforeunload', () => {
  if (!view || !viewSaveTimer) return;
  clearTimeout(viewSaveTimer); viewSaveTimer = null;
  const error = window.storage.flushViewState(structuredClone(view));
  if (error) { status.textContent = '보기 저장 실패: ' + error; status.className = 'error'; }
});
function scheduleViewSave() {
  clearTimeout(viewSaveTimer);
  viewSaveTimer = setTimeout(() => { viewSaveTimer = null; persistView(structuredClone(view)).catch(error => { status.textContent = '보기 저장 실패: ' + error.message; status.className = 'error'; }); }, 500);
}
async function saveView(next) {
  clearTimeout(viewSaveTimer); viewSaveTimer = null;
  await persistView(next); view = next; render();
}
async function changeView(update) { const next = structuredClone(view); update(next); await saveView(next); }
async function changeContent(command, updateView) {
  pendingContent++;
  try { data = await window.storage.command(command); render(); } finally { pendingContent--; }
  if (updateView) { const nextView = structuredClone(view); updateView(nextView); await saveView(nextView); }
}
async function changeSchedule(command) {
  const item = data.workItems.find(x => x.id === command.id);
  const before = {startDate:item.startDate || null, endDate:item.endDate || null};
  pendingContent++;
  try {
    data = await window.storage.command(command);
    const updated = data.workItems.find(x => x.id === command.id);
    const after = {startDate:updated.startDate || null, endDate:updated.endDate || null};
    const history = historyFor(item.projectId);
    history.undo.push({id:item.id, before, after});
    if (history.undo.length > 100) history.undo.shift();
    history.redo.length = 0;
    render();
  } finally { pendingContent--; }
}
async function restoreSchedule(direction, projectId) {
  const history = historyFor(projectId), source = history[direction], destination = history[direction === 'undo' ? 'redo' : 'undo'];
  const entry = source[source.length - 1]; if (!entry) return;
  const expected = direction === 'undo' ? entry.after : entry.before;
  const target = direction === 'undo' ? entry.before : entry.after;
  pendingContent++;
  try {
    data = await window.storage.command({op:'schedule',kind:'work',id:entry.id,...target,expected});
    source.pop(); destination.push(entry); render();
  } finally { pendingContent--; }
}
function optionsForFolders() {
  const result = [{ id: '', label: '최상위' }];
  function visit(parent, prefix) { for (const f of data.folders.filter(x => (x.parentId || null) === parent)) { const label = prefix + f.name; result.push({id: f.id, label}); visit(f.id, label + ' / '); } }
  visit(null, ''); return result;
}
async function handle(name, id) {
  const selected = view.selectedProject, pv = selected ? projectView(selected) : null;
  if ((name === 'undo-schedule' || name === 'redo-schedule') && selected) return restoreSchedule(name === 'undo-schedule' ? 'undo' : 'redo', selected);
  if (name === 'toggle-sidebar') return changeView(v => { v.sidebarClosed = !v.sidebarClosed; });
  if (name === 'select-folder') return changeView(v => { v.selectedFolder = id || null; });
  if (name === 'toggle-folder') return changeView(v => { v.expandedFolders = v.expandedFolders.includes(id) ? v.expandedFolders.filter(x => x !== id) : [...v.expandedFolders, id]; });
  if (name === 'select-project') return changeView(v => { v.selectedProject = id; });
  if (name === 'select-work') {
    const next = structuredClone(view), p = next.projects[selected] ||= {collapsed: [], selected: null}; p.selected = id;
    const period = timeline.aggregate(data.workItems,selected).get(id), ruler = document.querySelector('.time-ruler');
    if (period?.start != null && ruler && Number.isFinite(p.pixelsPerDay)) p.centerDay = timeline.limit(period.start + .5,p.pixelsPerDay,ruler.clientWidth).center;
    clearTimeout(viewSaveTimer); viewSaveTimer = null; await persistView(next);
    Object.assign(projectView(selected),p); document.querySelectorAll('.work-name').forEach(el => el.classList.toggle('selected', el.closest('.schedule-row').dataset.rowId === id)); redrawTimeline(); return;
  }
  if (name === 'toggle-work') return changeView(v => { const p = v.projects[selected] ||= {collapsed: [], selected: null}; p.collapsed = p.collapsed.includes(id) ? p.collapsed.filter(x => x !== id) : [...p.collapsed, id]; });
  if (name.startsWith('create-')) {
    const kind = name === 'create-folder' ? 'folder' : name === 'create-project' ? 'project' : 'work';
    const type = name === 'create-group' ? 'group' : 'task';
    const label = name === 'create-task' ? '새 작업' : await ask({title: kind === 'folder' ? '폴더 만들기' : kind === 'project' ? '프로젝트 만들기' : '그룹 만들기'});
    if (label === null) return;
    const newId = crypto.randomUUID();
    const current = pv && data.workItems.find(x => x.id === pv.selected && x.projectId === selected);
    const parentId = kind === 'work' ? (current?.type === 'group' ? current.id : current?.parentId || null) : view.selectedFolder;
    await changeContent({op:'create', kind, id:newId, name:label, parentId, projectId:selected, type}, v => {
      if (kind === 'folder') { v.selectedFolder = newId; if (parentId && !v.expandedFolders.includes(parentId)) v.expandedFolders.push(parentId); }
      if (kind === 'project') { v.selectedProject = newId; if (parentId && !v.expandedFolders.includes(parentId)) v.expandedFolders.push(parentId); }
      if (kind === 'work') { const p = v.projects[selected] ||= {collapsed:[], selected:null}; p.selected = newId; p.collapsed = p.collapsed.filter(x => x !== parentId); }
    });
    if (name === 'create-task') { const target = document.querySelector(`[data-action="select-work"][data-id="${CSS.escape(newId)}"]`); if (target) { target.scrollIntoView({block:'nearest'}); target.focus(); } }
    return;
  }
  const [op, kind] = name.split('-');
  const list = kind === 'folder' ? data.folders : kind === 'project' ? data.projects : data.workItems;
  const item = list.find(x => x.id === id); if (!item) return;
  if (op === 'detail') return kind === 'project' ? openProjectDetail(item) : openDetail(item);
  if (op === 'overview' && kind === 'project') return openProjectOverview(item);
  if (op === 'extend' && kind === 'work' && item.type === 'task') {
    const endDay = timeline.parse(item.endDate);
    if (domain.isLocked(data.workItems, item) || timeline.parse(item.startDate) === null || endDay === null || endDay >= timeline.MAX_DAY) return;
    return changeSchedule({op:'schedule', kind:'work', id, startDate:item.startDate, endDate:timeline.format(endDay + 1)});
  }
  if (op === 'complete' && kind === 'work' && ['task','group'].includes(item.type)) {
    await changeContent({op:'complete',kind:'work',id,completed:!item.isCompleted});
    document.querySelector(`[data-action="complete-work"][data-id="${CSS.escape(id)}"]`)?.focus(); return;
  }
  if (op === 'lock') return changeContent({op:'lock',kind:'work',id,locked:!item.isScheduleLocked});
  if (op === 'rename') { const label = await ask({title:'이름 변경', value:item.name}); if (label !== null) return changeContent({op, kind, id, name:label}); }
  if (op === 'move') {
    const options = kind === 'work' ? [{id:'',label:'프로젝트 최상위'}, ...domain.numbered(data, selected).filter(r => r.item.type === 'group' && !domain.descendants(data.workItems, id).has(r.item.id)).map(r => ({id:r.item.id,label:r.number + ' ' + r.item.name}))] : optionsForFolders().filter(x => kind !== 'folder' || !domain.descendants(data.folders, id).has(x.id));
    const parentId = await ask({title:'이동', options}); if (parentId === null) return;
    return changeContent({op,kind,id,parentId:parentId || null}, v => { if (kind === 'work' && parentId) { const p = v.projects[selected]; p.collapsed = p.collapsed.filter(x => x !== parentId); } if (kind !== 'work' && parentId && !v.expandedFolders.includes(parentId)) v.expandedFolders.push(parentId); });
  }
  if (op === 'up' || op === 'down') return changeContent({op:'reorder',kind,id,direction:op === 'up' ? -1 : 1});
  if (op === 'delete') {
    const folderIds = kind === 'folder' ? domain.descendants(data.folders,id) : new Set();
    const projectIds = new Set(kind === 'project' ? [id] : data.projects.filter(p => folderIds.has(p.parentId)).map(p => p.id));
    const workIds = kind === 'work' ? domain.descendants(data.workItems,id) : new Set(data.workItems.filter(w => projectIds.has(w.projectId)).map(w => w.id));
    const description = `“${item.name}”을(를) 삭제합니다. 포함: 폴더 ${Math.max(0, folderIds.size - (kind === 'folder' ? 1 : 0))}개, 프로젝트 ${kind === 'project' ? 0 : projectIds.size}개, 하위 작업·그룹 ${Math.max(0, workIds.size - (kind === 'work' ? 1 : 0))}개.`;
    if (!(await ask({title:'삭제 확인',description,confirm:true}))) return;
    const nextProject = kind === 'project' && view.selectedProject === id ? data.projects.find(p => p.id !== id && (p.parentId || null) === (item.parentId || null))?.id || null : null;
    return changeContent({op,kind,id}, v => { if (projectIds.has(v.selectedProject)) v.selectedProject = nextProject; if (folderIds.has(v.selectedFolder)) v.selectedFolder = null; v.expandedFolders = v.expandedFolders.filter(x => !folderIds.has(x)); for (const projectId of projectIds) delete v.projects[projectId]; for (const state of Object.values(v.projects)) { state.collapsed = state.collapsed.filter(x => !workIds.has(x)); if (workIds.has(state.selected)) state.selected = null; } });
  }
}
document.addEventListener('click', async event => {
  const target = event.target.closest('[data-action], #sidebar-toggle');
  if (target?.dataset.action === 'complete-work') event.preventDefault();
  if (!target || busy || !data || (target.dataset.action === 'select-work' && event.detail > 1)) return;
  busy = true; status.textContent = '처리 중';
  try { await handle(target.id === 'sidebar-toggle' ? 'toggle-sidebar' : target.dataset.action, target.dataset.id || ''); status.textContent = '저장됨'; status.className = ''; }
  catch (error) { status.textContent = '저장 실패: ' + error.message; status.className = 'error'; }
  finally { busy = false; }
});
document.addEventListener('keydown', async event => {
  if (!(event.ctrlKey || event.metaKey) || event.altKey || busy || !data || !view.selectedProject || document.querySelector('dialog[open]') || document.body.inert || cancelActiveDrag) return;
  if (event.target.closest?.('input, textarea, select, [contenteditable]')) return;
  const key = event.key.toLowerCase();
  const direction = key === 'z' ? (event.shiftKey ? 'redo' : 'undo') : key === 'y' && !event.shiftKey ? 'redo' : null;
  if (!direction) return;
  event.preventDefault(); busy = true;
  try { await restoreSchedule(direction, view.selectedProject); status.textContent = '저장됨'; status.className = ''; }
  catch (error) { status.textContent = '저장 실패: ' + error.message; status.className = 'error'; }
  finally { busy = false; }
});
Promise.all([window.storage.loadContent(), window.storage.loadViewState()]).then(([content, state]) => {
  data = domain.normalize(content); view = { sidebarClosed:false, selectedFolder:null, selectedProject:null, expandedFolders:[], projects:{}, ...state };
  render(); status.textContent = '저장소 준비됨';
}).catch(error => { status.textContent = '저장소 오류: ' + error.message; status.className = 'error'; $('#workspace').textContent = '데이터를 불러오지 못했습니다. 앱을 다시 실행해 주세요.'; });
