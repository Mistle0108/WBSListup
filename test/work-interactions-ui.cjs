const {app,BrowserWindow}=require('electron'), path=require('node:path'), {Storage}=require('../src/storage');const dir=process.env.WBS_TEST_DIR;app.setPath('userData',dir);app.setPath('appData', dir);
if(process.env.WBS_PHASE==='write'){const db=new Storage(path.join(dir,'data','wbs-list-up.sqlite'));db.saveContent({workspace:null,folders:[],projects:[{id:'p',name:'프로젝트'}],workItems:[{id:'g',name:'상위 그룹',type:'group',projectId:'p',parentId:null},{id:'s',name:'하위 그룹',type:'group',projectId:'p',parentId:null},{id:'t',name:'멀리 있는 작업',hoverSummary:'작업 요약',type:'task',projectId:'p',parentId:'s',startDate:'2035-03-01',endDate:'2035-03-02'},{id:'u',name:'개별 잠금',type:'task',projectId:'p',parentId:null,isScheduleLocked:true}],documents:[]});db.saveViewState({selectedProject:'p',expandedFolders:[],projects:{p:{collapsed:[],selected:null,centerDay:19723,pixelsPerDay:3}}});db.close();}
require('../src/main');const delay=ms=>new Promise(r=>setTimeout(r,ms));app.whenReady().then(()=>{const win=BrowserWindow.getAllWindows()[0];win.setSize(1500,900);win.webContents.on('did-finish-load',async()=>{try{
const run=s=>win.webContents.executeJavaScript(s), check=(v,m)=>{if(!v)throw Error(m)}, content=()=>run(`window.storage.loadContent()`);
const click=async sel=>{check(await run(`(()=>{const b=document.querySelector(${JSON.stringify(sel)});if(!b)return false;b.click();return true})()`),'버튼 없음 '+sel);await delay(180)};
const rect=sel=>run(`(()=>{const r=document.querySelector(${JSON.stringify(sel)}).getBoundingClientRect();return {x:Math.round(r.left+r.width/2),y:Math.round(r.top+r.height/2),top:r.top,bottom:r.bottom}})()`);
const drag=async (source,target,ratio=.5)=>{const a=await rect(`[data-action="select-work"][data-id="${source}"]`), b=await rect(`[data-row-id="${target}"] .work-name`);const y=Math.round(b.top+(b.bottom-b.top)*ratio);win.webContents.sendInputEvent({type:'mouseDown',x:a.x,y:a.y,button:'left',clickCount:1});win.webContents.sendInputEvent({type:'mouseMove',x:a.x+10,y:a.y+10,button:'left'});await delay(30);win.webContents.sendInputEvent({type:'mouseMove',x:b.x,y,button:'left'});await delay(30);win.webContents.sendInputEvent({type:'mouseUp',x:b.x,y,button:'left',clickCount:1});await delay(250);for(let i=0;i<50 && await run('busy');i++) await delay(50)};
const double=async id=>{const a=await rect(`[data-action="select-work"][data-id="${id}"]`);for(let n=1;n<=2;n++){win.webContents.sendInputEvent({type:'mouseDown',x:a.x,y:a.y,button:'left',clickCount:n});win.webContents.sendInputEvent({type:'mouseUp',x:a.x,y:a.y,button:'left',clickCount:n});await delay(50)}await delay(150);check(await run(`document.querySelector('#detail-dialog').open`),'더블클릭 상세 실패 '+id);await click('#detail-cancel')};
await delay(350);
if(process.env.WBS_PHASE==='write'){
 check(await run(`!document.querySelector('[data-action="move-work"], [data-action="rename-work"], [data-action="up-work"], [data-action="down-work"], .work-name .period')`),'목록 버튼 또는 기간 미제거');
 check(await run(`document.querySelector('[data-action="extend-work"][data-id="u"]').disabled && !document.querySelector('[data-action="extend-work"][data-id="g"]')`),'연장 버튼 상태 오류');
 await click('[data-action="select-work"][data-id="t"]');
 const beforeWidth=await run(`document.querySelector('[data-bar-id="t"]').getBoundingClientRect().width`);
 await click('[data-action="extend-work"][data-id="t"]');let extended=await content();check(extended.workItems.find(x=>x.id==='t').startDate==='2035-03-01' && extended.workItems.find(x=>x.id==='t').endDate==='2035-03-03','종료일 연장 실패');
 check(await run(`document.querySelector('[data-bar-id="t"]').getBoundingClientRect().width`)>beforeWidth,'일정 막대 연장 실패');
 await click('[data-action="undo-schedule"]');extended=await content();check(extended.workItems.find(x=>x.id==='t').endDate==='2035-03-02','연장 되돌리기 실패');
 await click('[data-action="redo-schedule"]');extended=await content();check(extended.workItems.find(x=>x.id==='t').endDate==='2035-03-03','연장 다시 실행 실패');
 const bar=await rect('[data-bar-id="t"]');const ppd=await run(`view.projects.p.pixelsPerDay`);
 win.webContents.sendInputEvent({type:'mouseDown',x:bar.x,y:bar.y,button:'left',clickCount:1});win.webContents.sendInputEvent({type:'mouseMove',x:Math.round(bar.x+ppd*2),y:bar.y,button:'left'});win.webContents.sendInputEvent({type:'mouseUp',x:Math.round(bar.x+ppd*2),y:bar.y,button:'left',clickCount:1});await delay(300);
 extended=await content();check(extended.workItems.find(x=>x.id==='t').startDate==='2035-03-03','막대 이동 실패');
 await click('[data-action="undo-schedule"]');extended=await content();check(extended.workItems.find(x=>x.id==='t').startDate==='2035-03-01','막대 이동 되돌리기 실패');
 await click('[data-action="redo-schedule"]');extended=await content();check(extended.workItems.find(x=>x.id==='t').startDate==='2035-03-03','막대 이동 다시 실행 실패');
 await click('[data-action="undo-schedule"]');await click('[data-action="undo-schedule"]');await click('[data-action="extend-work"][data-id="t"]');check(await run(`document.querySelector('[data-action="redo-schedule"]').disabled`),'새 변경 후 다시 실행 이력 미삭제');
 await run(`document.dispatchEvent(new KeyboardEvent('keydown',{key:'z',ctrlKey:true,bubbles:true}))`);await delay(180);extended=await content();check(extended.workItems.find(x=>x.id==='t').endDate==='2035-03-02','단축키 되돌리기 실패');
 await run(`document.dispatchEvent(new KeyboardEvent('keydown',{key:'Z',ctrlKey:true,shiftKey:true,bubbles:true}))`);await delay(180);extended=await content();check(extended.workItems.find(x=>x.id==='t').endDate==='2035-03-03','단축키 다시 실행 실패');

 await click('[data-action="select-work"][data-id="t"]');const center=await run(`view.projects.p.centerDay`);check(Math.abs(center-(Date.parse('2035-03-01T00:00:00Z')/86400000+.5))<.01,'작업 시작일 이동 실패: '+center);
 await run(`document.querySelector('[data-action="select-work"][data-id="t"]').focus()`);await delay(100);check(await run(`!document.querySelector('#tooltip').hidden && document.querySelector('#tooltip').textContent.includes('작업 요약')`),'작업 목록 툴팁 실패');
 await run(`window.__events=[];document.querySelector('.schedule-board').addEventListener('dblclick',e=>window.__events.push({type:'dblclick',target:e.target.outerHTML,busy}));document.querySelector('.schedule-board').addEventListener('click',e=>window.__events.push({type:'click',busy}))`);
 try { await double('t'); } catch(e) { throw Error(e.message+' '+JSON.stringify(await run(`window.__events`))); } await double('g');
 await drag('s','g');let d=await content();check(d.workItems.find(x=>x.id==='s').parentId==='g' && d.workItems.find(x=>x.id==='t').parentId==='s','그룹 중첩 드래그 실패');
 await drag('u','g');d=await content();check(d.workItems.find(x=>x.id==='u').parentId==='g','작업 그룹 안 드래그 실패');
 await drag('u','s',.1);d=await content();check(d.workItems.filter(x=>x.parentId==='g').map(x=>x.id).join(',')==='u,s','앞 순서 이동 실패: '+JSON.stringify(d.workItems));
 await click('[data-action="lock-work"][data-id="g"]');d=await content();check(d.workItems.find(x=>x.id==='g').isScheduleLocked,'그룹 잠금 실패');
 check(await run(`document.querySelector('[data-action="lock-work"][data-id="t"]').disabled && document.querySelector('[data-action="extend-work"][data-id="t"]').disabled`),'하위 잠금 표시 실패');
 const blocked=await run(`window.storage.command({op:'shift',kind:'work',id:'t',days:1}).then(()=>false,()=>true)`);check(blocked,'상속 잠금 저장 명령 차단 실패');
 await double('t');await run(`document.querySelector('[data-action="select-work"][data-id="t"]').dispatchEvent(new MouseEvent('dblclick',{bubbles:true}))`);await delay(120);check(await run(`document.querySelector('#detail-start').disabled && document.querySelector('#detail-lock').disabled`),'상속 잠금 상세 차단 실패');await click('#detail-cancel');
 await click('[data-action="lock-work"][data-id="g"]');d=await content();check(!d.workItems.find(x=>x.id==='g').isScheduleLocked && d.workItems.find(x=>x.id==='u').isScheduleLocked,'그룹 해제 시 개별 잠금 손실');
 console.log('시작일 이동·목록 호버·더블클릭·계층 드래그·잠금 상속 통과');
}else{const d=await content();check(d.workItems.find(x=>x.id==='s').parentId==='g' && d.workItems.find(x=>x.id==='u').isScheduleLocked,'재실행 복원 실패');console.log('계층·개별 잠금 재실행 복원 통과')}
app.exit(0);
}catch(e){console.error(e);app.exit(1)}})});setTimeout(()=>{console.error('시간 초과');app.exit(1)},30000).unref();
