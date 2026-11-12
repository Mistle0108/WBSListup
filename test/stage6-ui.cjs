const {app,BrowserWindow}=require('electron');const path=require('node:path'),{Storage}=require('../src/storage');const dir=process.env.WBS_TEST_DIR;app.setPath('userData',dir);app.setPath('appData', dir);
if(process.env.WBS_PHASE==='write'){
 const db=new Storage(path.join(dir,'data','wbs-list-up.sqlite')); const blank={type:'doc',content:[{type:'paragraph'}]};
 db.saveContent({workspace:null,folders:[],projects:[{id:'p',name:'프로젝트 A'},{id:'q',name:'프로젝트 B'}],workItems:[{id:'w',name:'작업',type:'task',projectId:'p',document:{schemaVersion:1,content:blank}}],documents:[...Array.from({length:12},(_,i)=>({id:'d'+i,projectId:'p',title:'기존 '+i,sortOrder:i,schemaVersion:1,content:blank})),{id:'other',projectId:'q',title:'다른 프로젝트',sortOrder:0,schemaVersion:1,content:blank}]});
 db.saveViewState({selectedProject:'p',expandedFolders:[],projects:{p:{collapsed:[],selected:null}}});db.close();
}
require('../src/main');const delay=ms=>new Promise(r=>setTimeout(r,ms));
app.whenReady().then(()=>{const win=BrowserWindow.getAllWindows()[0];win.webContents.on('did-finish-load',async()=>{
try {
 const run=s=>win.webContents.executeJavaScript(s), check=(ok,msg)=>{if(!ok)throw Error(msg)};
 const click=async selector=>{const ok=await run(`(()=>{const b=document.querySelector(${JSON.stringify(selector)});if(!b)return false;b.click();return true})()`);check(ok,'버튼 없음: '+selector);await delay(130)};
 const all=()=>run(`window.storage.loadContent()`);
 await delay(300);await click('[data-action="detail-project"][data-id="p"]');
 if(process.env.WBS_PHASE==='write'){
  check(await run(`document.querySelector('#project-dialog').open && document.querySelectorAll('.project-editor .tiptap').length===0`),'접힌 문서 편집기 지연 생성 실패');
  check((await all()).documents.filter(x=>x.projectId==='p').every(x=>!Object.hasOwn(x,'content')),'초기 본문 지연 조회 실패');
  await run(`(()=>{const x=document.querySelector('[data-doc-id="d0"] .doc-title');x.value='접힌 문서 변경';x.dispatchEvent(new Event('input',{bubbles:true}))})()`);await click('[data-doc-id="d0"] .doc-save');
  check((await all()).documents.find(x=>x.id==='d0').title==='접힌 문서 변경' && (await run(`window.storage.loadProjectDocument('p','d0')`)).type==='doc','접힌 문서 개별 저장 실패');
  await click('#project-doc-add');
  check(await run(`document.activeElement.classList.contains('doc-title') && document.querySelector('#project-doc-scroll').scrollTop>0`),'새 문서 포커스 또는 스크롤 실패');
  const first=await run(`document.querySelector('.project-doc:last-child').dataset.docId`);
  await run(`(()=>{const input=document.querySelector('.project-doc:last-child .doc-title');input.value='신규 1';input.dispatchEvent(new Event('input',{bubbles:true}));})()`);
  check(await run(`document.querySelector('.project-doc:last-child .tiptap').textContent===''`),'새 프로젝트 문서가 비어 있지 않음');
  await click('#project-doc-add'); const second=await run(`document.querySelector('.project-doc:last-child').dataset.docId`);
  await run(`(()=>{const input=document.querySelector('.project-doc:last-child .doc-title');input.value='신규 2';input.dispatchEvent(new Event('input',{bubbles:true}));const e=document.querySelector('.project-doc:last-child .tiptap');e.focus();const r=document.createRange();r.selectNodeContents(e);r.collapse(true);const s=window.getSelection();s.removeAllRanges();s.addRange(r)})()`);await win.webContents.insertText('프로젝트 본문');await delay(80);
  check(await run(`document.querySelector('.project-doc:last-child .tiptap').textContent.includes('프로젝트 본문')`),'문서 입력 실패');
  await click('#project-detail-close');check(await run(`document.querySelector('#discard-dialog').open`),'일괄 저장 확인 없음');await click('#discard-save');
  let d=await all();check(!await run(`document.querySelector('#project-dialog').open`) && d.documents.filter(x=>x.projectId==='p').length===14,'일괄 저장 실패');
  check(JSON.stringify(await run(`window.storage.loadProjectDocument('p','${second}')`)).includes('프로젝트 본문'),'문서 본문 저장 실패');check(d.documents.find(x=>x.id==='other').title==='다른 프로젝트' && d.workItems[0].document.content.content.length===1,'다른 문서 영향');
  await click('[data-action="detail-project"][data-id="p"]');check(await run(`document.querySelectorAll('.project-editor .tiptap').length===0`),'재진입 시 접힘 편집기 생성');
  const fixed=await run(`(()=>{const s=document.querySelector('#project-doc-scroll'),h=document.querySelector('.project-detail-header').getBoundingClientRect();s.scrollTop=0;return {top:h.top,scrollHeight:s.scrollHeight,clientHeight:s.clientHeight,bg:document.querySelector('.schedule-board').scrollTop}})()`);
  check(fixed.scrollHeight>fixed.clientHeight,'문서 내부 스크롤 영역 부족');
  const pt=await run(`(()=>{const r=document.querySelector('#project-doc-scroll').getBoundingClientRect();return {x:Math.round(r.left+30),y:Math.round(r.top+40)}})()`);
  win.webContents.sendInputEvent({type:'mouseWheel',x:pt.x,y:pt.y,deltaY:-500,deltaX:0});await delay(180);
  const sc=await run(`({scroll:document.querySelector('#project-doc-scroll').scrollTop,header:document.querySelector('.project-detail-header').getBoundingClientRect().top,bg:document.querySelector('.schedule-board').scrollTop})`);
  check(sc.scroll>0 && Math.abs(sc.header-fixed.top)<1 && sc.bg===fixed.bg,'스크롤·상단 고정·배경 차단 실패');
  await click(`[data-doc-id="${second}"] .doc-up`);d=await all();check(d.documents.find(x=>x.id===second).sortOrder<d.documents.find(x=>x.id===first).sortOrder,'문서 순서 저장 실패');
  await click(`[data-doc-id="${first}"] .doc-delete`);check(await run(`document.querySelector('#dialog').open`),'삭제 확인 누락');await click('#dialog-cancel');check((await all()).documents.some(x=>x.id===first),'삭제 취소 실패');
  await click('#project-doc-add'); const temp=await run(`document.querySelector('.project-doc:last-child').dataset.docId`);
  await run(`(()=>{const x=document.querySelector('[data-doc-id="${temp}"] .doc-title');x.value='임시';x.dispatchEvent(new Event('input',{bubbles:true}))})()`);await click(`[data-doc-id="${temp}"] .doc-save`);
  check((await all()).documents.some(x=>x.id===temp),'문서별 저장 실패');await click(`[data-doc-id="${temp}"] .doc-delete`);await click('#dialog-submit');check(!(await all()).documents.some(x=>x.id===temp),'확인 후 문서 삭제 실패');
  await click(`[data-doc-id="${first}"] .doc-toggle`);await run(`(()=>{const el=document.querySelector('[data-doc-id="${first}"] .doc-title');el.value='일괄 변경 1';el.dispatchEvent(new Event('input',{bubbles:true}))})()`);
  await click(`[data-doc-id="${second}"] .doc-toggle`);await run(`(()=>{const el=document.querySelector('[data-doc-id="${second}"] .doc-title');el.value='일괄 변경 2';el.dispatchEvent(new Event('input',{bubbles:true}))})()`);
  const db=new Storage(path.join(dir,'data','wbs-list-up.sqlite'));db.db.exec("CREATE TRIGGER fail_docs BEFORE UPDATE ON state WHEN NEW.key='content' BEGIN SELECT RAISE(ABORT,'일괄 실패'); END");db.close();
  await click('#project-detail-close');await click('#discard-save');d=await all();check(d.documents.find(x=>x.id===first).title==='신규 1' && d.documents.find(x=>x.id===second).title==='신규 2','실패 시 부분 저장');
  check(await run(`document.querySelector('#project-dialog').open && document.querySelector('#project-doc-error').textContent.includes('실패') && document.querySelector('[data-doc-id="${first}"] .doc-title').value==='일괄 변경 1'`),'일괄 실패 초안 미보존');
  const db2=new Storage(path.join(dir,'data','wbs-list-up.sqlite'));db2.db.exec('DROP TRIGGER fail_docs');db2.close();await click('#project-detail-close');await click('#discard-save');d=await all();check(d.documents.find(x=>x.id===first).title==='일괄 변경 1' && d.documents.find(x=>x.id===second).title==='일괄 변경 2','일괄 재시도 실패');
  console.log('다중 문서·스크롤·추가 포커스·순서·취소·일괄 실패 및 재시도 통과');
 }else{
  const d=await all();check(d.documents.filter(x=>x.projectId==='p').length===14 && d.documents.some(x=>x.title==='일괄 변경 1') && d.documents.some(x=>x.title==='일괄 변경 2'),'문서 재실행 복원 실패');console.log('프로젝트 문서 재실행 복원 통과');
 }
 app.exit(0);
}catch(e){console.error(e);app.exit(1)}
});});setTimeout(()=>{console.error('시간 초과');app.exit(1)},30000).unref();
