function setupWorkDrag(board, projectId) {
  let pending = null, dragging = false, target = null;
  function clearHighlight() { board.querySelectorAll('.drop-before,.drop-after,.drop-inside,.drop-root').forEach(el => el.classList.remove('drop-before','drop-after','drop-inside','drop-root')); }
  function locate(event) {
    const element = document.elementFromPoint(event.clientX,event.clientY);
    const row = element?.closest('.work-name');
    const header = element?.closest('.work-head');
    const bounds = board.querySelector('.work-head').getBoundingClientRect();
    if (!row) {
      const last = [...board.querySelectorAll('.schedule-row')].at(-1)?.getBoundingClientRect();
      if (header || (last && event.clientY > last.bottom && event.clientX >= bounds.left && event.clientX <= bounds.right)) return {parentId:null, element:header || board.querySelector('.work-head'), placement:'root'};
      return null;
    }
    const id = row.closest('.schedule-row').dataset.rowId;
    const item = data.workItems.find(x => x.id === id), rect = row.getBoundingClientRect();
    if (!item || id === pending.id || domain.descendants(data.workItems,pending.id).has(id)) return null;
    const ratio = (event.clientY-rect.top)/rect.height;
    const placement = item.type === 'group' && ratio >= .25 && ratio <= .75 ? 'inside' : ratio < .5 ? 'before' : 'after';
    return {targetId:id,placement,element:row};
  }
  function reset() { pending = null; dragging = false; target = null; clearHighlight(); board.classList.remove('work-dragging'); }
  board.addEventListener('pointerdown',event => {
    const label = event.target.closest('[data-action="select-work"]');
    if (busy || !label || event.button !== 0) return;
    pending = {id:label.dataset.id, pointerId:event.pointerId, x:event.clientX, y:event.clientY};
  });
  board.addEventListener('pointermove',event => {
    if (!pending || event.pointerId !== pending.pointerId) return;
    if (!dragging && Math.hypot(event.clientX-pending.x,event.clientY-pending.y)<6) return;
    if (!dragging) { dragging = true; board.setPointerCapture(event.pointerId); board.classList.add('work-dragging'); hideTooltip(); }
    event.preventDefault(); clearHighlight(); target = locate(event);
    if (target) target.element.classList.add('drop-'+target.placement);
    const r = board.getBoundingClientRect();
    if (event.clientY > r.bottom-25) board.scrollTop += 16;
    else if (event.clientY < r.top+55) board.scrollTop -= 16;
  });
  board.addEventListener('pointerup',async event => {
    if (!pending || event.pointerId !== pending.pointerId) return;
    const id = pending.id, destination = target, moved = dragging; reset();
    if (!moved || !destination) return;
    busy = true; status.textContent = '저장 중';
    try {
      const command = destination.placement === 'root' ? {op:'move',kind:'work',id,parentId:null} : {op:'move',kind:'work',id,targetId:destination.targetId,placement:destination.placement};
      await changeContent(command, v => {
        const p = v.projects[projectId] ||= {collapsed:[],selected:null}; p.selected = id;
        if (destination.placement === 'inside') p.collapsed = p.collapsed.filter(x => x !== destination.targetId);
      });
      status.textContent = '저장됨'; status.className = '';
    } catch (error) { status.textContent = '이동 실패: ' + error.message; status.className = 'error'; }
    finally { busy = false; }
  });
  board.addEventListener('pointercancel',event => { if (pending?.pointerId === event.pointerId) reset(); });
  board.addEventListener('lostpointercapture',event => { if (pending?.pointerId === event.pointerId) reset(); });
  board.addEventListener('keydown',event => { if (event.key === 'Escape' && pending) { reset(); event.preventDefault(); } });
}
