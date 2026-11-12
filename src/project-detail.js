function openProjectDetail(project) {
  return new Promise(resolve => {
    const dialog = document.querySelector('#project-dialog'), list = document.querySelector('#project-doc-list');
    const error = document.querySelector('#project-doc-error'), events = new AbortController(), signal = events.signal;
    const blank = {type:'doc',content:[{type:'paragraph'}]};
    let saving = false, selectedFolder = null, boardManager;
    let folders = data.projectDocumentFolders.filter(f => f.projectId === project.id).map(f => ({...f,expanded:true,element:null}));
    let docs = data.documents.filter(d => d.projectId === project.id && !d.workItemId).sort((a,b) => (a.sortOrder ?? 0)-(b.sortOrder ?? 0)).map(d => ({id:d.id,parentId:d.parentId || null,title:d.title,content:undefined,loaded:false,version:d.schemaVersion,saved:true,expanded:false,baseline:JSON.stringify({title:d.title}),editor:null,element:null}));
    const snapshot = doc => ({title:doc.title,content:doc.editor ? doc.editor.getJSON() : doc.content});
    const dirty = doc => !doc.saved || JSON.stringify(snapshot(doc)) !== doc.baseline;
    const displayState = doc => { doc.element.querySelector('.project-doc-state').textContent = dirty(doc) ? '미저장' : '저장됨'; };
    function refreshEmpty() { document.querySelector('#project-doc-empty').hidden = docs.length !== 0; }
    function refreshOrder() {
      function visit(parentId,depth,visible) {
        for (const folder of folders.filter(f => (f.parentId || null) === parentId)) {
          folder.element.style.marginLeft = `${depth*20}px`; folder.element.hidden = !visible; folder.element.classList.toggle('selected',selectedFolder===folder.id);
          const toggle=folder.element.querySelector('.folder-toggle');toggle.textContent=folder.expanded?'▾':'▸';toggle.setAttribute('aria-expanded',String(folder.expanded));toggle.setAttribute('aria-label',folder.expanded?'폴더 접기':'폴더 펼치기');
          list.append(folder.element);
          visit(folder.id,depth+1,visible && folder.expanded);
        }
        for (const doc of docs.filter(d => (d.parentId || null) === parentId)) { doc.element.style.marginLeft=`${depth*20}px`;doc.element.hidden=!visible;list.append(doc.element); }
      }
      visit(null,0,true); refreshEmpty();
      document.querySelector('.project-doc-root').classList.toggle('selected',selectedFolder===null);
    }
    async function ensureLoaded(doc) {
      if (doc.loaded) return;
      if (doc.version !== 1) throw new Error('지원하지 않는 문서 버전입니다.');
      if (!doc.loading) doc.loading = window.storage.loadProjectDocument(project.id, doc.id).then(content => {
        doc.content = content; doc.loaded = true;
        doc.baseline = JSON.stringify({title:JSON.parse(doc.baseline).title,content});
      }).finally(() => { doc.loading = null; });
      await doc.loading;
    }
    function closeEditor(doc) {
      if (!doc.editor) return;
      doc.content = doc.editor.getJSON(); doc.editor.destroy(); doc.editor = null;
      doc.element.querySelector('.project-editor').replaceChildren();
    }
    function formatCommand(doc, command) {
      if (!doc.editor) return;
      const editor = doc.editor, chain = editor.chain().focus();
      if (command === 'paragraph') chain.setParagraph().run();
      if (command === 'heading') chain.toggleHeading({level:2}).run();
      if (command === 'bold') chain.toggleBold().run();
      if (command === 'bullet') chain.toggleBulletList().run();
      if (command === 'ordered') chain.toggleOrderedList().run();
      if (command === 'task') chain.toggleTaskList().run();
      if (command === 'link') {
        const linkDialog = document.querySelector('#link-dialog'), url = document.querySelector('#link-url');
        url.value = editor.getAttributes('link').href || ''; document.querySelector('#link-error').textContent = '';
        document.querySelector('#link-cancel').onclick = () => { linkDialog.close(); editor.commands.focus(); };
        document.querySelector('#link-form').onsubmit = event => {
          event.preventDefault(); const value = url.value.trim();
          if (value && !safeTaskLink(value)) { document.querySelector('#link-error').textContent = 'http, https 또는 mailto 주소를 입력해 주세요.'; return; }
          linkDialog.close(); if (value) editor.chain().focus().extendMarkRange('link').setLink({href:value}).run(); else editor.chain().focus().extendMarkRange('link').unsetLink().run();
        };
        linkDialog.showModal(); url.focus();
      }
    }
    async function expand(doc, shouldOpen) {
      const body = doc.element.querySelector('.project-doc-body'), button = doc.element.querySelector('.doc-toggle');
      doc.expanded = shouldOpen; body.hidden = !shouldOpen; button.textContent = shouldOpen ? '▾' : '▸'; button.setAttribute('aria-expanded', String(shouldOpen));
      if (shouldOpen && !doc.editor) {
        try { await ensureLoaded(doc); }
        catch (err) { error.textContent = '문서를 불러오지 못했습니다: ' + err.message; doc.expanded = false; body.hidden = true; button.textContent = '▸'; button.setAttribute('aria-expanded','false'); return; }
        if (!doc.expanded || !dialog.open || doc.editor) return;
        doc.editor = createTaskEditor(doc.element.querySelector('.project-editor'), doc.content);
        doc.editor.on('update', () => displayState(doc));
      } else if (!shouldOpen) closeEditor(doc);
      displayState(doc);
    }
    async function run(command) {
      if (saving) return false;
      saving = true; dialog.inert = true; error.textContent = '';
      try { await changeContent(command); return true; }
      catch (err) { error.textContent = '저장 실패: ' + err.message; return false; }
      finally { dialog.inert = false; saving = false; }
    }
    async function saveDocuments(toSave, includeBoards = false) {
      if (!toSave.length && !includeBoards) return true;
      if (includeBoards) await boardManager.waitPending();
      const payload = [];
      for (const doc of toSave) {
        try { await ensureLoaded(doc); } catch (err) { error.textContent = '문서를 불러오지 못했습니다: ' + err.message; return false; }
        const value = snapshot(doc), title = value.title.trim();
        if (!title || title.length > 200) { error.textContent = '문서 제목을 1~200자로 입력해 주세요.'; if (!doc.expanded) expand(doc,true); doc.element.scrollIntoView({block:'nearest'}); doc.element.querySelector('.doc-title').focus(); return false; }
        payload.push({id:doc.id,parentId:doc.parentId || null,title,schemaVersion:1,content:value.content});
      }
      const ids = new Set(toSave.map(doc => doc.id));
      const orderIds = docs.filter(doc => doc.saved || ids.has(doc.id)).map(doc => doc.id);
      const command={op:'documents-save',kind:'project',id:project.id,documents:payload,orderIds};
      if (includeBoards) command.boards=boardManager.snapshot();
      if (!(await run(command))) return false;
      if (includeBoards) boardManager.committed();
      for (const doc of toSave) { const payloadItem = payload.find(d => d.id === doc.id); doc.saved = true; doc.title = payloadItem.title; doc.content = structuredClone(payloadItem.content); doc.element.querySelector('.doc-title').value = doc.title; doc.baseline = JSON.stringify({title:doc.title,content:doc.content}); displayState(doc); }
      return true;
    }
    async function reorder(doc, direction) {
      const siblings=docs.filter(x => (x.parentId || null)===(doc.parentId || null));
      const neighbor=siblings[siblings.indexOf(doc)+direction]; if(!neighbor)return;
      const a=docs.indexOf(doc),b=docs.indexOf(neighbor);[docs[a],docs[b]]=[docs[b],docs[a]];refreshOrder();
      const orderIds=docs.filter(x=>x.saved).map(x=>x.id);
      if (doc.saved && neighbor.saved && !(await run({op:'documents-save',kind:'project',id:project.id,documents:[],orderIds}))) { [docs[a],docs[b]]=[docs[b],docs[a]];refreshOrder(); }
    }
    async function remove(doc) {
      const confirmed = await ask({title:'문서 삭제',description:`“${doc.title || '제목 없는 문서'}”을(를) 삭제하시겠습니까?`,confirm:true});
      if (!confirmed) return;
      if (doc.saved && !(await run({op:'documents-delete',kind:'project',id:project.id,documentId:doc.id}))) return;
      closeEditor(doc); docs = docs.filter(x => x !== doc); doc.element.remove(); refreshEmpty();
    }
    function makeCard(doc) {
      const card = document.createElement('section'); card.className = 'project-doc'; card.dataset.docId = doc.id;
      card.innerHTML = `<div class="project-doc-head"><span class="project-drag-handle doc-drag-handle" title="드래그하여 문서 이동" aria-label="문서 이동">⋮⋮</span><button type="button" class="doc-toggle" aria-label="문서 펼치기" aria-expanded="false">▸</button><input class="doc-title" aria-label="문서 제목" maxlength="200"><span class="project-doc-state"></span><button type="button" class="doc-up" aria-label="문서 위로">↑</button><button type="button" class="doc-down" aria-label="문서 아래로">↓</button><button type="button" class="doc-save">저장</button><button type="button" class="doc-delete">삭제</button></div><div class="project-doc-body" hidden><div class="toolbar project-editor-toolbar"><button type="button" data-doc-format="paragraph">본문</button><button type="button" data-doc-format="heading">제목</button><button type="button" data-doc-format="bold"><b>굵게</b></button><button type="button" data-doc-format="bullet">글머리</button><button type="button" data-doc-format="ordered">번호</button><button type="button" data-doc-format="task">체크리스트</button><button type="button" data-doc-format="link">링크</button></div><div class="project-editor"></div></div>`;
      doc.element = card; card.querySelector('.doc-title').value = doc.title;
      card.querySelector('.doc-title').addEventListener('input',event => { doc.title=event.target.value; displayState(doc); },{signal});
      card.querySelector('.doc-toggle').addEventListener('click',() => expand(doc,!doc.expanded),{signal});
      card.querySelector('.doc-up').addEventListener('click',() => reorder(doc,-1),{signal}); card.querySelector('.doc-down').addEventListener('click',() => reorder(doc,1),{signal});
      card.querySelector('.doc-save').addEventListener('click',() => saveDocuments([doc]),{signal}); card.querySelector('.doc-delete').addEventListener('click',() => remove(doc),{signal});
      const toolbar = card.querySelector('.project-editor-toolbar'); toolbar.addEventListener('mousedown',event => event.preventDefault(),{signal});
      toolbar.addEventListener('click',event => { const command=event.target.closest('[data-doc-format]')?.dataset.docFormat; if(command) formatCommand(doc,command); },{signal});
      displayState(doc); return card;
    }
    function add(content) {
      const doc = {id:crypto.randomUUID(),parentId:selectedFolder,title:'',content:structuredClone(content),loaded:true,version:1,saved:false,expanded:false,baseline:'',editor:null,element:null};
      docs.push(doc); list.append(makeCard(doc)); const folder=folders.find(f=>f.id===selectedFolder);if(folder)folder.expanded=true; refreshOrder(); expand(doc,true);
      doc.element.scrollIntoView({block:'end'}); doc.element.querySelector('.doc-title').focus();
    }
    function selectTab(board) {
      document.querySelector('#project-doc-scroll').hidden=board; document.querySelector('#project-board-panel').hidden=!board;
      document.querySelector('#project-doc-add').hidden=board; document.querySelector('#project-folder-add').hidden=board;
      document.querySelector('#project-tab-docs').setAttribute('aria-selected',String(!board)); document.querySelector('#project-tab-board').setAttribute('aria-selected',String(board));
    }
    async function addFolder(parentId) {
      const label=await ask({title:'폴더 만들기',value:'새 폴더'});if(label===null)return;
      const folderId=crypto.randomUUID();
      if(!(await run({op:'doc-folder-create',kind:'project',id:project.id,folderId,parentId:parentId || null,name:label})))return;
      const created=data.projectDocumentFolders.find(x=>x.id===folderId),folder={...created,expanded:true,element:null};
      const parent=folders.find(x=>x.id===parentId);if(parent)parent.expanded=true;
      folders.push(folder);list.append(makeFolder(folder));selectedFolder=folderId;refreshOrder();
    }
    function makeFolder(folder) {
      const row=document.createElement('div');row.className='project-folder';row.dataset.folderId=folder.id;
      row.innerHTML=`<span class="project-drag-handle folder-drag-handle" title="드래그하여 폴더 이동" aria-label="폴더 이동">⋮⋮</span><button type="button" class="folder-toggle" aria-label="폴더 접기" aria-expanded="true">▾</button><button type="button" class="project-folder-name"></button><button type="button" class="folder-add" aria-label="하위 폴더 추가">+ 폴더</button><button type="button" class="folder-rename">이름</button><button type="button" class="folder-delete">삭제</button>`;
      folder.element=row;row.querySelector('.project-folder-name').textContent='📁 '+folder.name;
      row.querySelector('.folder-toggle').addEventListener('click',()=>{folder.expanded=!folder.expanded;const button=row.querySelector('.folder-toggle');button.textContent=folder.expanded?'▾':'▸';button.setAttribute('aria-expanded',String(folder.expanded));button.setAttribute('aria-label',folder.expanded?'폴더 접기':'폴더 펼치기');refreshOrder();},{signal});
      row.querySelector('.project-folder-name').addEventListener('click',()=>{selectedFolder=folder.id;refreshOrder();},{signal});
      row.querySelector('.folder-add').addEventListener('click',()=>addFolder(folder.id),{signal});
      row.querySelector('.folder-rename').addEventListener('click',async()=>{
        const label=await ask({title:'폴더 이름 변경',value:folder.name});if(label===null)return;
        if(await run({op:'doc-folder-rename',kind:'project',id:project.id,folderId:folder.id,name:label})){folder.name=label.trim();row.querySelector('.project-folder-name').textContent='📁 '+folder.name;}
      },{signal});
      row.querySelector('.folder-delete').addEventListener('click',async()=>{
        const ids=domain.descendants(folders,folder.id),count=docs.filter(doc=>ids.has(doc.parentId)).length;
        if(!await ask({title:'폴더 삭제',description:`“${folder.name}” 및 하위 폴더 ${ids.size-1}개, 문서 ${count}개를 삭제하시겠습니까?`,confirm:true}))return;
        if(!(await run({op:'doc-folder-delete',kind:'project',id:project.id,folderId:folder.id})))return;
        for(const doc of docs.filter(entry=>ids.has(entry.parentId))){closeEditor(doc);doc.element.remove();}
        docs=docs.filter(doc=>!ids.has(doc.parentId));for(const entry of folders.filter(f=>ids.has(f.id)))entry.element.remove();folders=folders.filter(f=>!ids.has(f.id));if(ids.has(selectedFolder))selectedFolder=null;refreshOrder();
      },{signal});
      return row;
    }
    function installDrag() {
      const scroll=document.querySelector('#project-doc-scroll'),root=scroll.querySelector('.project-doc-root');
      let pending=null,target=null,active=false;
      function clear() { scroll.querySelectorAll('.project-doc-drop-inside,.project-doc-drop-before,.project-doc-drop-after').forEach(el=>el.classList.remove('project-doc-drop-inside','project-doc-drop-before','project-doc-drop-after')); }
      function reset(){pending=null;target=null;active=false;clear();}
      scroll.addEventListener('pointerdown',event=>{
        const handle=event.target.closest('.project-drag-handle');if(!handle || event.button!==0 || saving)return;
        const card=handle.closest('.project-doc'),folder=handle.closest('.project-folder');
        pending={pointerId:event.pointerId,x:event.clientX,y:event.clientY,type:card?'doc':'folder',id:card?.dataset.docId || folder?.dataset.folderId};
      },{signal});
      scroll.addEventListener('pointermove',event=>{
        if(!pending || event.pointerId!==pending.pointerId)return;
        if(!active && Math.hypot(event.clientX-pending.x,event.clientY-pending.y)<6)return;
        if(!active){active=true;scroll.setPointerCapture(event.pointerId);}event.preventDefault();clear();target=null;
        const el=document.elementFromPoint(event.clientX,event.clientY),folder=el?.closest('.project-folder'),card=el?.closest('.project-doc');
        if(el?.closest('.project-doc-root')) target={parentId:null,element:root,placement:'inside'};
        else if(folder){const id=folder.dataset.folderId;if(pending.type!=='folder' || !domain.descendants(folders,pending.id).has(id)) target={parentId:id,element:folder,placement:'inside'};}
        else if(card && pending.type==='doc' && card.dataset.docId!==pending.id){const other=docs.find(doc=>doc.id===card.dataset.docId),r=card.querySelector('.project-doc-head').getBoundingClientRect();if(other)target={parentId:other.parentId || null,otherId:other.id,element:card,placement:event.clientY < r.top+r.height/2?'before':'after'};}
        if(target)target.element.classList.add('project-doc-drop-'+target.placement);
        const r=scroll.getBoundingClientRect();if(event.clientY>r.bottom-25)scroll.scrollTop+=18;else if(event.clientY<r.top+25)scroll.scrollTop-=18;
      },{signal});
      scroll.addEventListener('pointerup',async event=>{
        if(!pending || event.pointerId!==pending.pointerId)return;const source=pending,dest=target,wasActive=active;reset();if(!wasActive || !dest)return;
        if(source.type==='folder'){
          const folder=folders.find(f=>f.id===source.id);if(!folder || folder.parentId===(dest.parentId || null))return;
          if(await run({op:'doc-folder-move',kind:'project',id:project.id,folderId:folder.id,parentId:dest.parentId})){folder.parentId=dest.parentId || null;const parent=folders.find(f=>f.id===dest.parentId);if(parent)parent.expanded=true;refreshOrder();}
          return;
        }
        const doc=docs.find(x=>x.id===source.id);if(!doc)return;const previous=[...docs],oldParent=doc.parentId;
        doc.parentId=dest.parentId || null;docs.splice(docs.indexOf(doc),1);
        if(dest.otherId){const other=docs.find(x=>x.id===dest.otherId);docs.splice(docs.indexOf(other)+(dest.placement==='after'?1:0),0,doc);}else docs.push(doc);
        const parent=folders.find(f=>f.id===dest.parentId);if(parent)parent.expanded=true;refreshOrder();
        if(doc.saved && !(await run({op:'documents-move',kind:'project',id:project.id,documentId:doc.id,parentId:doc.parentId,orderIds:docs.filter(x=>x.saved).map(x=>x.id)}))){doc.parentId=oldParent;docs=previous;refreshOrder();}
      },{signal});
      scroll.addEventListener('pointercancel',event=>{if(pending?.pointerId===event.pointerId)reset();},{signal});scroll.addEventListener('lostpointercapture',event=>{if(pending?.pointerId===event.pointerId)reset();},{signal});
      scroll.addEventListener('keydown',event=>{if(event.key==='Escape' && pending){event.preventDefault();reset();}},{signal});
    }
    function finish() {
      events.abort(); boardManager.destroy(); for (const doc of docs) closeEditor(doc); list.replaceChildren(); dialog.close();
      const target = document.querySelector(`[data-action="detail-project"][data-id="${CSS.escape(project.id)}"]`); if (target) target.focus(); resolve();
    }
    async function close() {
      if (saving) return;
      saving = true; dialog.inert = true;
      try { await boardManager.waitPending(); } finally { saving = false; dialog.inert = false; }
      const changed = docs.filter(dirty), boardDirty=boardManager.dirty(); if (!changed.length && !boardDirty) { finish(); return; }
      const choice = await new Promise(done => {
        const confirm = document.querySelector('#discard-dialog');
        const select = value => { confirm.close(); done(value); };
        document.querySelector('#discard-continue').onclick = () => select('continue'); document.querySelector('#discard-changes').onclick = () => select('discard'); document.querySelector('#discard-save').onclick = () => select('save');
        confirm.oncancel = event => { event.preventDefault(); select('continue'); }; confirm.showModal();
      });
      if (choice === 'discard') finish(); else if (choice === 'save' && await saveDocuments(changed,boardDirty)) finish();
    }
    list.replaceChildren(); document.querySelector('#project-detail-title').textContent = project.name + ' · 프로젝트 상세'; error.textContent = '';
    docs.forEach(doc => list.append(makeCard(doc))); folders.forEach(folder=>list.append(makeFolder(folder))); refreshOrder();
    boardManager=createProjectBoards(project,signal,()=>saveDocuments([],true));
    document.querySelector('#project-doc-add').addEventListener('click',() => add(blank),{signal});
    document.querySelector('#project-folder-add').addEventListener('click',() => addFolder(selectedFolder),{signal});
    document.querySelector('.project-doc-root').addEventListener('click',()=>{selectedFolder=null;refreshOrder();},{signal});
    document.querySelector('#project-tab-docs').addEventListener('click',()=>selectTab(false),{signal});
    document.querySelector('#project-tab-board').addEventListener('click',()=>selectTab(true),{signal});
    document.querySelector('#project-detail-close').addEventListener('click',close,{signal}); dialog.oncancel = event => { event.preventDefault(); close(); };
    installDrag(); selectTab(false); dialog.showModal(); document.querySelector('#project-doc-scroll').scrollTop = 0;
  });
}
