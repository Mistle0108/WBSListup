const {app,BrowserWindow}=require('electron');const path=require('node:path'),{Storage}=require('../src/storage');const dir=process.env.WBS_TEST_DIR;app.setPath('userData',dir);app.setPath('appData', dir);
if(process.env.WBS_PHASE==='write'){const db=new Storage(path.join(dir,'data','wbs-list-up.sqlite'));db.saveContent({workspace:null,folders:[],projects:[{id:'p',name:'테스트'}],workItems:[{id:'t',name:'작업',type:'task',projectId:'p'}],documents:[]});db.saveViewState({selectedProject:'p',expandedFolders:[],projects:{p:{collapsed:[],selected:null,centerDay:20088.5,pixelsPerDay:50}}});db.close();}
require('../src/main');const delay=ms=>new Promise(r=>setTimeout(r,ms));
app.whenReady().then(()=>{const win=BrowserWindow.getAllWindows()[0];win.setSize(1700,900);win.webContents.on('did-finish-load',async()=>{try{
 const run=s=>win.webContents.executeJavaScript(s),check=(ok,msg)=>{if(!ok)throw Error(msg)},click=async s=>{await run(`document.querySelector(${JSON.stringify(s)}).click()`);await delay(120)};
 await delay(350);
 if(process.env.WBS_PHASE==='write'){
  const header=await run(`({years:[...document.querySelectorAll('.year-label')].map(e=>e.textContent),dates:[...document.querySelectorAll('.tick-label')].map(e=>e.textContent),day:document.querySelector('.time-ruler').classList.contains('day-view')})`);
  check(header.day && header.years.includes('2024년') && header.years.includes('2025년') && header.dates.includes('12/31') && header.dates.includes('1/1'),'일 단위 연도·날짜 구분 실패: '+JSON.stringify(header));
  const levels=await run(`(()=>{const p=view.projects.p;const values=[.1,1,4,7,50];return values.map(ppd=>{p.pixelsPerDay=ppd;redrawTimeline();const r=document.querySelector('.time-ruler');return {ppd,band:r.classList.contains('has-year-band'),years:[...r.querySelectorAll('.year-label')].map(e=>e.textContent),ticks:[...r.querySelectorAll('.tick-label')].map(e=>e.textContent)}})})()`);
  check(!levels[0].band && levels.slice(1).every(x=>x.band && x.years.includes('2024년') && x.years.includes('2025년')),'분기·월·주·일 연도 표시 실패: '+JSON.stringify(levels));
  check(levels[1].ticks.some(x=>x.includes('분기')) && levels[2].ticks.some(x=>x.includes('월')),'분기·월 눈금 실패');
  const daily=await run(`(()=>{const p=view.projects.p,r=document.querySelector('.time-ruler');p.pixelsPerDay=r.clientWidth/90*1.12;redrawTimeline();const labels=[...r.querySelectorAll('.tick-label')].map(e=>e.getBoundingClientRect());return {daily:r.classList.contains('day-view'),lines:document.querySelectorAll('.timeline-cell .tick-line').length,labels:labels.length,maxWidth:Math.max(...labels.map(x=>x.width)),minGap:Math.min(...labels.slice(1).map((x,i)=>x.left-labels[i].left)),overlap:labels.some((x,i)=>i>0 && labels[i-1].right>x.left)}})()`);
  check(daily.daily && daily.lines>=80 && daily.labels>0 && !daily.overlap,'2~3개월 일별 눈금 또는 날짜 겹침 실패: '+JSON.stringify(daily));
  await run(`view.projects.p.pixelsPerDay=50;redrawTimeline()`);
  const before=await run(`(()=>{const d=document.querySelector('.column-divider').getBoundingClientRect();return {x:Math.round(d.left+d.width/2),y:Math.round(d.top+12),w:document.querySelector('.work-head').getBoundingClientRect().width,center:view.projects.p.centerDay,ppd:view.projects.p.pixelsPerDay}})()`);
  win.webContents.sendInputEvent({type:'mouseDown',x:before.x,y:before.y,button:'left',clickCount:1});win.webContents.sendInputEvent({type:'mouseMove',x:before.x+80,y:before.y,button:'left'});win.webContents.sendInputEvent({type:'mouseUp',x:before.x+80,y:before.y,button:'left',clickCount:1});await delay(200);
  const after=await run(`(()=>{const h=document.querySelector('.work-head').getBoundingClientRect(),n=document.querySelector('.work-name').getBoundingClientRect();return {w:h.width,row:n.width,center:view.projects.p.centerDay,ppd:view.projects.p.pixelsPerDay}})()`);
  check(Math.abs(after.w-before.w-80)<2 && Math.abs(after.row-after.w)<1,'드래그 너비 및 행 정렬 실패: '+JSON.stringify({before,after}));
  check(Math.abs(after.center-before.center)<1e-7 && Math.abs(after.ppd-before.ppd)<1e-7,'너비 변경 시 일정 보기 변경');
  await run(`document.querySelector('[data-action="select-work"][data-id="t"]').dispatchEvent(new MouseEvent('dblclick',{bubbles:true}))`);await delay(120);
  await run(`(()=>{const s=document.querySelector('#detail-start');s.value='2024-02-29';s.dispatchEvent(new Event('change',{bubbles:true}))})()`);
  check(await run(`document.querySelector('#detail-end').value==='2024-02-29' && document.querySelector('#detail-end').min==='2024-02-29'`),'종료일 기본값 실패');
  await run(`(()=>{const e=document.querySelector('#detail-end');e.value='2024-02-01';e.dispatchEvent(new Event('change',{bubbles:true}))})()`);
  check(await run(`document.querySelector('#detail-end').value==='2024-02-29'`),'종료일 이전 날짜 차단 실패');
  await run(`(()=>{const s=document.querySelector('#detail-start');s.value='2024-03-03';s.dispatchEvent(new Event('change',{bubbles:true}))})()`);
  check(await run(`document.querySelector('#detail-end').value==='2024-03-03'`),'시작일 변경 후 종료일 보정 실패');
  await run(`document.querySelector('#detail-form').requestSubmit()`);await delay(300);
  const item=await run(`window.storage.loadContent().then(x=>x.workItems[0])`);check(item.startDate==='2024-03-03'&&item.endDate==='2024-03-03','날짜 저장 실패');
  await delay(800); console.log('일별 연도·날짜, 너비 조절·정렬, 종료일 자동 보정 통과');
 }else{const v=await run(`window.storage.loadViewState()`);check(Number.isFinite(v.projects.p.workColumnWidth),'영역 너비 복원 실패');console.log('작업 영역 너비 재실행 복원 통과');}
 app.exit(0);
 }catch(e){console.error(e);app.exit(1)}})});setTimeout(()=>{console.error('시간 초과');app.exit(1)},30000).unref();
