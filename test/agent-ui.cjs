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
   const saved = (await read()).data; assert.equal(saved.documents[0].content.content[0].content[0].text,'본문'); assert.equal(saved.workItems[0].barColor,'#ab12cd');
   assert.equal(await win.webContents.executeJavaScript("document.querySelector('#folders').textContent.includes('연동 프로젝트')"),true);
   await win.webContents.executeJavaScript("document.querySelector('#project-dialog').showModal()");
   const second=await read();
   const blocked=await client.callTool({name:'apply_changes',arguments:{revision:second.revision,changes:[{action:'schedule',id:'t',startDate:'2026-11-11',endDate:'2026-11-13'}]}});
   assert.equal(blocked.isError,true); assert.match(blocked.content[0].text,/편집/);
   await win.webContents.executeJavaScript("document.querySelector('#project-dialog').close()");
   console.log('MCP 앱 연동, 화면 갱신, 편집 충돌 차단 통과');
   await client.close(); app.exit(0);
  } catch(e) { console.error(e); if(client) await client.close().catch(()=>{}); app.exit(1); }
 });
});
