(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.domain = factory();
})(globalThis, () => {
  const find = (list, id) => list.find(x => x.id === id);
  function normalize(data) {
    return { ...data, folders: data.folders || [], projects: data.projects || [], workItems: data.workItems || [], documents: data.documents || [], projectDocumentFolders:data.projectDocumentFolders || [] };
  }
  function name(value) {
    value = (value || '').trim();
    if (!value || value.length > 200) throw new Error('이름을 1~200자로 입력해 주세요.');
    return value;
  }
  function descendants(list, id) {
    const ids = new Set([id]);
    let previous;
    do { previous = ids.size; list.forEach(x => { if (ids.has(x.parentId)) ids.add(x.id); }); } while (ids.size !== previous);
    return ids;
  }
  function parent(list, parentId, id, projectId) {
    if (!parentId) return null;
    const target = find(list, parentId);
    if (!target || (projectId && (target.projectId !== projectId || target.type !== 'group'))) throw new Error('올바른 상위 항목을 선택해 주세요.');
    if (id && descendants(list, id).has(parentId)) throw new Error('자신이나 하위 항목으로 이동할 수 없습니다.');
    return parentId;
  }
  function unusedBarColor(items) {
    const used = new Set(items.map(item => /^#[0-9a-fA-F]{6}$/.test(item.barColor || '') ? item.barColor.toLowerCase() : item.type === 'group' ? '#526a8f' : '#6f95df'));
    const range = 96, total = range ** 3, start = Math.floor(Math.random() * total);
    for (let offset = 0; offset < total; offset++) {
      const value = (start + offset) % total;
      const color = '#' + [Math.floor(value / (range * range)), Math.floor(value / range) % range, value % range].map(channel => (channel + 160).toString(16)).join('');
      if (!used.has(color)) return color;
    }
    throw new Error('사용 가능한 막대 색상이 없습니다.');
  }
  function inheritedLock(items, item) {
    const seen = new Set(); let parentId = item.parentId;
    while (parentId && !seen.has(parentId)) {
      seen.add(parentId); const ancestor = find(items, parentId);
      if (!ancestor || ancestor.projectId !== item.projectId) break;
      if (ancestor.isScheduleLocked) return true;
      parentId = ancestor.parentId;
    }
    return false;
  }
  function isLocked(items, item) { return !!item.isScheduleLocked || inheritedLock(items, item); }
  function inheritedCompletion(items, item) {
    const seen = new Set(); let parentId = item.parentId;
    while (parentId && !seen.has(parentId)) {
      seen.add(parentId); const ancestor = find(items, parentId);
      if (!ancestor || ancestor.projectId !== item.projectId) break;
      if (ancestor.isCompleted) return true;
      parentId = ancestor.parentId;
    }
    return false;
  }
  function isCompleted(items, item) { return !!item.isCompleted || inheritedCompletion(items, item); }
  function dates(item, startValue, endValue, locked = item.isScheduleLocked) {
    const start = startValue || null, end = endValue || null;
    const valid = value => /^\d{4}-\d{2}-\d{2}$/.test(value) && !value.startsWith('0000') && Number.isFinite(Date.parse(value + 'T00:00:00Z')) && new Date(value + 'T00:00:00Z').toISOString().slice(0, 10) === value;
    if ((start || end) && (!start || !end || !valid(start) || !valid(end) || start > end)) throw new Error('올바른 시작일과 종료일을 입력해 주세요.');
    if (locked && (start !== (item.startDate || null) || end !== (item.endDate || null))) throw new Error('일정이 잠겨 있습니다.');
    item.startDate = start; item.endDate = end;
  }
  function shiftDates(item, days) {
    if (item.isScheduleLocked) throw new Error('일정이 잠겨 있습니다.');
    if (!Number.isInteger(days) || !item.startDate || !item.endDate) throw new Error('이동할 수 없는 일정입니다.');
    const unit = 86400000, start = Date.parse(item.startDate + 'T00:00:00Z') / unit + days, end = Date.parse(item.endDate + 'T00:00:00Z') / unit + days;
    if (start < -719162 || end > 2932896 || !Number.isFinite(start) || !Number.isFinite(end)) throw new Error('지원하는 날짜 범위를 벗어납니다.');
    return {startDate:new Date(start * unit).toISOString().slice(0,10), endDate:new Date(end * unit).toISOString().slice(0,10)};
  }
  function validateDocument(document) {
    if (!document || document.schemaVersion !== 1 || document.content?.type !== 'doc') throw new Error('문서 형식이 올바르지 않습니다.');
    function check(node) {
      if (!node || typeof node !== 'object') throw new Error('문서 형식이 올바르지 않습니다.');
      if (node.type === 'link' && !/^(https?:|mailto:)/i.test(node.attrs?.href || '')) throw new Error('링크는 http, https 또는 mailto 주소만 사용할 수 있습니다.');
      for (const child of [...(node.content || []), ...(node.marks || [])]) check(child);
    }
    check(document.content);
  }
  function validateNotes(notes) {
    if (!Array.isArray(notes)) throw new Error('메모 형식이 올바르지 않습니다.');
    const ids = new Set();
    for (const note of notes) {
      if (!note || typeof note.id !== 'string' || !note.id || ids.has(note.id) || (note.type === 'image' ? typeof note.dataUrl !== 'string' || !/^data:image\/(png|jpeg|webp|gif);base64,[A-Za-z0-9+/]+={0,2}$/i.test(note.dataUrl) : typeof note.text !== 'string') || (note.title !== undefined && (typeof note.title !== 'string' || note.title.length > 200)) || ![note.x,note.y,note.width,note.height,note.z].every(Number.isFinite) || note.width < 120 || note.height < 100) throw new Error('메모 형식이 올바르지 않습니다.');
      ids.add(note.id);
    }
  }
  function projectFolder(data, projectId, parentId, movingId = null) {
    if (!parentId) return null;
    const target = find(data.projectDocumentFolders,parentId);
    if (!target || target.projectId !== projectId) throw new Error('같은 프로젝트의 폴더를 선택해 주세요.');
    if (movingId && descendants(data.projectDocumentFolders,movingId).has(parentId)) throw new Error('자신이나 하위 폴더로 이동할 수 없습니다.');
    return parentId;
  }
  function validateBoards(boards) {
    if (!Array.isArray(boards)) throw new Error('보드 형식이 올바르지 않습니다.');
    const ids = new Set();
    for (const board of boards) {
      if (!board || typeof board.id !== 'string' || !board.id || ids.has(board.id)) throw new Error('보드 식별자가 올바르지 않습니다.');
      ids.add(board.id); name(board.name); validateNotes(board.notes);
    }
  }
  function saveProjectDocuments(data, projectId, documents, orderIds) {
    if (!Array.isArray(documents) || !Array.isArray(orderIds)) throw new Error('문서 저장 요청이 올바르지 않습니다.');
    const ids = new Set();
    for (const draft of documents) {
      if (!draft || typeof draft.id !== 'string' || !draft.id || ids.has(draft.id)) throw new Error('문서 식별자가 올바르지 않습니다.');
      ids.add(draft.id); const title = name(draft.title); validateDocument(draft);
      const existing = find(data.documents, draft.id);
      if (existing && (existing.projectId !== projectId || existing.workItemId)) throw new Error('다른 프로젝트의 문서는 수정할 수 없습니다.');
      const now = new Date().toISOString();
      const parentId = draft.parentId !== undefined ? projectFolder(data,projectId,draft.parentId) : existing?.parentId || null;
      if (existing) { existing.title = title; existing.content = draft.content; existing.schemaVersion = draft.schemaVersion; existing.parentId = parentId; existing.updatedAt = now; }
      else data.documents.push({id:draft.id, projectId, parentId, title, schemaVersion:draft.schemaVersion, content:draft.content, createdAt:now, updatedAt:now});
    }
    const projectDocs = data.documents.filter(doc => doc.projectId === projectId && !doc.workItemId);
    if (orderIds.length !== projectDocs.length || new Set(orderIds).size !== orderIds.length || orderIds.some(id => !projectDocs.some(doc => doc.id === id))) throw new Error('문서 순서가 올바르지 않습니다.');
    orderIds.forEach((id, index) => { find(projectDocs,id).sortOrder = index; });
  }
  function apply(input, action) {
    const data = normalize(structuredClone(input));
    const { kind, op, id } = action;
    const list = kind === 'folder' ? data.folders : kind === 'project' ? data.projects : data.workItems;
    const item = find(list, id);
    if (!['folder', 'project', 'work'].includes(kind)) throw new Error('알 수 없는 항목입니다.');
    if (op !== 'create' && !item) throw new Error('항목을 찾을 수 없습니다.');
    if (op === 'create') {
      if (!id || find(data.folders, id) || find(data.projects, id) || find(data.workItems, id)) throw new Error('항목 식별자가 잘못되었습니다.');
      const label = name(action.name);
      if (kind === 'folder') list.push({ id, name: label, parentId: parent(data.folders, action.parentId) });
      if (kind === 'project') list.push({ id, name: label, parentId: parent(data.folders, action.parentId) });
      if (kind === 'work') {
        if (!find(data.projects, action.projectId) || !['group', 'task'].includes(action.type)) throw new Error('프로젝트 또는 작업 종류가 잘못되었습니다.');
        list.push({ id, name: label, type: action.type, projectId: action.projectId, parentId: parent(data.workItems, action.parentId, null, action.projectId), ...(action.type === 'task' ? {isScheduleLocked:false,barColor:unusedBarColor(data.workItems)} : {}) });
      }
    } else if (op === 'rename') item.name = name(action.name);
    else if (op === 'schedule') {
      if (kind !== 'work' || item.type !== 'task') throw new Error('작업 날짜만 변경할 수 있습니다.');
      if (action.expected && ((item.startDate || null) !== action.expected.startDate || (item.endDate || null) !== action.expected.endDate)) throw new Error('일정이 변경되어 되돌리거나 다시 실행할 수 없습니다.');
      dates(item, action.startDate, action.endDate, isLocked(data.workItems, item));
    } else if (op === 'shift') {
      if (kind !== 'work' || item.type !== 'task') throw new Error('작업 일정만 이동할 수 있습니다.');
      if (isLocked(data.workItems, item)) throw new Error('일정이 잠겨 있습니다.');
      const shifted = shiftDates(item, action.days); dates(item, shifted.startDate, shifted.endDate, false);
    } else if (op === 'complete') {
      if (kind !== 'work' || !['task','group'].includes(item.type) || typeof action.completed !== 'boolean') throw new Error('작업 완료 상태가 올바르지 않습니다.');
      if (inheritedCompletion(data.workItems, item)) throw new Error('상위 그룹이 완료되어 상태를 변경할 수 없습니다.');
      item.isCompleted = action.completed;
    } else if (op === 'lock') {
      if (kind !== 'work' || !['task','group'].includes(item.type) || typeof action.locked !== 'boolean') throw new Error('작업의 잠금 상태가 올바르지 않습니다.');
      item.isScheduleLocked = action.locked;
    } else if (op === 'detail') {
      if (kind !== 'work') throw new Error('작업만 편집할 수 있습니다.');
      item.name = name(action.name);
      if (typeof action.overview !== 'string' || action.overview.length > 2000 || typeof action.hoverSummary !== 'string' || action.hoverSummary.length > 500) throw new Error('개요 또는 요약의 길이를 확인해 주세요.');
      item.overview = action.overview; item.hoverSummary = action.hoverSummary;
      if (action.comments !== undefined) {
        if (!Array.isArray(action.comments)) throw new Error('코멘트 형식이 올바르지 않습니다.');
        const ids = new Set();
        for (const comment of action.comments) {
          if (!comment || typeof comment.id !== 'string' || !comment.id || ids.has(comment.id) || typeof comment.text !== 'string' || !comment.text.trim() || comment.text.length > 200 || /[\r\n]/.test(comment.text) || typeof comment.createdAt !== 'string' || !Number.isFinite(Date.parse(comment.createdAt))) throw new Error('코멘트 형식이 올바르지 않습니다.');
          ids.add(comment.id);
        }
        item.comments = action.comments;
      }
      if (action.barColor !== undefined) {
        if (typeof action.barColor !== 'string' || !/^#[0-9a-fA-F]{6}$/.test(action.barColor)) throw new Error('막대 색상이 올바르지 않습니다.');
        item.barColor = action.barColor.toLowerCase();
      }
      if (item.type === 'task') dates(item, action.startDate, action.endDate, isLocked(data.workItems, item));
      if (action.boards !== undefined || action.taskDocuments !== undefined) {
        if (!Array.isArray(action.boards) || !Array.isArray(action.taskDocuments)) throw new Error('보드 또는 문서 형식이 올바르지 않습니다.');
        const boardIds = new Set(), documentIds = new Set();
        for (const board of action.boards) {
          if (!board || typeof board.id !== 'string' || !board.id || boardIds.has(board.id)) throw new Error('보드 식별자가 올바르지 않습니다.');
          boardIds.add(board.id); board.name = name(board.name); validateNotes(board.notes);
        }
        for (const doc of action.taskDocuments) {
          if (!doc || typeof doc.id !== 'string' || !doc.id || documentIds.has(doc.id)) throw new Error('작업 문서 식별자가 올바르지 않습니다.');
          documentIds.add(doc.id); doc.name = name(doc.name); validateDocument(doc);
        }
        item.boards = action.boards; item.taskDocuments = action.taskDocuments;
        delete item.notes; delete item.document;
      } else if (action.notes !== undefined || action.document !== undefined) {
        if (!action.document) throw new Error('문서 형식이 올바르지 않습니다.');
        validateNotes(action.notes); validateDocument(action.document);
        item.notes = action.notes; item.document = action.document;
      }
    }
    else if (op === 'move') {
      if (kind === 'work' && action.targetId) {
        const target = find(list, action.targetId);
        if (!target || target.projectId !== item.projectId || !['before','after','inside'].includes(action.placement)) throw new Error('이동 위치가 올바르지 않습니다.');
        if (action.placement === 'inside' && target.type !== 'group') throw new Error('그룹 안으로만 이동할 수 있습니다.');
        const destination = action.placement === 'inside' ? target.id : target.parentId;
        parent(data.workItems, destination, id, item.projectId);
        if (target.id === id || descendants(list, id).has(target.id)) throw new Error('자신이나 하위 항목으로 이동할 수 없습니다.');
        item.parentId = destination || null;
        list.splice(list.indexOf(item), 1);
        if (action.placement === 'inside') list.push(item);
        else list.splice(list.indexOf(target) + (action.placement === 'after' ? 1 : 0), 0, item);
      } else {
        item.parentId = kind === 'folder' ? parent(data.folders, action.parentId, id) : kind === 'project' ? parent(data.folders, action.parentId) : parent(data.workItems, action.parentId, id, item.projectId);
        list.splice(list.indexOf(item), 1); list.push(item);
      }
    } else if (op === 'reorder') {
      if (kind !== 'work' || ![-1, 1].includes(action.direction)) throw new Error('정렬 방향이 잘못되었습니다.');
      const siblings = list.filter(x => x.projectId === item.projectId && x.parentId === item.parentId);
      const next = siblings[siblings.indexOf(item) + action.direction];
      if (next) { const a = list.indexOf(item), b = list.indexOf(next); [list[a], list[b]] = [list[b], list[a]]; }
    } else if (op === 'documents-save') {
      if (kind !== 'project') throw new Error('프로젝트 문서 명령이 아닙니다.');
      saveProjectDocuments(data, id, action.documents, action.orderIds);
      if (action.boards !== undefined) { validateBoards(action.boards); item.boards = action.boards; }
    } else if (op === 'documents-move') {
      if (kind !== 'project') throw new Error('프로젝트 문서 명령이 아닙니다.');
      const doc = find(data.documents,action.documentId);
      if (!doc || doc.projectId !== id || doc.workItemId) throw new Error('프로젝트 문서를 찾을 수 없습니다.');
      doc.parentId = projectFolder(data,id,action.parentId);
      saveProjectDocuments(data,id,[],action.orderIds);
    } else if (op === 'doc-folder-create') {
      if (kind !== 'project' || typeof action.folderId !== 'string' || !action.folderId || find(data.projectDocumentFolders,action.folderId)) throw new Error('폴더 식별자가 올바르지 않습니다.');
      data.projectDocumentFolders.push({id:action.folderId,projectId:id,parentId:projectFolder(data,id,action.parentId),name:name(action.name)});
    } else if (op === 'doc-folder-rename') {
      const folder = find(data.projectDocumentFolders,action.folderId);
      if (kind !== 'project' || !folder || folder.projectId !== id) throw new Error('프로젝트 폴더를 찾을 수 없습니다.');
      folder.name=name(action.name);
    } else if (op === 'doc-folder-move') {
      const folder = find(data.projectDocumentFolders,action.folderId);
      if (kind !== 'project' || !folder || folder.projectId !== id) throw new Error('프로젝트 폴더를 찾을 수 없습니다.');
      folder.parentId=projectFolder(data,id,action.parentId,folder.id);
    } else if (op === 'doc-folder-delete') {
      const folder=find(data.projectDocumentFolders,action.folderId);
      if (kind !== 'project' || !folder || folder.projectId !== id) throw new Error('프로젝트 폴더를 찾을 수 없습니다.');
      const ids=descendants(data.projectDocumentFolders,folder.id);
      data.projectDocumentFolders=data.projectDocumentFolders.filter(x=>!ids.has(x.id));
      data.documents=data.documents.filter(x=>!(x.projectId===id && ids.has(x.parentId)));
    } else if (op === 'documents-delete') {
      if (kind !== 'project') throw new Error('프로젝트 문서 명령이 아닙니다.');
      const doc = find(data.documents, action.documentId);
      if (!doc || doc.projectId !== id || doc.workItemId) throw new Error('프로젝트 문서를 찾을 수 없습니다.');
      data.documents = data.documents.filter(x => x.id !== doc.id);
    } else if (op === 'delete') {
      let projectIds = new Set(), workIds = new Set();
      if (kind === 'folder') {
        const ids = descendants(data.folders, id);
        data.folders = data.folders.filter(x => !ids.has(x.id));
        data.projects.filter(x => ids.has(x.parentId)).forEach(x => projectIds.add(x.id));
      } else if (kind === 'project') projectIds.add(id);
      else workIds = descendants(data.workItems, id);
      data.workItems.filter(x => projectIds.has(x.projectId)).forEach(x => workIds.add(x.id));
      data.projectDocumentFolders = data.projectDocumentFolders.filter(x => !projectIds.has(x.projectId));
      data.projects = data.projects.filter(x => !projectIds.has(x.id));
      data.workItems = data.workItems.filter(x => !workIds.has(x.id));
      data.documents = data.documents.filter(x => !projectIds.has(x.projectId) && !workIds.has(x.workItemId));
    } else throw new Error('알 수 없는 명령입니다.');
    return data;
  }
  function numbered(data, projectId) {
    const result = [];
    function visit(parentId, prefix, depth) {
      const siblings = data.workItems.filter(x => x.projectId === projectId && (x.parentId || null) === parentId);
      siblings.forEach((item, index) => { const number = prefix ? `${prefix}.${index + 1}` : `${index + 1}`; result.push({ item, number, depth }); if (item.type === 'group') visit(item.id, number, depth + 1); });
    }
    visit(null, '', 0); return result;
  }
  return { normalize, apply, descendants, numbered, shiftDates, isLocked, inheritedLock, isCompleted, inheritedCompletion };
});
