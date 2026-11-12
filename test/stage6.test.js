const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {Storage}=require('../src/storage'), domain=require('../src/domain');
const doc=(id,title,text)=>({id,title,schemaVersion:1,content:{type:'doc',content:[{type:'paragraph',content:[{type:'text',text}]}]}});
const initial=()=>({projects:[{id:'p'},{id:'q'}],workItems:[{id:'w',type:'task',projectId:'p',document:{schemaVersion:1,content:{type:'doc',content:[]}}}],documents:[]});
test('프로젝트별 여러 문서의 ID·순서·내용을 독립적으로 관리한다',()=>{
 let d=domain.apply(initial(),{op:'documents-save',kind:'project',id:'p',documents:[doc('a','같은 제목','첫째'),doc('b','같은 제목','둘째')],orderIds:['a','b']});
 d=domain.apply(d,{op:'documents-save',kind:'project',id:'q',documents:[doc('c','다른 프로젝트','셋째')],orderIds:['c']});
 d=domain.apply(d,{op:'documents-save',kind:'project',id:'p',documents:[doc('b','변경','수정')],orderIds:['b','a']});
 assert.deepEqual(d.documents.filter(x=>x.projectId==='p').sort((x,y)=>x.sortOrder-y.sortOrder).map(x=>x.id),['b','a']);
 assert.equal(d.documents.find(x=>x.id==='c').content.content[0].content[0].text,'셋째');assert.deepEqual(d.workItems[0].document.content.content,[]);
 assert.throws(()=>domain.apply(d,{op:'documents-save',kind:'project',id:'p',documents:[doc('c','침범','x')],orderIds:['a','b']}),/다른 프로젝트/);
 d=domain.apply(d,{op:'documents-delete',kind:'project',id:'p',documentId:'a'});assert.deepEqual(d.documents.map(x=>x.id),['b','c']);
 d=domain.apply(d,{op:'delete',kind:'project',id:'p'});assert.deepEqual(d.documents.map(x=>x.id),['c']);
});
test('여러 문서 저장 실패는 기존 문서 전체를 보존한다',()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'wbs-docs-'));let db;
 try{db=new Storage(path.join(dir,'db.sqlite'));db.saveContent(initial());db.executeContent({op:'documents-save',kind:'project',id:'p',documents:[doc('a','첫째','원본'),doc('b','둘째','원본')],orderIds:['a','b']});
 db.db.exec("CREATE TRIGGER fail_docs BEFORE UPDATE ON state BEGIN SELECT RAISE(ABORT,'실패'); END");
 assert.throws(()=>db.executeContent({op:'documents-save',kind:'project',id:'p',documents:[doc('a','변경1','변경'),doc('b','변경2','변경')],orderIds:['b','a']}),/실패/);
 db.close();db=new Storage(path.join(dir,'db.sqlite'));const result=db.loadContent().documents;assert.deepEqual(result.map(x=>x.title),['첫째','둘째']);assert.deepEqual(result.map(x=>x.sortOrder),[0,1]);
 }finally{if(db)db.close();fs.rmSync(dir,{recursive:true,force:true})}
});

test('이전 스키마를 원자적으로 이전하고 본문을 필요할 때 읽는다',()=>{
 const {DatabaseSync}=require('node:sqlite'); const dir=fs.mkdtempSync(path.join(os.tmpdir(),'wbs-migrate-')); const file=path.join(dir,'db.sqlite');let db;
 try {
  const old=new DatabaseSync(file);old.exec('CREATE TABLE state (key TEXT PRIMARY KEY, value TEXT NOT NULL); PRAGMA user_version = 1');
  const data=initial();data.documents=[{...doc('a','문서','본문'),projectId:'p',sortOrder:0}];
  old.prepare('INSERT INTO state (key,value) VALUES (?,?)').run('content',JSON.stringify(data));old.prepare('INSERT INTO state (key,value) VALUES (?,?)').run('view',JSON.stringify({selectedProject:'p'}));old.close();
  db=new Storage(file);assert.equal(db.db.prepare('PRAGMA user_version').get().user_version,2);
  assert.equal(db.loadContentMetadata().documents[0].content,undefined);assert.equal(db.loadProjectDocument('p','a').content[0].content[0].text,'본문');assert.equal(db.loadViewState().selectedProject,'p');
  db.executeContent({op:'rename',kind:'project',id:'p',name:'새 프로젝트'});assert.equal(db.loadProjectDocument('p','a').content[0].content[0].text,'본문');
  db.close();db=new Storage(file);assert.equal(db.loadContent().documents[0].content.content[0].content[0].text,'본문');
 }finally{if(db)db.close();fs.rmSync(dir,{recursive:true,force:true})}
});
test('이전 실패 시 구버전 데이터와 스키마가 유지된다',()=>{
 const {DatabaseSync}=require('node:sqlite');const dir=fs.mkdtempSync(path.join(os.tmpdir(),'wbs-migrate-fail-'));const file=path.join(dir,'db.sqlite');
 try{const old=new DatabaseSync(file);old.exec('CREATE TABLE state (key TEXT PRIMARY KEY, value TEXT NOT NULL); PRAGMA user_version = 1');const data=initial();data.documents=[{...doc('same','문서1','A'),projectId:'p'},{...doc('same','문서2','B'),projectId:'p'}];const raw=JSON.stringify(data);old.prepare('INSERT INTO state (key,value) VALUES (?,?)').run('content',raw);old.close();
 assert.throws(()=>new Storage(file));const check=new DatabaseSync(file);assert.equal(check.prepare('PRAGMA user_version').get().user_version,1);assert.equal(check.prepare("SELECT value FROM state WHERE key='content'").get().value,raw);check.close();
 }finally{fs.rmSync(dir,{recursive:true,force:true})}
});
