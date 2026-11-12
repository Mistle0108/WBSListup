const { app, BrowserWindow } = require('electron');
const path = require('node:path'), { Storage } = require('../src/storage');
const dir=process.env.WBS_TEST_DIR; app.setPath('userData',dir);app.setPath('appData', dir);
if(process.env.WBS_PHASE==='write') { const db=new Storage(path.join(dir,'data','wbs-list-up.sqlite')); db.saveContent({workspace:null,folders:[],projects:[{id:'p',name:'프로젝트',parentId:null}],workItems:[{id:'g',name:'그룹',type:'group',projectId:'p',parentId:null},{id:'t',name:'작업',type:'task',projectId:'p',parentId:'g',startDate:'2024-02-28',endDate:'2024-03-01',isScheduleLocked:false}],documents:[]}); db.saveViewState({selectedProject:'p',expandedFolders:[],projects:{p:{collapsed:[],selected:null}}}); db.close(); }
require('../src/main');
const delay=ms=>new Promise(r=>setTimeout(r,ms));
app.whenReady().then(()=>{const win=BrowserWindow.getAllWindows()[0]; win.webContents.on('did-finish-load',async()=>{
try {
 const run=code=>win.webContents.executeJavaScript(code), assert=(v,m)=>{if(!v) throw Error(m)};
 const item=()=>run(`window.storage.loadContent().then(d=>d.workItems.find(x=>x.id==='t'))`);
 const click=async selector=>{await run(`document.querySelector(${JSON.stringify(selector)}).click()`);await delay(120)};
 const bar=()=>run(`(()=>{const r=document.querySelector('[data-bar-id="t"]').getBoundingClientRect();return {x:Math.round((r.left+r.right)/2),y:Math.round((r.top+r.bottom)/2),ppd:view.projects.p.pixelsPerDay}})()`);
 const input=(type,x,y,extra={})=>win.webContents.sendInputEvent({type,x,y,...extra});
 const drag=async (days,cancel=false)=>{const b=await bar(); input('mouseDown',b.x,b.y,{button:'left',clickCount:1});input('mouseMove',Math.round(b.x+b.ppd*days),b.y,{button:'left'}); await delay(80); if(cancel) win.webContents.sendInputEvent({type:'keyDown',keyCode:'Escape'}); input('mouseUp',Math.round(b.x+b.ppd*days),b.y,{button:'left',clickCount:1});await delay(180)};
 await delay(300);
 if(process.env.WBS_PHASE==='write') {
   await run(`document.querySelector('[data-action="select-work"][data-id="t"]').dispatchEvent(new MouseEvent('dblclick',{bubbles:true}))`);await delay(120);
   await run(`document.querySelector('#detail-overview').value='취소할 내용'`); await click('#detail-cancel'); assert(await run(`document.querySelector('#discard-dialog').open`),'닫기 확인 없음'); await click('#discard-changes'); assert(!(await item()).overview,'초안 취소 실패');
   await run(`document.querySelector('[data-action="select-work"][data-id="t"]').dispatchEvent(new MouseEvent('dblclick',{bubbles:true}))`);await delay(120); await run(`document.querySelector('#detail-overview').value='개요';document.querySelector('#detail-summary').value='줄 하나\\n줄 둘';document.querySelector('#detail-form').requestSubmit()`);await delay(200);
   assert((await item()).overview==='개요','상세 저장 실패');
   await run(`document.querySelector('[data-bar-id="t"]').focus()`);await delay(120);const tooltipState=await run(`({hidden:document.querySelector('#tooltip').hidden,text:document.querySelector('#tooltip').textContent,active:document.activeElement.outerHTML,detail:document.querySelector('#detail-dialog').open})`);assert(!tooltipState.hidden && tooltipState.text.includes('줄 하나'),'포커스 툴팁 실패: '+JSON.stringify(tooltipState));
   const hover=await bar(); input('mouseMove',hover.x,hover.y); await delay(400); assert(await run(`!document.querySelector('#tooltip').hidden`),'호버 툴팁 실패');
   await drag(1,true); assert((await item()).startDate==='2024-02-28','드래그 취소 실패');
   await drag(1); assert((await item()).startDate==='2024-02-29','드래그 저장 실패');
   let p=await run(`document.querySelector('[data-bar-id="g"]').getAttribute('aria-label')`); assert(p.includes('2024-02-29'),'조상 기간 갱신 실패');
   await delay(600); const dbClick=await bar(); for(let n=1;n<=2;n++){input('mouseDown',dbClick.x,dbClick.y,{button:'left',clickCount:n});input('mouseUp',dbClick.x,dbClick.y,{button:'left',clickCount:n});} await delay(120); assert(await run(`document.querySelector('#detail-dialog').open`),'막대 더블클릭 실패'); await click('#detail-cancel');
   await click('[data-action="lock-work"][data-id="t"]'); assert((await item()).isScheduleLocked,'잠금 저장 실패');
   await drag(1); assert((await item()).startDate==='2024-02-29','잠긴 드래그 차단 실패');
   const rejection=await run(`window.storage.command({op:'shift',kind:'work',id:'t',days:1}).then(()=>false,()=>true)`);assert(rejection,'잠금 명령 차단 실패');
   await run(`document.querySelector('[data-action="select-work"][data-id="t"]').dispatchEvent(new MouseEvent('dblclick',{bubbles:true}))`);await delay(120); assert(await run(`document.querySelector('#detail-start').disabled`),'잠긴 날짜 비활성 실패');
   await run(`document.querySelector('#detail-overview').value='잠긴 내용 수정';document.querySelector('#detail-form').requestSubmit()`);await delay(180);assert((await item()).overview==='잠긴 내용 수정','잠긴 내용 편집 실패');
   await click('[data-action="lock-work"][data-id="t"]'); assert(!(await item()).isScheduleLocked,'잠금 해제 실패');
   const db=new Storage(path.join(dir,'data','wbs-list-up.sqlite')); db.db.exec("CREATE TRIGGER ui_fail BEFORE UPDATE ON state WHEN NEW.key='content' BEGIN SELECT RAISE(ABORT,'테스트 실패'); END");db.close();
   await drag(0.2); assert((await item()).startDate==='2024-02-29' && !await run(`document.querySelector('#status').textContent.includes('실패')`),'0일 이동 시 불필요한 저장');
   await drag(1); assert((await item()).startDate==='2024-02-29' && await run(`document.querySelector('#status').textContent.includes('실패')`),'드래그 저장 실패 복원 실패');
   await delay(550);await run(`document.querySelector('[data-action="select-work"][data-id="t"]').dispatchEvent(new MouseEvent('dblclick',{bubbles:true}))`);await delay(120);await run(`document.querySelector('#detail-overview').value='실패 초안';document.querySelector('#detail-form').requestSubmit()`);await delay(200);
   assert(await run(`document.querySelector('#detail-dialog').open && document.querySelector('#detail-overview').value==='실패 초안' && document.querySelector('#detail-error').textContent.includes('실패')`),'저장 실패 초안 보존 실패');
   await click('#detail-cancel');await click('#discard-changes');
   const db2=new Storage(path.join(dir,'data','wbs-list-up.sqlite'));db2.db.exec('DROP TRIGGER ui_fail');db2.close();
   await drag(1); assert((await item()).startDate==='2024-03-01','잠금 해제 후 이동 실패');
   await click('[data-action="lock-work"][data-id="t"]');
   console.log('상세 초안·툴팁·드래그·취소·잠금·실패 보존 통과');
 } else { const t=await item();assert(t.isScheduleLocked && t.startDate==='2024-03-01' && t.overview==='잠긴 내용 수정','재실행 복원 실패');console.log('잠금과 일정 재실행 복원 통과'); }
 app.exit(0);
} catch(e){console.error(e);app.exit(1)} });});
setTimeout(()=>{console.error('시간 초과');app.exit(1)},30000).unref();
