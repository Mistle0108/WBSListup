function createTaskCollections(item, signal, onCount) {
  const newId = () => crypto.randomUUID();
  const boards = structuredClone(domain.workBoards(item));
  const toDraft = entry => ({
    id: entry.id,
    name: entry.name,
    schemaVersion: 2,
    content: toDocumentMarkdown(entry.content, entry.schemaVersion)
  });
  const saved = new Map(domain.workDocuments(item).map(entry => [entry.id, {entry, draft:toDraft(entry)}]));
  let documents = [...saved.values()].map(({draft}) => ({...draft}));
  let boardIndex = boards.length ? 0 : -1, documentIndex = documents.length ? 0 : -1, board = null;
  const boardStates = new Map(), editors = new Map(), boardSelect = $('#board-select'), boardName = $('#board-name'), docSelect = $('#task-document-select'), docName = $('#task-document-name');
  const modeToggle = $('#task-document-mode');
  const isPreview = bindSavedMarkdownMode('work', modeToggle, $('#task-editor'), signal);
  function setOptions(select, items, index) {
    select.replaceChildren();
    items.forEach((entry,i) => { const option=document.createElement('option');option.value=String(i);option.textContent=entry.name || '(이름 없음)';select.append(option); });
    select.value = index < 0 ? '' : String(index); select.disabled = index < 0;
  }
  function captureBoard() {
    if (!board || boardIndex < 0 || !boards[boardIndex]) return;
    const state = board.exportState(); boards[boardIndex].notes = state.notes; boardStates.set(boards[boardIndex].id,state);
  }
  function showBoard(index) {
    captureBoard(); if (board) board.destroy(); board = null;
    onCount('notes', boards.length);
    boardIndex = index; setOptions(boardSelect,boards,index); boardName.disabled = index < 0; $('#board-delete').disabled = index < 0; $('#note-workspace').hidden = index < 0;
    if (index < 0) { boardName.value=''; return; }
    const entry=boards[index]; boardName.value=entry.name; board=openNoteBoard('work',item.id,entry,boardStates.get(entry.id));
  }
  function openEditor(entry) {
    if (editors.has(entry.id)) return editors.get(entry.id);
    const container=document.createElement('div');container.className='task-document-editor';container.dataset.documentId=entry.id;$('#task-editor').append(container);
    const editor=createMarkdownEditor(container,entry.content,isPreview()); const value={editor,container};editors.set(entry.id,value);return value;
  }
  function documentDraft(entry) {
    return {...entry, content:editors.get(entry.id)?.editor.value ?? entry.content};
  }
  function documentChanges() {
    const changes = [];
    const current = new Set(documents.map(entry => entry.id));
    for (const [id, {entry}] of saved) {
      if (!current.has(id)) changes.push({id, expected:entry, document:null});
    }
    for (const entry of documents) {
      const document = documentDraft(entry), previous = saved.get(entry.id);
      if (JSON.stringify(document) !== JSON.stringify(previous?.draft)) {
        changes.push({id:entry.id, expected:previous?.entry ?? null, document});
      }
    }
    return changes;
  }
  function removeEditor(id) {
    editors.get(id)?.container.remove();
    editors.delete(id);
  }
  function refreshDocuments(updated) {
    const selected = documents[documentIndex]?.id;
    const latest = new Map(domain.workDocuments(updated).map(entry => [entry.id, entry]));
    const current = new Map(documents.map(entry => [entry.id, entry]));
    for (const id of saved.keys()) {
      if (latest.has(id)) continue;
      current.delete(id); removeEditor(id); saved.delete(id);
    }
    for (const [id, entry] of latest) {
      if (JSON.stringify(saved.get(id)?.entry) === JSON.stringify(entry)) continue;
      const draft = toDraft(entry);
      saved.set(id, {entry, draft});
      current.set(id, {...draft});
      removeEditor(id);
    }
    documents = [...current.values()];
    const index = documents.findIndex(entry => entry.id === selected);
    showDocument(index >= 0 ? index : (documents.length ? 0 : -1));
  }
  function showDocument(index) {
    onCount('document', documents.length);
    documentIndex=index;setOptions(docSelect,documents,index);docName.disabled=index<0;$('#task-document-delete').disabled=index<0;$('#editor-workspace').hidden=index<0;
    modeToggle.disabled = index < 0;
    for (const [id, value] of editors) value.container.hidden = id !== documents[index]?.id;
    if(index<0){docName.value='';return;}
    const entry=documents[index];docName.value=entry.name;openEditor(entry).container.hidden=false;
  }
  boardSelect.addEventListener('change',async()=>{const next=Number(boardSelect.value);if(board)await board.waitPending();showBoard(next);},{signal});
  docSelect.addEventListener('change',()=>showDocument(Number(docSelect.value)),{signal});
  boardName.addEventListener('input',()=>{if(boardIndex<0)return;boards[boardIndex].name=boardName.value;boardSelect.options[boardIndex].textContent=boardName.value || '(이름 없음)';},{signal});
  docName.addEventListener('input',()=>{if(documentIndex<0)return;documents[documentIndex].name=docName.value;docSelect.options[documentIndex].textContent=docName.value || '(이름 없음)';},{signal});
  $('#board-add').addEventListener('click',async()=>{if(board)await board.waitPending();captureBoard();boards.push({id:newId(),name:`노트 보드 ${boards.length+1}`,notes:[]});showBoard(boards.length-1);boardName.focus();boardName.select();},{signal});
  $('#task-document-add').addEventListener('click',()=>{documents.push({id:newId(),name:`작업 문서 ${documents.length+1}`,schemaVersion:2,content:''});showDocument(documents.length-1);docName.focus();docName.select();},{signal});
  $('#board-delete').addEventListener('click',async()=>{
    if(boardIndex<0)return; const selected=boards[boardIndex];
    if(!await ask({title:'노트 보드 삭제',description:`“${selected.name || '이름 없는 보드'}”와 포함된 메모를 삭제하시겠습니까? 상세를 저장하면 반영됩니다.`,confirm:true}))return;
    if(board)board.destroy();board=null;boardStates.delete(selected.id);boards.splice(boardIndex,1);boardIndex=-1;showBoard(boards.length ? 0 : -1);
  },{signal});
  $('#task-document-delete').addEventListener('click',async()=>{
    if(documentIndex<0)return;const selected=documents[documentIndex];
    if(!await ask({title:'작업 문서 삭제',description:`“${selected.name || '이름 없는 문서'}”을(를) 삭제하시겠습니까? 상세를 저장하면 반영됩니다.`,confirm:true}))return;
    removeEditor(selected.id);
    documents.splice(documentIndex,1);showDocument(documents.length ? 0 : -1);
  },{signal});
  showBoard(boardIndex);showDocument(documentIndex);
  return {
    protectsDocument(id, documentTabOpen) {
      if (id === undefined) return false;
      if (documentTabOpen && documents[documentIndex]?.id === id) return true;
      const entry = documents.find(doc => doc.id === id);
      return entry ? JSON.stringify(documentDraft(entry)) !== JSON.stringify(saved.get(id)?.draft) : saved.has(id);
    },
    refreshDocuments,
    waitPending:()=>board ? board.waitPending() : Promise.resolve(),
    snapshot() {
      captureBoard();
      return {boards:boards.map(entry=>({id:entry.id,name:entry.name,notes:structuredClone(entry.notes)})),documentChanges:documentChanges()};
    },
    destroy() { if(board)board.destroy();for(const value of editors.values()){value.container.remove();}editors.clear();$('#task-editor').replaceChildren(); }
  };
}
