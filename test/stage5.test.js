const test = require('node:test'), assert = require('node:assert/strict');
const fs=require('node:fs'), os=require('node:os'),path=require('node:path');
const {Storage}=require('../src/storage');
test('상세 명령은 기본 정보·메모·문서를 함께 저장하며 실패하면 모두 보존한다',()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'wbs-board-'));let db;
 try {db=new Storage(path.join(dir,'db.sqlite'));db.saveContent({projects:[{id:'p'}],workItems:[{id:'t',type:'task',projectId:'p',name:'기존'}]});
 const cmd={op:'detail',kind:'work',id:'t',name:'변경',overview:'개요',hoverSummary:'요약',startDate:null,endDate:null,notes:[{id:'n',text:'메모',x:3,y:4,width:220,height:160,z:1}],document:{schemaVersion:1,content:{type:'doc',content:[{type:'paragraph'}]}}};
 db.executeContent(cmd);db.close();db=new Storage(path.join(dir,'db.sqlite'));let item=db.loadContent().workItems[0];assert.equal(item.notes[0].text,'메모');assert.equal(item.document.content.content[0].type,'paragraph');
 db.db.exec("CREATE TRIGGER fail_board BEFORE UPDATE ON state BEGIN SELECT RAISE(ABORT,'실패'); END");
 assert.throws(()=>db.executeContent({...cmd,name:'실패',notes:[],document:{schemaVersion:1,content:{type:'doc'}}}),/실패/);
 item=db.loadContent().workItems[0];assert.equal(item.name,'변경');assert.equal(item.notes[0].text,'메모');assert.equal(item.document.content.content[0].type,'paragraph');
 }finally{if(db)db.close();fs.rmSync(dir,{recursive:true,force:true})}
});
test('위험한 문서 링크와 잘못된 메모는 저장하지 않는다',()=>{
 const domain=require('../src/domain');const data={projects:[{id:'p'}],workItems:[{id:'t',type:'task',projectId:'p',name:'작업'}]};
 const cmd={op:'detail',kind:'work',id:'t',name:'작업',overview:'',hoverSummary:'',notes:[],document:{schemaVersion:1,content:{type:'doc',content:[{type:'paragraph',content:[{type:'text',text:'x',marks:[{type:'link',attrs:{href:'javascript:alert(1)'}}]}]}]}}};
 assert.throws(()=>domain.apply(data,cmd),/링크/);
 cmd.document.content.content=[];cmd.notes=[{id:'n',text:'x',x:0,y:0,width:-1,height:100,z:1}];assert.throws(()=>domain.apply(data,cmd),/메모/);
});
