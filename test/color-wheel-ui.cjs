const {app,BrowserWindow}=require('electron'),path=require('node:path'),{Storage}=require('../src/storage');const dir=process.env.WBS_TEST_DIR;app.setPath('userData',dir);app.setPath('appData', dir);
if(process.env.WBS_PHASE==='write'){const db=new Storage(path.join(dir,'data','wbs-list-up.sqlite'));db.saveContent({workspace:null,folders:[],projects:[{id:'p',name:'프로젝트'}],workItems:[{id:'g',name:'그룹',type:'group',projectId:'p',parentId:null},{id:'t',name:'작업',type:'task',projectId:'p',parentId:'g',startDate:'2024-02-01',endDate:'2024-02-29'},...Array.from({length:25},(_,i)=>({id:'extra'+i,name:'추가 '+i,type:'task',projectId:'p',parentId:null}))],documents:[]});db.saveViewState({selectedProject:'p',expandedFolders:[],projects:{p:{collapsed:[],selected:null,centerDay:19755,pixelsPerDay:8}}});db.close();}
require('../src/main');const delay=ms=>new Promise(r=>setTimeout(r,ms));app.whenReady().then(()=>{const win=BrowserWindow.getAllWindows()[0];win.setSize(1500,900);win.webContents.on('did-finish-load',async()=>{try{
 const run=s=>win.webContents.executeJavaScript(s),check=(x,m)=>{if(!x)throw Error(m)},load=()=>run(`window.storage.loadContent()`);
 const click=async sel=>{await run(`document.querySelector(${JSON.stringify(sel)}).click()`);await delay(150)};
 const open=async id=>{await run(`document.querySelector('[data-action="select-work"][data-id="${id}"]').dispatchEvent(new MouseEvent('dblclick',{bubbles:true}))`);await delay(120);check(await run(`document.querySelector('#detail-dialog').open`),'상세 열기 실패 '+id)};
 const color=id=>run(`getComputedStyle(document.querySelector('[data-bar-id="${id}"]')).backgroundColor`);
 await delay(350);
 if(process.env.WBS_PHASE==='write'){
  await open('t');await run(`document.querySelector('#detail-color').value='#c43a21';document.querySelector('#detail-form').requestSubmit()`);await delay(240);
  await open('g');await run(`document.querySelector('#detail-color').value='#237a45';document.querySelector('#detail-form').requestSubmit()`);await delay(240);
  const before={task:await color('t'),group:await color('g')};check(before.task==='rgb(196, 58, 33)' && before.group==='rgb(35, 122, 69)','선택 색상 표시 실패 '+JSON.stringify(before));
  await click('[data-action="lock-work"][data-id="g"]');check((await color('t'))===before.task && (await color('g'))===before.group,'잠금 시 색상 변경');
  await open('t');check(await run(`document.querySelector('#detail-color').value==='#c43a21' && !document.querySelector('#detail-color').disabled`),'잠금 상태 색상 편집 실패');await click('#detail-cancel');
  await click('[data-action="lock-work"][data-id="g"]');check((await color('t'))===before.task && (await color('g'))===before.group,'잠금 해제 시 색상 변경');
  const dims=await run(`(()=>{const r=document.querySelector('.time-ruler').getBoundingClientRect(),b=document.querySelector('.schedule-board');return {x:Math.round(r.left+r.width/2),y:Math.round(r.top+r.height/2),scroll:b.scrollTop,center:view.projects.p.centerDay,ppd:view.projects.p.pixelsPerDay}})()`);
  win.webContents.sendInputEvent({type:'mouseWheel',x:dims.x,y:dims.y,deltaY:-120,deltaX:0});await delay(200);
  const down=await run(`({scroll:document.querySelector('.schedule-board').scrollTop,center:view.projects.p.centerDay})`);check(down.scroll>dims.scroll && down.center===dims.center,'휠 아래 세로 이동 실패 '+JSON.stringify({dims,down}));
  win.webContents.sendInputEvent({type:'mouseWheel',x:dims.x,y:dims.y,deltaY:120,deltaX:0});await delay(200);
  const up=await run(`({scroll:document.querySelector('.schedule-board').scrollTop,center:view.projects.p.centerDay})`);check(up.scroll<down.scroll && up.center===dims.center,'휠 위 세로 이동 실패');
  win.webContents.sendInputEvent({type:'mouseWheel',x:dims.x,y:dims.y,deltaY:120,deltaX:0,modifiers:['control']});await delay(200);check((await run(`view.projects.p.pixelsPerDay`))>dims.ppd,'Ctrl+휠 확대 실패');
  await delay(600);console.log('작업·그룹 색상과 잠금 유지, 휠 세로 이동·Ctrl 확대 통과');
 }else{const d=await load();check(d.workItems.find(x=>x.id==='t').barColor==='#c43a21' && d.workItems.find(x=>x.id==='g').barColor==='#237a45','색상 재실행 데이터 복원 실패');check((await color('t'))==='rgb(196, 58, 33)' && (await color('g'))==='rgb(35, 122, 69)','색상 재실행 화면 복원 실패');console.log('막대 색상 재실행 복원 통과')}
 app.exit(0);
}catch(e){console.error(e);app.exit(1)}})});setTimeout(()=>{console.error('시간 초과');app.exit(1)},30000).unref();
