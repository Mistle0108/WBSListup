const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {Storage}=require('../src/storage');
const doc=text=>({type:'doc',content:[{type:'paragraph',content:[{type:'text',text}]}]});
test('기존 보드와 문서를 여러 항목으로 원자 전환하고 실패 시 원본을 보존한다',()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'wbs-multi-'));let db;
 try{db=new Storage(path.join(dir,'db.sqlite'));const note={id:'n',text:'기존 메모',x:0,y:0,width:220,height:160,z:1};db.saveContent({projects:[{id:'p'}],workItems:[{id:'t',projectId:'p',type:'task',name:'작업',notes:[note],document:{schemaVersion:1,content:doc('기존 문서')}}],documents:[]});
 const command={op:'detail',kind:'work',id:'t',name:'작업',overview:'',hoverSummary:'',startDate:null,endDate:null,boards:[{id:'b1',name:'첫 보드',notes:[{...note,title:'이름'}]},{id:'b2',name:'두번째 보드',notes:[]}],taskDocuments:[{id:'d1',name:'첫 문서',schemaVersion:1,content:doc('기존 문서')},{id:'d2',name:'두번째 문서',schemaVersion:1,content:doc('새 문서')}]};
 db.db.exec("CREATE TRIGGER reject_multi BEFORE UPDATE ON state BEGIN SELECT RAISE(ABORT,'실패'); END");assert.throws(()=>db.executeContent(command),/실패/);let old=db.loadContent().workItems[0];assert.equal(old.notes[0].text,'기존 메모');assert.equal(old.document.content.content[0].content[0].text,'기존 문서');
 db.db.exec('DROP TRIGGER reject_multi');db.executeContent(command);db.close();db=new Storage(path.join(dir,'db.sqlite'));let saved=db.loadContent().workItems[0];assert.equal(saved.boards.length,2);assert.equal(saved.boards[0].notes[0].title,'이름');assert.equal(saved.taskDocuments[0].content.content[0].content[0].text,'기존 문서');assert.equal(saved.taskDocuments[1].content.content[0].content[0].text,'새 문서');assert.equal(saved.notes,undefined);assert.equal(saved.document,undefined);
 assert.throws(()=>db.executeContent({...command,boards:[command.boards[0],command.boards[0]]}),/식별자/);assert.equal(db.loadContent().workItems[0].boards.length,2);
 }finally{if(db)db.close();fs.rmSync(dir,{recursive:true,force:true})}
});
