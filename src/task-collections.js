function createTaskCollections(item, signal) {
  const newId = () => crypto.randomUUID();
  let boards = item.boards ? structuredClone(item.boards) : [{id:`default:${item.id}`,name:'노트 보드 1',notes:structuredClone(item.notes || [])}];
  const entries = item.taskDocuments || [{id:newId(), name:'작업 문서 1', ...(item.document || {schemaVersion:2, content:''})}];
  const documents = entries.map(entry => ({
    id: entry.id,
    name: entry.name,
    schemaVersion: 2,
    content: toDocumentMarkdown(entry.content, entry.schemaVersion)
  }));
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
    boardIndex = index; setOptions(boardSelect,boards,index); boardName.disabled = index < 0; $('#board-delete').disabled = index < 0; $('#note-workspace').hidden = index < 0;
    if (index < 0) { boardName.value=''; return; }
    const entry=boards[index]; boardName.value=entry.name; board=openNoteBoard('work',item.id,entry,boardStates.get(entry.id));
  }
  function openEditor(entry) {
    if (editors.has(entry.id)) return editors.get(entry.id);
    const container=document.createElement('div');container.className='task-document-editor';container.dataset.documentId=entry.id;$('#task-editor').append(container);
    const editor=createMarkdownEditor(container,entry.content,isPreview()); const value={editor,container};editors.set(entry.id,value);return value;
  }
  function showDocument(index) {
    documentIndex=index;setOptions(docSelect,documents,index);docName.disabled=index<0;$('#task-document-delete').disabled=index<0;$('#editor-workspace').hidden=index<0;
    modeToggle.disabled = index < 0;
    for (const value of editors.values()) value.container.hidden=true;
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
    const value=editors.get(selected.id);if(value){value.container.remove();editors.delete(selected.id);}
    documents.splice(documentIndex,1);showDocument(documents.length ? 0 : -1);
  },{signal});
  showBoard(boardIndex);showDocument(documentIndex);
  return {
    waitPending:()=>board ? board.waitPending() : Promise.resolve(),
    snapshot() {
      captureBoard();
      return {boards:boards.map(entry=>({id:entry.id,name:entry.name,notes:structuredClone(entry.notes)})),taskDocuments:documents.map(entry=>({id:entry.id,name:entry.name,schemaVersion:entry.schemaVersion,content:editors.has(entry.id)?editors.get(entry.id).editor.value:entry.content}))};
    },
    destroy() { if(board)board.destroy();for(const value of editors.values()){value.container.remove();}editors.clear();$('#task-editor').replaceChildren(); }
  };
}
