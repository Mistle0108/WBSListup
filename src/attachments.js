function createAttachments(container, kind, ownerId, signal, readOnly = false, onCount) {
  container.replaceChildren();
  const controls = document.createElement('div'), list = document.createElement('div'), error = document.createElement('p');
  error.className = 'error'; error.setAttribute('role', 'alert');
  if (!readOnly) {
    const add = document.createElement('button'); add.type = 'button'; add.textContent = '+ 첨부파일';
    const hint = document.createElement('p'); hint.className = 'hint'; hint.textContent = '첨부파일은 즉시 저장됩니다.';
    add.addEventListener('click', () => run(() => window.storage.addAttachments(kind, ownerId), true), {signal});
    controls.append(add, hint);
  }
  container.append(controls, list, error);
  function draw(files) {
    list.replaceChildren();
    if (!files.length) { const empty = document.createElement('p'); empty.className = 'empty'; empty.textContent = '첨부파일이 없습니다.'; list.append(empty); }
    for (const file of files) {
      const row = document.createElement('div'), open = document.createElement('button');
      row.className = 'attachment-row'; open.className = 'attachment-name'; open.type = 'button'; open.textContent = file.name; open.title = file.name;
      open.addEventListener('click', () => run(async () => { await window.storage.openAttachment(kind, ownerId, file.id); }), {signal});
      row.append(open);
      if (!readOnly) {
        const remove = document.createElement('button'); remove.type = 'button'; remove.textContent = '삭제'; remove.setAttribute('aria-label', file.name + ' 삭제');
        remove.addEventListener('click', () => { if (confirm(`“${file.name}” 첨부를 삭제하시겠습니까?`)) run(() => window.storage.deleteAttachment(kind, ownerId, file.id), true); }, {signal});
        row.append(remove);
      }
      list.append(row);
    }
  }
  let pending = false;
  function showFiles(files) {
    onCount?.(files.length);
    if (!signal.aborted) draw(files);
  }
  async function run(action, changesFiles = false) {
    if (pending) return;
    pending = true;
    error.textContent = '';
    try {
      const files = await action();
      if (files) showFiles(files);
    } catch (err) {
      if (changesFiles) {
        // A multi-file add can fail after saving some of the files.
        try { showFiles(await window.storage.listAttachments(kind, ownerId)); } catch {}
      }
      if (!signal.aborted) error.textContent = '첨부파일 처리 실패: ' + err.message;
    } finally { pending = false; }
  }
  run(() => window.storage.listAttachments(kind, ownerId));
}
