function openProjectOverview(project) {
  return new Promise(resolve => {
    const dialog=$('#project-overview-dialog'),tree=$('#overview-tree'),content=$('#overview-content'),error=$('#overview-error');
    const events=new AbortController(),signal=events.signal, rows=domain.numbered(data,project.id), byId=new Map(rows.map(row=>[row.item.id,row]));
    const collapsed=new Set(), collapsedSections=new Set(), editors=[];
    let sectionContent=content;
    let selected=byId.has(projectView(project.id).selected) ? projectView(project.id).selected : rows[0]?.item.id || null, moving=false;
    function clearContent() { while(editors.length)editors.pop().destroy();content.replaceChildren(); }
    function visible(item) { let parent=item.parentId;while(parent){if(collapsed.has(parent))return false;parent=byId.get(parent)?.item.parentId;}return true; }
    function drawTree() {
      tree.replaceChildren();
      if(!rows.length){const p=document.createElement('p');p.className='empty';p.textContent='작업이 없습니다.';tree.append(p);return;}
      for(const row of rows.filter(x=>visible(x.item))){
        const item=row.item,line=document.createElement('div');line.className='overview-tree-row'+(item.id===selected?' selected':'');line.style.paddingLeft=`${row.depth*16}px`;
        if(item.type==='group'){
          const toggle=document.createElement('button');toggle.type='button';toggle.className='overview-toggle';toggle.textContent=collapsed.has(item.id)?'▸':'▾';toggle.setAttribute('aria-expanded',String(!collapsed.has(item.id)));toggle.setAttribute('aria-label',collapsed.has(item.id)?'그룹 펼치기':'그룹 접기');
          toggle.addEventListener('click',()=>{if(collapsed.has(item.id))collapsed.delete(item.id);else collapsed.add(item.id);drawTree();},{signal});line.append(toggle);
        }else{const spacer=document.createElement('span');spacer.className='overview-tree-spacer';line.append(spacer);}
        const button=document.createElement('button');button.type='button';button.className='overview-select';button.dataset.itemId=item.id;button.textContent=`${row.number} ${item.name}`;button.title=item.name;button.setAttribute('aria-current',item.id===selected?'true':'false');
        button.addEventListener('click',()=>{selected=item.id;drawTree();drawContent();const active=tree.querySelector(`[data-item-id="${CSS.escape(item.id)}"]`);if(active)active.focus();},{signal});
        line.append(button);tree.append(line);
      }
    }
    function sectionTitle(key,text) {
      const section=document.createElement('details');section.className='overview-section';section.dataset.section=key;section.open=!collapsedSections.has(key);
      const heading=document.createElement('summary');heading.className='overview-section-title';heading.textContent=text;section.append(heading);
      sectionContent=document.createElement('div');section.append(sectionContent);content.append(section);
      section.addEventListener('toggle',()=>{if(section.open)collapsedSections.delete(key);else collapsedSections.add(key);},{signal});
    }
    function empty(text) { const p=document.createElement('p');p.className='empty';p.textContent=text;sectionContent.append(p); }
    function card(title,cls) {
      const box=document.createElement('section');box.className='overview-card '+cls;const head=document.createElement('div');head.className='overview-card-head';
      const label=document.createElement('span');label.textContent=title;head.append(label);box.append(head);sectionContent.append(box);return {box,head};
    }
    function renderBoard(board) {
      const {box,head}=card(board.name || '노트 보드','overview-board');
      const notes=(board.notes || []).filter(note=>note && [note.x,note.y,note.width,note.height].every(Number.isFinite));
      if(!notes.length){const p=document.createElement('p');p.className='empty';p.style.padding='0 14px';p.textContent='이 보드에는 메모가 없습니다.';box.append(p);return;}
      const tools=document.createElement('div');tools.className='overview-board-tools';
      const out=document.createElement('button'),fit=document.createElement('button'),plus=document.createElement('button');
      for(const button of [out,fit,plus])button.type='button';out.textContent='−';out.setAttribute('aria-label','보드 축소');fit.textContent='맞춤';plus.textContent='+';plus.setAttribute('aria-label','보드 확대');tools.append(out,fit,plus);head.append(tools);
      const viewport=document.createElement('div'),layer=document.createElement('div');viewport.className='overview-board-viewport';viewport.setAttribute('aria-label',(board.name || '노트 보드')+' 미리보기');layer.className='overview-board-layer';viewport.append(layer);box.append(viewport);
      const minX=Math.min(...notes.map(n=>n.x)),minY=Math.min(...notes.map(n=>n.y)),maxX=Math.max(...notes.map(n=>n.x+n.width)),maxY=Math.max(...notes.map(n=>n.y+n.height));
      const width=Math.max(1,maxX-minX),height=Math.max(1,maxY-minY);let scale=1;
      const elements=notes.map(note=>{
        const el=document.createElement('div');el.className='overview-note';el.style.width=note.width+'px';el.style.height=note.height+'px';el.style.zIndex=String(note.z || 0);
        const title=document.createElement('div');title.className='overview-note-title';title.textContent=note.title || (note.type==='image'?'이미지':'메모');el.append(title);
        if(note.type==='image' && /^data:image\/(png|jpeg|webp|gif);base64,/i.test(note.dataUrl || '')){const image=document.createElement('img');image.src=note.dataUrl;image.alt=note.title || '이미지';el.append(image);}
        else {const text=document.createElement('div');text.className='overview-note-text';text.textContent=note.text || '';el.append(text);}
        layer.append(el);return {el,note};
      });
      function draw() { layer.style.width=`${width*scale+32}px`;layer.style.height=`${height*scale+32}px`;for(const {el,note} of elements)el.style.transform=`translate(${(note.x-minX)*scale+16}px, ${(note.y-minY)*scale+16}px) scale(${scale})`; }
      function fitBoard(){scale=Math.max(.05,Math.min(1,(viewport.clientWidth-32)/width,(viewport.clientHeight-32)/height));draw();viewport.scrollLeft=0;viewport.scrollTop=0;}
      out.addEventListener('click',()=>{scale=Math.max(.05,scale/1.25);draw();},{signal});plus.addEventListener('click',()=>{scale=Math.min(2,scale*1.25);draw();},{signal});fit.addEventListener('click',fitBoard,{signal});
      const section=box.closest('details');
      section.addEventListener('toggle',()=>{if(section.open)requestAnimationFrame(()=>{if(viewport.isConnected)fitBoard();});},{signal});
      requestAnimationFrame(()=>{if(viewport.isConnected && section.open)fitBoard();});
    }
    async function goToWork(item) {
      if(moving)return;moving=true;error.textContent='';
      try {
        const ancestors=[];let parent=item.parentId;while(parent){ancestors.push(parent);parent=byId.get(parent)?.item.parentId;}
        const period=timeline.aggregate(data.workItems,project.id).get(item.id),ruler=$('.time-ruler');
        await changeView(v=>{const p=v.projects[project.id] ||= {collapsed:[],selected:null};p.selected=item.id;p.collapsed=(p.collapsed || []).filter(id=>!ancestors.includes(id));if(period?.start != null && ruler && Number.isFinite(p.pixelsPerDay))p.centerDay=timeline.limit(period.start+.5,p.pixelsPerDay,ruler.clientWidth).center;});
        finish(false);const target=document.querySelector(`[data-action="select-work"][data-id="${CSS.escape(item.id)}"]`);if(target){target.scrollIntoView({block:'nearest'});target.focus();}
      }catch(err){error.textContent='작업으로 이동하지 못했습니다: '+err.message;}
      finally { moving=false; }
    }
    function drawContent() {
      clearContent();sectionContent=content;error.textContent='';
      const row=byId.get(selected);if(!row){empty('왼쪽에서 작업을 선택하세요.');return;}
      const item=row.item,header=document.createElement('div');header.className='overview-work-header';
      const title=document.createElement('h2');title.textContent=`${row.number} ${item.name}`;
      const go=document.createElement('button');go.type='button';go.className='overview-go-work';go.textContent='작업으로 이동';go.addEventListener('click',()=>goToWork(item),{signal});header.append(title,go);content.append(header);
      sectionTitle('comments','코멘트');
      const comments=Array.isArray(item.comments)?item.comments:[];
      if(!comments.length)empty('저장된 코멘트가 없습니다.');
      for(const comment of comments){
        const line=document.createElement('div');line.className='overview-comment';
        const text=document.createElement('div');text.className='comment-text';text.textContent=comment.text;
        const time=document.createElement('div');time.className='comment-time';
        const date=new Date(comment.createdAt);time.textContent=Number.isFinite(date.getTime())?new Intl.DateTimeFormat('ko-KR',{dateStyle:'medium',timeStyle:'short'}).format(date):'';
        line.append(text,time);sectionContent.append(line);
      }
      sectionTitle('documents','작업 문서');
      const docs=Array.isArray(item.taskDocuments)?item.taskDocuments:item.document?[{name:'작업 문서 1',...item.document}]:[];
      if(!docs.length)empty('저장된 작업 문서가 없습니다.');
      for(const doc of docs){
        const {box}=card(doc.name || '작업 문서','overview-document');
        if(doc.schemaVersion!==1 || !doc.content){const p=document.createElement('p');p.className='error';p.textContent='지원하지 않는 문서 형식입니다.';box.append(p);continue;}
        const element=document.createElement('div');box.append(element);
        try { const editor=createTaskEditor(element,doc.content);editor.setEditable(false);editors.push(editor); }
        catch { element.className='error';element.textContent='문서를 표시하지 못했습니다.'; }
      }
      sectionTitle('boards','노트 보드');
      const boards=Array.isArray(item.boards)?item.boards:Array.isArray(item.notes)?[{name:'노트 보드 1',notes:item.notes}]:[];
      if(!boards.length)empty('저장된 노트 보드가 없습니다.');
      for(const board of boards)renderBoard(board);
    }
    function finish(restoreFocus=true) { events.abort();clearContent();dialog.close();if(restoreFocus){const target=document.querySelector(`[data-action="overview-project"][data-id="${CSS.escape(project.id)}"]`);if(target)target.focus();}resolve(); }
    $('#overview-title').textContent=project.name+' · 문서 모아보기';error.textContent='';
    $('#overview-close').addEventListener('click',()=>finish(),{signal});dialog.oncancel=event=>{event.preventDefault();finish();};
    dialog.showModal();drawTree();drawContent();
  });
}
