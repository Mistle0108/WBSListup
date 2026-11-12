const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');const {Storage}=require('../src/storage');
const png='data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/lX8AAAAASUVORK5CYII=';
const doc=(id,title)=>({id,title,schemaVersion:1,content:{type:'doc',content:[{type:'paragraph'}]}});
test('문서 폴더 중첩·문서 이동·순환 방지와 폴더 삭제를 저장한다',()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'wbs-folders-'));let db;
 try{db=new Storage(path.join(dir,'db.sqlite'));db.saveContent({projects:[{id:'p'},{id:'q'}],workItems:[],documents:[]});
 const command=(op,args)=>db.executeContent({op,kind:'project',id:'p',...args});
 command('doc-folder-create',{folderId:'a',name:'상위',parentId:null});command('doc-folder-create',{folderId:'b',name:'하위',parentId:'a'});
 command('documents-save',{documents:[{...doc('d','문서'),parentId:'a'}],orderIds:['d']});command('documents-move',{documentId:'d',parentId:'b',orderIds:['d']});
 assert.equal(db.loadContentMetadata().documents[0].parentId,'b');assert.throws(()=>command('doc-folder-move',{folderId:'a',parentId:'b'}),/하위/);
 assert.throws(()=>db.executeContent({op:'doc-folder-create',kind:'project',id:'q',folderId:'bad',name:'외부',parentId:'a'}),/프로젝트/);
 db.close();db=new Storage(path.join(dir,'db.sqlite'));assert.equal(db.loadProjectDocument('p','d').type,'doc');assert.equal(db.loadContentMetadata().projectDocumentFolders.length,2);
 db.executeContent({op:'doc-folder-delete',kind:'project',id:'p',folderId:'a'});assert.equal(db.loadContentMetadata().documents.length,0);assert.equal(db.db.prepare('SELECT COUNT(*) AS n FROM project_document_content').get().n,0);
 }finally{if(db)db.close();fs.rmSync(dir,{recursive:true,force:true})}
});
test('프로젝트 보드 이미지와 문서의 일괄 저장은 실패 시 함께 보존된다',()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'wbs-project-board-'));let db;
 try{db=new Storage(path.join(dir,'db.sqlite'));db.saveContent({projects:[{id:'p'}],workItems:[],documents:[]});const command={op:'documents-save',kind:'project',id:'p',documents:[doc('d','문서')],orderIds:['d'],boards:[{id:'b',name:'보드',notes:[{id:'i',type:'image',title:'이미지',dataUrl:png,x:0,y:0,width:120,height:100,z:1}]}]};
 db.db.exec("CREATE TRIGGER reject_board BEFORE UPDATE ON state BEGIN SELECT RAISE(ABORT,'실패'); END");assert.throws(()=>db.executeContent(command),/실패/);assert.equal(db.loadContentMetadata().documents.length,0);assert.equal(db.loadContentMetadata().projects[0].boards,undefined);
 db.db.exec('DROP TRIGGER reject_board');db.executeContent(command);db.close();db=new Storage(path.join(dir,'db.sqlite'));assert.equal(db.loadContentMetadata().projects[0].boards[0].notes[0].dataUrl,png);
 const unsafe=structuredClone(command);unsafe.boards[0].notes[0].dataUrl='data:image/svg+xml;base64,PHN2Zz4=';assert.throws(()=>db.executeContent(unsafe),/메모/);
 }finally{if(db)db.close();fs.rmSync(dir,{recursive:true,force:true})}
});
