const { app, BrowserWindow } = require('electron');
const path = require('node:path');
const { Storage } = require('../src/storage');
const dir = process.env.WBS_TEST_DIR;
app.setPath('userData', dir);app.setPath('appData', dir);
if (process.env.WBS_PHASE === 'write') {
  const db = new Storage(path.join(dir,'data','wbs-list-up.sqlite'));
  db.saveContent({workspace:null,folders:[],projects:[{id:'p1',name:'프로젝트 A',parentId:null},{id:'p2',name:'프로젝트 B',parentId:null}],workItems:[{id:'g',name:'그룹',type:'group',projectId:'p1',parentId:null},{id:'t',name:'윤년 작업',type:'task',projectId:'p1',parentId:'g',startDate:'2024-02-01',endDate:'2024-03-01'},{id:'u',name:'미정 작업',type:'task',projectId:'p1',parentId:'g'},{id:'x',name:'두 번째',type:'task',projectId:'p2',parentId:null},...Array.from({length:20},(_,i)=>({id:'extra'+i,name:'추가 '+i,type:'task',projectId:'p1',parentId:null}))],documents:[]});
  db.saveViewState({selectedProject:'p1',projects:{p1:{collapsed:[],selected:null}},expandedFolders:[]}); db.close();
}
require('../src/main');
const delay = ms => new Promise(resolve => setTimeout(resolve,ms));
app.whenReady().then(() => {
  const win = BrowserWindow.getAllWindows()[0];
  win.webContents.on('did-finish-load', async () => {
    try {
      const run = code => win.webContents.executeJavaScript(code);
      await delay(400);
      if (process.env.WBS_PHASE === 'close') {
        const expected = await run(`view.projects.p1.centerDay += 30; scheduleViewSave(); view.projects.p1.centerDay`);
        require('node:fs').writeFileSync(path.join(dir, 'expected-center.txt'), String(expected));
        win.close();
        return;
      }
      if (process.env.WBS_PHASE === 'write') {
        await run(`document.querySelector('[data-action="select-work"][data-id="t"]').dispatchEvent(new MouseEvent('dblclick',{bubbles:true}))`);
        await run(`document.querySelector('#detail-start').value='2024-02-29'; document.querySelector('#detail-end').value='2024-03-01'; document.querySelector('#detail-form').requestSubmit()`);
        await delay(300);
        let before = await run(`(()=>{const r=document.querySelector('.time-ruler').getBoundingClientRect();return {center:view.projects.p1.centerDay,ppd:view.projects.p1.pixelsPerDay,x:Math.round(r.left+r.width*.25),y:Math.round(r.top+r.height/2),left:r.left,width:r.width,bars:document.querySelectorAll('.bar').length,rows:[...document.querySelectorAll('.schedule-row')].map(x=>{const a=x.querySelector('.work-name').getBoundingClientRect(),b=x.querySelector('.timeline-cell').getBoundingClientRect();return Math.abs(a.top-b.top)})}})()`);
        if (before.bars !== 2 || before.rows.some(x=>x>0.1)) throw Error('그룹 막대 또는 행 정렬 실패: '+JSON.stringify(before));
        win.webContents.sendInputEvent({type:'mouseWheel',x:before.x,y:before.y,deltaY:120,deltaX:0,modifiers:['control']}); await delay(150);
        let after = await run(`({center:view.projects.p1.centerDay,ppd:view.projects.p1.pixelsPerDay})`);
        if (!(after.ppd>before.ppd)) throw Error('확대 방향 오류: '+JSON.stringify({before,after,hit:await run(`document.elementFromPoint(${before.x},${before.y}).outerHTML`),busy:await run('busy')}));
        const offset=before.x-before.left-before.width/2;
        if (Math.abs((before.center+offset/before.ppd)-(after.center+offset/after.ppd))>0.05) throw Error('포인터 기준점 오류');
        const scrollBefore=await run(`document.querySelector('.schedule-board').scrollTop`);
        win.webContents.sendInputEvent({type:'mouseWheel',x:before.x,y:before.y,deltaY:-120,deltaX:0}); await delay(150);
        const scrollAfter=await run(`document.querySelector('.schedule-board').scrollTop`);
        let scrolled=await run(`view.projects.p1.centerDay`); if (!(scrollAfter>scrollBefore) || Math.abs(scrolled-after.center)>1e-7) throw Error('일반 휠 세로 이동 오류');
        win.webContents.sendInputEvent({type:'mouseDown',x:before.x,y:before.y,button:'left',clickCount:1});
        win.webContents.sendInputEvent({type:'mouseMove',x:before.x-40,y:before.y,button:'left',movementX:-40});
        win.webContents.sendInputEvent({type:'mouseUp',x:before.x-40,y:before.y,button:'left',clickCount:1}); await delay(150);
        const panned=await run(`view.projects.p1.centerDay`); if (!(panned>scrolled)) throw Error('팬 방향 오류');
        let stable=await run(`({center:view.projects.p1.centerDay,ppd:view.projects.p1.pixelsPerDay})`);
        await run(`document.querySelector('#sidebar-toggle').click()`); await delay(200);
        let resized=await run(`({center:view.projects.p1.centerDay,ppd:view.projects.p1.pixelsPerDay})`);
        if (Math.abs(stable.center-resized.center)>1e-7 || Math.abs(stable.ppd-resized.ppd)>1e-7) throw Error('사이드바 변경 시 보기 변경');
        await run(`document.querySelector('#sidebar-toggle').click()`); await delay(150);
        await run(`document.querySelector('[data-action="toggle-work"][data-id="g"]').click()`); await delay(150);
        await run(`document.querySelector('[data-action="select-project"][data-id="p2"]').click()`); await delay(150);
        await run(`document.querySelector('[data-action="select-project"][data-id="p1"]').click()`); await delay(800);
        const restored=await run(`({center:view.projects.p1.centerDay,ppd:view.projects.p1.pixelsPerDay,collapsed:view.projects.p1.collapsed})`);
        if (!restored.collapsed.includes('g') || Math.abs(stable.center-restored.center)>1e-7 || Math.abs(stable.ppd-restored.ppd)>1e-7) throw Error('프로젝트 전환 복원 실패');
        console.log('Electron 날짜 입력·행 정렬·휠·포인터 기준 줌·팬·사이드바·전환 통과');
      } else {
        const r=await run(`(async()=>({view:await window.storage.loadViewState(),content:await window.storage.loadContent(), bars:document.querySelectorAll('.bar').length}))()`);
        if (r.content.workItems.find(x=>x.id==='t').startDate!=='2024-02-29' || !r.view.projects.p1.collapsed.includes('g') || !Number.isFinite(r.view.projects.p1.centerDay) || r.bars!==1) throw Error('재실행 복원 실패: '+JSON.stringify(r));
        console.log('Electron 별도 프로세스 날짜와 보기 복원 통과');
      }
      app.exit(0);
    } catch (error) { console.error(error); app.exit(1); }
  });
});
setTimeout(()=>{console.error('시간 초과');app.exit(1)},30000).unref();
