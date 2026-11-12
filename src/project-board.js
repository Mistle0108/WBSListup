function createProjectBoards(project, signal, onSave) {
  const root = document.querySelector('#project-board-panel'), select = root.querySelector('#project-board-select'), input = root.querySelector('#project-board-name');
  let boards = project.boards ? structuredClone(project.boards) : [{id:crypto.randomUUID(),name:'프로젝트 보드 1',notes:[]}];
  let index = boards.length ? 0 : -1, board = null;
  const states = new Map();
  function capture() { if (!board || index < 0 || !boards[index]) return; const state=board.exportState(); boards[index].notes=state.notes; states.set(boards[index].id,state); }
  function snapshot() { capture(); return boards.map(entry => ({id:entry.id,name:entry.name,notes:structuredClone(entry.notes)})); }
  let baseline;
  function show(next) {
    capture(); if(board)board.destroy();board=null;index=next;select.replaceChildren();
    boards.forEach((entry,i)=>{const option=document.createElement('option');option.value=String(i);option.textContent=entry.name || '(이름 없음)';select.append(option);});
    select.value=index<0?'':String(index);select.disabled=index<0;input.disabled=index<0;root.querySelector('#project-board-delete').disabled=index<0;root.querySelector('#project-board-workspace').hidden=index<0;
    if(index<0){input.value='';return;}
    const entry=boards[index];input.value=entry.name;board=createNoteBoard(entry.notes,states.get(entry.id),root);
  }
  select.addEventListener('change',async()=>{const next=Number(select.value);if(board)await board.waitPending();show(next);},{signal});
  input.addEventListener('input',()=>{if(index<0)return;boards[index].name=input.value;select.options[index].textContent=input.value || '(이름 없음)';},{signal});
  root.querySelector('#project-board-add').addEventListener('click',async()=>{if(board)await board.waitPending();capture();boards.push({id:crypto.randomUUID(),name:`프로젝트 보드 ${boards.length+1}`,notes:[]});show(boards.length-1);input.focus();input.select();},{signal});
  root.querySelector('#project-board-delete').addEventListener('click',async()=>{
    if(index<0)return;const entry=boards[index];
    if(!await ask({title:'프로젝트 보드 삭제',description:`“${entry.name || '이름 없는 보드'}”와 포함된 내용을 삭제하시겠습니까? 보드를 저장하면 반영됩니다.`,confirm:true}))return;
    if(board)board.destroy();board=null;states.delete(entry.id);boards.splice(index,1);index=-1;show(boards.length?0:-1);
  },{signal});
  root.querySelector('#project-board-save').addEventListener('click',()=>onSave(),{signal});
  show(index);baseline=JSON.stringify(snapshot());
  return {snapshot,waitPending:()=>board ? board.waitPending() : Promise.resolve(),dirty:()=>JSON.stringify(snapshot())!==baseline,committed:()=>{baseline=JSON.stringify(snapshot());},destroy:()=>{if(board)board.destroy();}};
}
