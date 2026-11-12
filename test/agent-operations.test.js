const test = require('node:test'), assert = require('node:assert/strict');
const fs = require('node:fs'), os = require('node:os'), path = require('node:path');
const {Storage} = require('../src/storage');
const {applyChanges,revision} = require('../src/agent-operations');
test('일괄 작업과 문서를 저장하고 충돌과 실패 시 기존 상태를 보존한다', () => {
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'wbs-agent-')); const db=new Storage(path.join(dir,'db.sqlite'));
 try {
  let result=applyChanges(db,revision(db.loadContent()),[
   {action:'create_project',id:'p',name:'프로젝트'},
   {action:'create_work',id:'g',projectId:'p',name:'그룹',type:'group'},
   {action:'create_work',id:'t',projectId:'p',parentId:'g',name:'작업',type:'task',startDate:'2026-11-01',endDate:'2026-11-03'},
   {action:'save_project_document',id:'d',projectId:'p',title:'기획',text:'첫 줄\n둘째 줄'},
   {action:'save_work_document',id:'wd',workId:'t',title:'상세',text:'작업 내용'},
   {action:'set_bar_color',id:'t',color:'#Ab12Cd'},
   {action:'set_bar_color',id:'g',color:'#123456'}
  ]);
  let state=db.loadContent(); assert.equal(state.workItems[1].endDate,'2026-11-03'); assert.equal(state.documents[0].content.content[1].content[0].text,'둘째 줄'); assert.equal(state.workItems[1].taskDocuments[0].id,'wd'); assert.equal(state.workItems[1].barColor,'#ab12cd'); assert.equal(state.workItems[0].barColor,'#123456');
  assert.throws(()=>applyChanges(db,result.revision,[{action:'set_bar_color',id:'t',color:'red'}]),/색상/);
  assert.equal(db.loadContent().workItems[1].barColor,'#ab12cd');
  assert.throws(()=>applyChanges(db,'stale',[{action:'schedule',id:'t',startDate:'2026-12-01',endDate:'2026-12-02'}]),/변경/);
  assert.throws(()=>applyChanges(db,result.revision,[{action:'delete_project_document',id:'d',projectId:'p'},{action:'schedule',id:'t',startDate:'2026-12-03',endDate:'2026-12-01'}]),/시작일/);
  assert.equal(db.loadContent().documents.length,1);
  db.executeContent({op:'lock',kind:'work',id:'g',locked:true});
  assert.throws(()=>applyChanges(db,revision(db.loadContent()),[{action:'schedule',id:'t',startDate:'2026-12-01',endDate:'2026-12-02'}]),/잠겨/);
 } finally { db.close(); fs.rmSync(dir,{recursive:true,force:true}); }
});
