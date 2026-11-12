const {app,BrowserWindow}=require('electron'),path=require('node:path'),{Storage}=require('../src/storage');const dir=process.env.WBS_TEST_DIR;app.setPath('userData',dir);app.setPath('appData', dir);
if(process.env.WBS_PHASE==='write'){const db=new Storage(path.join(dir,'data','wbs-list-up.sqlite'));db.saveContent({workspace:null,folders:[],projects:[{id:'p',name:'프로젝트'}],workItems:[{id:'r',name:'기존 최상위',type:'task',projectId:'p',parentId:null},{id:'g',name:'그룹',type:'group',projectId:'p',parentId:null},{id:'a',name:'첫 작업',type:'task',projectId:'p',parentId:'g'},{id:'b',name:'둘째 작업',type:'task',projectId:'p',parentId:'g'}],documents:[]});db.saveViewState({selectedProject:'p',expandedFolders:[],projects:{p:{collapsed:['g'],selected:null}}});db.close();}
require('../src/main');const delay=ms=>new Promise(r=>setTimeout(r,ms));app.whenReady().then(()=>{const win=BrowserWindow.getAllWindows()[0];win.webContents.on('did-finish-load',async()=>{try{
 const run=s=>win.webContents.executeJavaScript(s),check=(x,m)=>{if(!x)throw Error(m)},load=()=>run(`window.storage.loadContent()`);
 const click=async sel=>{await run(`document.querySelector(${JSON.stringify(sel)}).click()`);await delay(220)};await delay(300);
 if(process.env.WBS_PHASE==='write'){
  await click('[data-action="create-task"]');let d=await load();let root=d.workItems.filter(x=>!x.parentId && x.projectId==='p');let created=root.at(-1);
  check(root.map(x=>x.id).join(',')==='r,g,'+created.id && created.name==='새 작업','선택 없는 최상위 맨 아래 생성 실패');
  check(await run(`!document.querySelector('#dialog').open && document.activeElement.dataset.id===${JSON.stringify(created.id)} && document.querySelector('.work-name.selected').closest('.schedule-row').dataset.rowId===${JSON.stringify(created.id)}`),'대화상자 또는 생성 작업 포커스 실패');
  await click('[data-action="select-work"][data-id="g"]');await click('[data-action="create-task"]');d=await load();let children=d.workItems.filter(x=>x.parentId==='g'), first=children.at(-1);check(children.map(x=>x.id).join(',')==='a,b,'+first.id && first.name==='새 작업','그룹 안 맨 아래 생성 실패');check(await run(`!!document.querySelector('[data-row-id="${first.id}"]')`),'접힌 그룹 자동 펼침 실패');
  await click('[data-action="select-work"][data-id="a"]');await click('[data-action="create-task"]');d=await load();children=d.workItems.filter(x=>x.parentId==='g');check(children.length===4 && children.at(-1).name==='새 작업' && children.at(-1).id!==first.id,'작업과 같은 계층 맨 아래 생성 실패');
  const colors=d.workItems.filter(x=>x.name==='새 작업').map(x=>x.barColor);check(colors.length===3 && new Set(colors).size===3 && colors.every(x=>/^#[0-9a-f]{6}$/.test(x) && x!=='#6f95df' && x!=='#526a8f'),'새 작업 색상 중복 또는 누락');
  await delay(650);console.log('무대화상자 작업 생성·최상위·그룹·같은 계층·색상·포커스 통과');
 }else{const d=await load();const added=d.workItems.filter(x=>x.name==='새 작업');check(added.length===3 && d.workItems.filter(x=>x.parentId==='g').length===4 && new Set(added.map(x=>x.barColor)).size===3 && added.every(x=>/^#[0-9a-f]{6}$/.test(x.barColor)),'작업 및 색상 재실행 복원 실패');console.log('작업 생성 재실행 복원 통과');}
 app.exit(0);
}catch(e){console.error(e);app.exit(1)}})});setTimeout(()=>{console.error('시간 초과');app.exit(1)},30000).unref();
