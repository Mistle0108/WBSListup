const fs = require('node:fs');
const path = require('node:path');
const { McpServer } = require('@modelcontextprotocol/sdk/server/mcp.js');
const { StdioServerTransport } = require('@modelcontextprotocol/sdk/server/stdio.js');
const { z } = require('zod');
const directory = process.env.WBS_AGENT_DIR || path.join(process.env.APPDATA || '', 'WBS List up');
async function request(value) {
  let connection;
  try { connection = JSON.parse(fs.readFileSync(path.join(directory,'agent-connection.json'),'utf8')); }
  catch { throw new Error('WBS List up이 실행 중이 아닙니다. 앱을 먼저 실행하세요.'); }
  let response;
  try { response = await fetch(`http://127.0.0.1:${connection.port}/agent`,{method:'POST',headers:{'Content-Type':'application/json',Authorization:`Bearer ${connection.token}`},body:JSON.stringify(value),signal:AbortSignal.timeout(15000)}); }
  catch { throw new Error('WBS List up에 연결할 수 없습니다. 앱을 다시 실행하세요.'); }
  const payload = await response.json(); if (!response.ok) throw new Error(payload.error || '요청 실패'); return payload.result;
}
const server = new McpServer({name:'wbs-list-up',version:'0.1.0'});
const output = value => ({content:[{type:'text',text:JSON.stringify(value,null,2)}]});
const safely = fn => async args => { try { return output(await fn(args)); } catch (e) { return {isError:true,content:[{type:'text',text:e.message}]}; } };
server.registerTool('list_projects',{description:'WBS 프로젝트와 ID 목록을 조회합니다. 변경 전에는 get_project 또는 get_workspace로 revision을 조회하세요.',inputSchema:{}},safely(async () => { const {data,revision} = await request({method:'read'}); return {revision,folders:data.folders,projects:data.projects.map(({id,name,parentId})=>({id,name,parentId}))}; }));
server.registerTool('get_workspace',{description:'프로젝트, 작업 계층, 날짜와 문서 내용을 조회합니다. projectId를 지정하면 해당 프로젝트만 반환합니다. 문서 내용은 Tiptap JSON입니다.',inputSchema:{projectId:z.string().optional()}},safely(async ({projectId}) => { const {data,revision} = await request({method:'read'}); if (!projectId) return {revision,data}; const project = data.projects.find(p=>p.id===projectId); if (!project) throw new Error('프로젝트를 찾을 수 없습니다.'); return {revision,project,workItems:data.workItems.filter(w=>w.projectId===projectId),documents:data.documents.filter(d=>d.projectId===projectId),documentFolders:(data.projectDocumentFolders||[]).filter(f=>f.projectId===projectId)}; }));
const common = {id:z.string().optional().describe('생략하면 자동 생성. 기존 문서 수정 또는 일괄 요청 내 참조 시 명시'),parentId:z.string().nullable().optional()};
const change = z.discriminatedUnion('action',[
  z.object({action:z.literal('create_project'),...common,name:z.string()}),
  z.object({action:z.literal('create_work'),...common,projectId:z.string(),name:z.string(),type:z.enum(['task','group']),startDate:z.string().optional(),endDate:z.string().optional()}),
  z.object({action:z.literal('rename_work'),id:z.string(),name:z.string()}),
  z.object({action:z.literal('set_bar_color'),id:z.string(),color:z.string().regex(/^#[0-9a-fA-F]{6}$/).describe('막대 색상: #RRGGBB')}),
  z.object({action:z.literal('schedule'),id:z.string(),startDate:z.string().nullable(),endDate:z.string().nullable()}),
  z.object({action:z.literal('save_project_document'),...common,projectId:z.string(),title:z.string(),text:z.string()}),
  z.object({action:z.literal('delete_project_document'),id:z.string(),projectId:z.string()}),
  z.object({action:z.literal('save_work_document'),id:z.string().optional(),workId:z.string(),title:z.string(),text:z.string()}),
  z.object({action:z.literal('delete_work_document'),id:z.string(),workId:z.string()})
]);
server.registerTool('apply_changes',{description:'조회 시 받은 revision을 사용해 변경을 한 트랜잭션으로 적용합니다. 문서 text는 줄별 일반 문단으로 저장하며 Markdown 서식은 변환하지 않습니다. 기존 문서 저장은 본문 전체를 교체합니다. 상세 창이 열려 있거나 데이터가 바뀌면 실패합니다.',inputSchema:{revision:z.string(),changes:z.array(change).min(1).max(100)}},safely(async args => request({method:'apply',...args})));
server.connect(new StdioServerTransport()).catch(error=>{ console.error(error); process.exitCode=1; });
