const {app,BrowserWindow}=require('electron'),path=require('node:path'),{Storage}=require('../src/storage');const dir=process.env.WBS_TEST_DIR;app.setPath('userData',dir);app.setPath('appData', dir);
if(process.env.WBS_PHASE==='write'){const db=new Storage(path.join(dir,'data','wbs-list-up.sqlite'));const note={id:'old-note',text:'기존 메모',x:20,y:30,width:220,height:160,z:1};const doc={type:'doc',content:[{type:'paragraph',content:[{type:'text',text:'기존 문서'}]}]};db.saveContent({workspace:null,folders:[],projects:[{id:'p',name:'프로젝트'}],workItems:[{id:'g',name:'그룹',type:'group',projectId:'p',parentId:null},{id:'t',name:'작업',type:'task',projectId:'p',parentId:'g',notes:[note],document:{schemaVersion:1,content:doc}}],documents:[]});db.saveViewState({selectedProject:'p',expandedFolders:[],projects:{p:{collapsed:[],selected:null}}});db.close();}
require('../src/main');const delay=ms=>new Promise(r=>setTimeout(r,ms));app.whenReady().then(()=>{const win=BrowserWindow.getAllWindows()[0];win.setSize(1500,900);win.webContents.on('did-finish-load',async()=>{try{
 const run=s=>win.webContents.executeJavaScript(s),check=(v,m)=>{if(!v)throw Error(m)},data=()=>run(`window.storage.loadContent()`);
 const click=async sel=>{check(await run(`(()=>{const b=document.querySelector(${JSON.stringify(sel)});if(!b)return false;b.click();return true})()`),'버튼 없음 '+sel);await delay(150)};
 const open=async id=>{await run(`document.querySelector('[data-action="select-work"][data-id="${id}"]').dispatchEvent(new MouseEvent('dblclick',{bubbles:true}))`);await delay(180);check(await run(`document.querySelector('#detail-dialog').open`),'상세 열기 실패')};
 const set=async (sel,value)=>run(`(()=>{const x=document.querySelector(${JSON.stringify(sel)});x.value=${JSON.stringify(value)};x.dispatchEvent(new Event('input',{bubbles:true}))})()`);
 const select=async (sel,index)=>{await run(`(()=>{const x=document.querySelector(${JSON.stringify(sel)});x.value='${index}';x.dispatchEvent(new Event('change',{bubbles:true}))})()`);await delay(100)};
 await delay(300);
 if(process.env.WBS_PHASE==='write'){ await open('t');
  check(await run(`!document.querySelector('[data-action="delete-work"]') && getComputedStyle(document.querySelector('#detail-delete')).backgroundColor==='rgb(180, 35, 24)'`),'목록 삭제 제거 또는 빨간 상세 삭제 버튼 실패');
  check(await run(`document.querySelector('.note-title').value==='메모' && document.querySelector('.board-note textarea').value==='기존 메모'`),'기존 메모 불러오기 실패');
  await set('.note-title','기존 이름');await click('#board-add');await set('#board-name','두 번째 보드');await click('#note-add');await set('.note-title','새 메모 제목');await set('.board-note textarea','새 메모 내용');
  await select('#board-select',0);check(await run(`document.querySelector('.note-title').value==='기존 이름' && document.querySelector('.board-note textarea').value==='기존 메모'`),'보드 전환 시 기존 초안 손실');
  await select('#board-select',1);check(await run(`document.querySelector('.note-title').value==='새 메모 제목' && document.querySelector('.board-note textarea').value==='새 메모 내용'`),'두 번째 보드 초안 손실');
  await click('#tab-document');check((await run(`document.querySelector('.task-document-editor:not([hidden]) .tiptap').textContent`)).includes('기존 문서'),'기존 문서 손실');
  await click('#task-document-add');await set('#task-document-name','두 번째 문서');await run(`(()=>{const e=document.querySelector('.task-document-editor:not([hidden]) .tiptap');e.focus();const r=document.createRange();r.selectNodeContents(e);const s=window.getSelection();s.removeAllRanges();s.addRange(r)})()`);await win.webContents.insertText('두 번째 내용');await delay(100);
  await select('#task-document-select',0);check((await run(`document.querySelector('.task-document-editor:not([hidden]) .tiptap').textContent`)).includes('기존 문서'),'문서 전환 시 첫 내용 손실');
  await select('#task-document-select',1);check((await run(`document.querySelector('.task-document-editor:not([hidden]) .tiptap').textContent`)).includes('두 번째 내용'),'문서 전환 시 두 번째 내용 손실');
  const db=new Storage(path.join(dir,'data','wbs-list-up.sqlite'));db.db.exec("CREATE TRIGGER reject_multi BEFORE UPDATE ON state WHEN NEW.key='content' BEGIN SELECT RAISE(ABORT,'저장 실패'); END");db.close();
  await run(`document.querySelector('#detail-form').requestSubmit()`);await delay(180);check(await run(`document.querySelector('#detail-dialog').open && document.querySelector('#detail-error').textContent.includes('실패')`),'저장 실패 창 유지 실패');
  let d=await data(), t=d.workItems.find(x=>x.id==='t');check(t.notes[0].text==='기존 메모' && t.document.content.content[0].content[0].text==='기존 문서','실패 시 기존 내용 변경');
  check((await run(`document.querySelector('.task-document-editor:not([hidden]) .tiptap').textContent`)).includes('두 번째 내용'),'문서 초안 손실');
  const db2=new Storage(path.join(dir,'data','wbs-list-up.sqlite'));db2.db.exec('DROP TRIGGER reject_multi');db2.close();await run(`document.querySelector('#detail-form').requestSubmit()`);await delay(250);
  d=await data();t=d.workItems.find(x=>x.id==='t');check(t.boards.length===2 && t.taskDocuments.length===2 && t.boards[1].notes[0].title==='새 메모 제목' && JSON.stringify(t.taskDocuments[1].content).includes('두 번째 내용'),'여러 항목 저장 실패');
  await open('t');await select('#board-select',1);check(await run(`document.querySelector('.note-title').value==='새 메모 제목'`),'메모 이름 복원 실패');
  await click('#board-delete');await click('#dialog-cancel');check(await run(`document.querySelector('#board-select').options.length===2`),'보드 삭제 취소 실패');
  await click('#board-delete');await click('#dialog-submit');check(await run(`document.querySelector('#board-select').options.length===1`),'보드 삭제 초안 실패');await click('#tab-document');await select('#task-document-select',1);await click('#task-document-delete');await click('#dialog-submit');check(await run(`document.querySelector('#task-document-select').options.length===1`),'문서 삭제 초안 실패');
  await click('#detail-cancel');await click('#discard-changes');let retained=(await data()).workItems.find(x=>x.id==='t');check(retained.boards.length===2 && retained.taskDocuments.length===2,'닫기 취소로 기존 항목 변경');
  await open('t');await select('#board-select',1);await click('#board-delete');await click('#dialog-submit');await click('#tab-document');await select('#task-document-select',1);await click('#task-document-delete');await click('#dialog-submit');await run(`document.querySelector('#detail-form').requestSubmit()`);await delay(250);
  retained=(await data()).workItems.find(x=>x.id==='t');check(retained.boards.length===1 && retained.taskDocuments.length===1,'항목 삭제 저장 실패');
  await open('g');await click('#detail-delete');check(await run(`document.querySelector('#dialog').open && document.querySelector('#dialog-description').textContent.includes('1개')`),'그룹 삭제 확인/하위 개수 실패');await click('#dialog-cancel');check(await run(`document.querySelector('#detail-dialog').open`),'작업 삭제 취소 후 상세 유지 실패');
  await click('#detail-delete');await click('#dialog-submit');await delay(200);d=await data();check(!d.workItems.some(x=>x.id==='g'||x.id==='t') && !await run(`document.querySelector('#detail-dialog').open`),'그룹 삭제 및 하위 정리 실패');
  console.log('기존 데이터 전환·복수 보드/문서·메모 이름·실패 보존·상세 삭제 통과');
 }else{check(!(await data()).workItems.length,'삭제 후 재실행 복원 실패');console.log('삭제 후 재실행 복원 통과');}
 app.exit(0);
}catch(e){console.error(e);app.exit(1)}})});setTimeout(()=>{console.error('시간 초과');app.exit(1)},30000).unref();
