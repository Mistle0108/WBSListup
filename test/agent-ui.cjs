const {app,BrowserWindow}=require('electron');
const path=require('node:path'), assert=require('node:assert/strict');
const dir=process.env.WBS_TEST_DIR; app.setPath('userData',dir); app.setPath('appData',dir);
require('../src/main');
app.whenReady().then(() => {
 const win=BrowserWindow.getAllWindows()[0];
 win.webContents.on('did-finish-load', async () => {
  let client;
  try {
   const {Client}=require('@modelcontextprotocol/sdk/client/index.js');
   const {StdioClientTransport}=require('@modelcontextprotocol/sdk/client/stdio.js');
   client=new Client({name:'integration-test',version:'1'});
   await client.connect(new StdioClientTransport({command:process.execPath,args:[path.join(__dirname,'../src/agent-mcp.js')],env:{...process.env,ELECTRON_RUN_AS_NODE:'1',WBS_AGENT_DIR:dir}}));
   const read=async () => JSON.parse((await client.callTool({name:'get_workspace',arguments:{}})).content[0].text);
   const first=await read();
   const applied=await client.callTool({name:'apply_changes',arguments:{revision:first.revision,changes:[{action:'create_project',id:'p',name:'연동 프로젝트'},{action:'create_work',id:'t',projectId:'p',name:'연동 작업',type:'task',startDate:'2026-11-10',endDate:'2026-11-12'},{action:'save_project_document',id:'d',projectId:'p',title:'계획',text:'본문'},{action:'set_bar_color',id:'t',color:'#ab12cd'}]}});
   assert.equal(applied.isError,undefined,JSON.stringify(applied));
   const saved = (await read()).data; assert.equal(saved.documents[0].content,'본문'); assert.equal(saved.workItems[0].barColor,'#ab12cd');
   assert.equal(await win.webContents.executeJavaScript("document.querySelector('#folders').textContent.includes('연동 프로젝트')"),true);
   await win.webContents.executeJavaScript("document.querySelector('#project-dialog').showModal()");
   const second=await read();
   const blocked=await client.callTool({name:'apply_changes',arguments:{revision:second.revision,changes:[{action:'schedule',id:'t',startDate:'2026-11-11',endDate:'2026-11-13'}]}});
   assert.equal(blocked.isError,true); assert.match(blocked.content[0].text,/편집/);
   await win.webContents.executeJavaScript("document.querySelector('#project-dialog').close()");
   const apply = async changes => client.callTool({name:'apply_changes',arguments:{revision:(await read()).revision,changes}});
   const checkSuccess = result => assert.equal(result.isError,undefined,JSON.stringify(result));
   const run = code => win.webContents.executeJavaScript(code);
   const selector = value => 'document.querySelector(' + JSON.stringify(value) + ')';
   const click = value => run(selector(value) + '.click()');
   async function wait(code) {
     for (let i = 0; i < 80; i++) {
       if (await run('Boolean(' + code + ')')) return;
       await new Promise(resolve => setTimeout(resolve, 40));
     }
     throw new Error('UI 대기 시간 초과: ' + code);
   }
   const enterDraft = (target, text) => run('(() => { const input = ' + selector(target) +
     '; input.focus(); input.value = ' + JSON.stringify(text) +
     '; input.setSelectionRange(2, 4); input.dispatchEvent(new Event("input",{bubbles:true})); })()');
   const focusedDraft = target => run('(() => { const input = ' + selector(target) +
     '; return [input.value, document.activeElement === input, input.selectionStart, input.selectionEnd]; })()');
   const workDoc = (id, text, title = id) => ({action:'save_work_document',id,workId:'t',title,text});
   const projectDoc = (id, text) => ({action:'save_project_document',id,projectId:'p',title:id,text});
   const deleteWorkDoc = id => ({action:'delete_work_document',id,workId:'t'});
   const deleteProjectDoc = id => ({action:'delete_project_document',id,projectId:'p'});
   checkSuccess(await apply([workDoc('wa','Work A'),workDoc('wb','Work B'),workDoc('wc','Work C'),
     projectDoc('pa','Project A'),projectDoc('pb','Project B'),projectDoc('pc','Project C')]));
   await click('[data-action="select-project"][data-id="p"]');
   const workButton = '[data-action="select-work"][data-id="t"]';
   await wait(selector(workButton));
   await run(selector(workButton) + '.dispatchEvent(new MouseEvent("dblclick",{bubbles:true}))');
   await wait('document.querySelector("#detail-dialog").open');
   await click('#tab-document');
   const workA = '[data-document-id="wa"] textarea';
   await enterDraft(workA, 'Work A local draft');

   const conflictingBatch = await apply([workDoc('wb','Should not be saved'),deleteWorkDoc('wa')]);
   assert.equal(conflictingBatch.isError,true);
   assert.match(conflictingBatch.content[0].text,/편집 중인 문서/);
   assert.equal((await read()).data.workItems[0].taskDocuments.find(doc => doc.id === 'wb').content,'Work B');
   checkSuccess(await apply([workDoc('wb','Work B agent edit'),deleteWorkDoc('wc'),workDoc(undefined,'New work document','New work document')]));
   assert.deepEqual(await focusedDraft(workA),['Work A local draft',true,2,4]);
   const selectWorkDoc = index => run('(() => { const select = document.querySelector("#task-document-select"); ' +
     'select.value = ' + JSON.stringify(String(index)) + '; select.dispatchEvent(new Event("change",{bubbles:true})); })()');
   await selectWorkDoc(1);
   assert.equal(await run(selector('[data-document-id="wb"] textarea') + '.value'),'Work B agent edit');
   const dirtyWorkBlocked = await apply([workDoc('wa','Overwrite hidden draft')]);
   assert.equal(dirtyWorkBlocked.isError,true);
   await click('#detail-save');
   await wait('!document.querySelector("#detail-dialog").open');
   const currentWork = (await read()).data.workItems[0];
   assert.deepEqual(currentWork.taskDocuments.map(doc => doc.content),['Work A local draft','Work B agent edit','New work document']);

   await click('[data-action="detail-project"][data-id="p"]:not(.content-count)');
   await wait('document.querySelector("#project-dialog").open');
   const projectA = '[data-doc-id="pa"] textarea', projectB = '[data-doc-id="pb"] textarea';
   await click('[data-doc-id="pa"] .doc-toggle');
   await click('[data-doc-id="pb"] .doc-toggle');
   await wait(selector(projectB));
   await enterDraft(projectA, 'Project A local draft');
   checkSuccess(await apply([projectDoc('pb','Project B agent edit'),deleteProjectDoc('pc'),
     {action:'save_project_document',projectId:'p',title:'New project doc',text:'New project document'}]));
   await wait(selector(projectB) + '?.value === "Project B agent edit"');
   assert.deepEqual(await focusedDraft(projectA),['Project A local draft',true,2,4]);
   await click('[data-doc-id="pa"] .doc-toggle');
   const dirtyProjectBlocked = await apply([deleteProjectDoc('pa')]);
   assert.equal(dirtyProjectBlocked.isError,true);
   assert.match(dirtyProjectBlocked.content[0].text,/편집 중인 문서/);
   await click('[data-doc-id="pa"] .doc-save');
   await wait(selector('[data-doc-id="pa"] .project-doc-state') + '.textContent === "저장됨"');
   await click('#project-detail-close');
   await wait('!document.querySelector("#project-dialog").open');
   const projectDocuments = (await read()).data.documents;
   assert.equal(projectDocuments.find(entry => entry.id === 'pa').content,'Project A local draft');
   assert.equal(projectDocuments.find(entry => entry.id === 'pb').content,'Project B agent edit');
   assert.equal(projectDocuments.some(entry => entry.id === 'pc'),false);
   assert.equal(projectDocuments.some(entry => entry.content === 'New project document'),true);
   console.log('MCP 앱 연동, 동일 작업·프로젝트의 별도 문서 저장, 초안 보존, 충돌 차단 통과');
   await client.close(); app.exit(0);
  } catch(e) { console.error(e); if(client) await client.close().catch(()=>{}); app.exit(1); }
 });
});
