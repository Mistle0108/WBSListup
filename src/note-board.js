window.createNoteBoard = function (initial, previous = null, root = document) {
  const control = id => root === document ? document.querySelector(`#${id}`) : root.querySelector(`[data-board-control="${id}"]`);
  const viewport = control('note-viewport'), layer = control('note-layer');
  const events = new AbortController(), signal = events.signal;
  let notes = structuredClone(previous?.notes || initial || []).map(note => ({...note,title:note.title ?? '메모'})), history = structuredClone(previous?.history || []), selected = previous?.selected || null, scale = previous?.scale ?? 1, ox = previous?.ox ?? 0, oy = previous?.oy ?? 0, drag = null, textBefore = null;
  let active = true; const pending = new Set();
  const snapshot = () => JSON.stringify(notes);
  const push = previous => { if (previous !== snapshot()) history.push(previous); };
  function transform() { layer.style.transform = `translate(${ox}px, ${oy}px) scale(${scale})`; }
  function choose(id) { selected = id; layer.querySelectorAll('.board-note').forEach(el => el.classList.toggle('selected', el.dataset.id === id)); }
  function render() {
    layer.replaceChildren();
    for (const note of notes) {
      const box = document.createElement('div'); box.className = 'board-note'; box.dataset.id = note.id;
      Object.assign(box.style, {left:note.x+'px', top:note.y+'px', width:note.width+'px', height:note.height+'px', zIndex:note.z});
      const handle = document.createElement('div'); handle.className='note-handle';
      const grip = document.createElement('span'); grip.className='note-grip'; grip.textContent='⋮⋮'; grip.title='드래그하여 메모 이동';
      const title = document.createElement('input'); title.className='note-title'; title.type='text'; title.maxLength=200; title.value=note.title; title.placeholder='메모 이름'; title.setAttribute('aria-label','메모 이름'); handle.append(grip,title);
      const remove = document.createElement('button'); remove.type='button'; remove.className='note-delete'; remove.setAttribute('aria-label','메모 삭제'); remove.textContent='×'; handle.append(remove);
      let text;
      if (note.type === 'image') { text = document.createElement('img'); text.className='note-image'; text.src=note.dataUrl; text.alt=note.title || '붙여넣은 이미지'; text.draggable=false; box.classList.add('image-note'); }
      else { text = document.createElement('textarea'); text.value=note.text; text.setAttribute('aria-label','메모 내용'); }
      const resize=document.createElement('button'); resize.type='button'; resize.className='note-resize'; resize.setAttribute('aria-label','메모 크기 조절'); resize.textContent='◢';
      box.append(handle,text,resize); layer.append(box);
    }
    choose(selected); transform();
  }
  function undo() { if (!history.length) return; notes=JSON.parse(history.pop()); selected=null; render(); }
  control('note-add').addEventListener('click', () => {
    const before=snapshot(); const x=(viewport.clientWidth/2-ox)/scale-100, y=(viewport.clientHeight/2-oy)/scale-70;
    const note={id:crypto.randomUUID(),title:'메모',text:'',x,y,width:220,height:160,z:Math.max(0,...notes.map(n=>n.z))+1}; notes.push(note); selected=note.id; push(before); render(); layer.querySelector(`[data-id="${CSS.escape(note.id)}"] textarea`).focus();
  }, {signal});
  control('note-undo').addEventListener('click',undo,{signal});
  control('note-fit').addEventListener('click',()=>{
    if (!notes.length) {scale=1;ox=0;oy=0;transform();return;}
    const minX=Math.min(...notes.map(n=>n.x)),minY=Math.min(...notes.map(n=>n.y)),maxX=Math.max(...notes.map(n=>n.x+n.width)),maxY=Math.max(...notes.map(n=>n.y+n.height));
    scale=Math.max(.2,Math.min(2,(viewport.clientWidth-60)/(maxX-minX),(viewport.clientHeight-60)/(maxY-minY)));
    ox=(viewport.clientWidth-(maxX-minX)*scale)/2-minX*scale; oy=(viewport.clientHeight-(maxY-minY)*scale)/2-minY*scale;transform();
  },{signal});
  viewport.addEventListener('paste',event=>{
    if (event.target.closest('textarea, input, [contenteditable="true"]')) return;
    const images = [...(event.clipboardData?.items || [])].filter(item => item.kind === 'file' && /^image\/(png|jpeg|webp|gif)$/i.test(item.type)).map(item => item.getAsFile()).filter(Boolean);
    if (!images.length) return;
    event.preventDefault();
    const job=(async()=>{ for (const file of images) {
      try {
        const dataUrl = await new Promise((resolve,reject) => { const reader=new FileReader();reader.onload=()=>resolve(reader.result);reader.onerror=()=>reject(reader.error);reader.readAsDataURL(file); });
        const size = await new Promise((resolve,reject) => { const image=new Image();image.onload=()=>resolve({width:image.naturalWidth,height:image.naturalHeight});image.onerror=reject;image.src=dataUrl; });
        if (!active) return;
        const before=snapshot(), ratio=Math.min(1,320/size.width,240/size.height);
        const width=Math.max(120,Math.round(size.width*ratio)),height=Math.max(100,Math.round(size.height*ratio)+30);
        const x=(viewport.clientWidth/2-ox)/scale-width/2,y=(viewport.clientHeight/2-oy)/scale-height/2;
        const note={id:crypto.randomUUID(),type:'image',title:'이미지',dataUrl,x,y,width,height,z:Math.max(0,...notes.map(n=>n.z))+1};
        notes.push(note);selected=note.id;push(before);render();
      } catch { if (active) { const message = root === document ? document.querySelector('#detail-error') : root.querySelector('[data-board-error]'); if(message)message.textContent='이미지를 붙여넣지 못했습니다.'; } }
    } })();
    pending.add(job); job.finally(()=>pending.delete(job));
  },{signal});
  viewport.addEventListener('wheel',event=>{
    if (event.target.closest('textarea, input')) return;
    event.preventDefault(); const rect=viewport.getBoundingClientRect(), x=event.clientX-rect.left,y=event.clientY-rect.top;
    const before=scale;scale=Math.max(.2,Math.min(3,scale*Math.exp(-Math.max(-120,Math.min(120,event.deltaY))*.002)));
    ox=x-(x-ox)*scale/before;oy=y-(y-oy)*scale/before;transform();
  },{signal,passive:false});
  viewport.addEventListener('focusin',event=>{const box=event.target.closest('.board-note');if(box){choose(box.dataset.id);if(event.target.matches('textarea, .note-title'))textBefore=snapshot();}},{signal});
  viewport.addEventListener('focusout',event=>{if(event.target.matches('textarea, .note-title') && textBefore!==null){push(textBefore);textBefore=null;}},{signal});
  viewport.addEventListener('input',event=>{const box=event.target.closest('.board-note');const note=box && notes.find(n=>n.id===box.dataset.id);if(note && event.target.matches('textarea'))note.text=event.target.value;else if(note && event.target.matches('.note-title'))note.title=event.target.value;},{signal});
  viewport.addEventListener('click',event=>{const box=event.target.closest('.board-note');if(!box)return;choose(box.dataset.id);if(event.target.closest('.note-delete')){const before=snapshot();notes=notes.filter(n=>n.id!==box.dataset.id);selected=null;push(before);render();viewport.focus();}},{signal});
  viewport.addEventListener('pointerdown',event=>{
    if(event.button!==0 || event.target.closest('.note-delete, textarea, input'))return;
    const box=event.target.closest('.board-note'), handle=event.target.closest('.note-handle'), resize=event.target.closest('.note-resize');
    if(box && !handle && !resize)return;
    if(box)choose(box.dataset.id);else choose(null);
    const note=box && notes.find(n=>n.id===box.dataset.id);
    drag={id:event.pointerId,x:event.clientX,y:event.clientY,ox,oy,mode:resize?'resize':handle?'move':'pan',note,noteStart:note && {...note},before:snapshot()};
    viewport.setPointerCapture(event.pointerId);viewport.focus();event.preventDefault();
  },{signal});
  viewport.addEventListener('pointermove',event=>{
    if(!drag || event.pointerId!==drag.id)return;
    const dx=event.clientX-drag.x,dy=event.clientY-drag.y;
    if(drag.mode==='pan'){ox=drag.ox+dx;oy=drag.oy+dy;transform();return;}
    if(drag.mode==='move'){drag.note.x=drag.noteStart.x+dx/scale;drag.note.y=drag.noteStart.y+dy/scale;}
    else {drag.note.width=Math.max(120,drag.noteStart.width+dx/scale);drag.note.height=Math.max(100,drag.noteStart.height+dy/scale);}
    const box=layer.querySelector(`[data-id="${CSS.escape(drag.note.id)}"]`);
    Object.assign(box.style,{left:drag.note.x+'px',top:drag.note.y+'px',width:drag.note.width+'px',height:drag.note.height+'px'});
  },{signal});
  viewport.addEventListener('pointerup',event=>{if(drag && event.pointerId===drag.id){if(drag.mode!=='pan')push(drag.before);drag=null;}},{signal});
  const cancel=event=>{if(drag && event.pointerId===drag.id){if(drag.mode!=='pan'){notes=JSON.parse(drag.before);render();} else {ox=drag.ox;oy=drag.oy;transform();}drag=null;}};
  viewport.addEventListener('pointercancel',cancel,{signal});viewport.addEventListener('lostpointercapture',cancel,{signal});
  viewport.addEventListener('keydown',event=>{
    if(event.target.matches('textarea, input, [contenteditable="true"]'))return;
    if((event.ctrlKey||event.metaKey) && event.key.toLowerCase()==='z'){event.preventDefault();undo();}
    else if(event.key==='Delete' && selected){const before=snapshot();notes=notes.filter(n=>n.id!==selected);selected=null;push(before);render();event.preventDefault();}
  },{signal});
  render(); return {waitPending:async()=>{while(pending.size)await Promise.all([...pending]);},getNotes:()=>structuredClone(notes),exportState:()=>({notes:structuredClone(notes),history:structuredClone(history),selected,scale,ox,oy}),destroy:()=>{active=false;events.abort();layer.replaceChildren();}};
};
