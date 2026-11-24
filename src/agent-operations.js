const crypto = require('node:crypto');
const domain = require('./domain');
const revision = data => crypto.createHash('sha256').update(JSON.stringify(data)).digest('hex');
const id = () => crypto.randomUUID();
function applyChanges(storage, expected, changes) {
  let data = storage.loadContent();
  if (revision(data) !== expected) throw new Error('데이터가 조회 이후 변경되었습니다. 다시 조회하고 요청해 주세요.');
  if (!Array.isArray(changes) || !changes.length || changes.length > 100) throw new Error('변경은 1~100개여야 합니다.');
  const results = [];
  const apply = command => { data = domain.apply(data, command); };
  for (const c of changes) {
    if (!c || typeof c !== 'object') throw new Error('변경 형식이 올바르지 않습니다.');
    if (c.action === 'create_project') {
      const newId = c.id || id(); apply({op:'create',kind:'project',id:newId,name:c.name,parentId:c.parentId}); results.push({id:newId});
    } else if (c.action === 'create_work') {
      const newId = c.id || id(); apply({op:'create',kind:'work',id:newId,name:c.name,type:c.type,projectId:c.projectId,parentId:c.parentId});
      if (c.startDate || c.endDate) apply({op:'schedule',kind:'work',id:newId,startDate:c.startDate,endDate:c.endDate});
      results.push({id:newId});
    } else if (c.action === 'rename_work') {
      apply({op:'rename',kind:'work',id:c.id,name:c.name}); results.push({id:c.id});
    } else if (c.action === 'set_bar_color') {
      const work = data.workItems.find(w => w.id === c.id); if (!work) throw new Error('작업을 찾을 수 없습니다.');
      apply({op:'detail',kind:'work',id:work.id,name:work.name,overview:work.overview || '',hoverSummary:work.hoverSummary || '',startDate:work.startDate,endDate:work.endDate,barColor:c.color}); results.push({id:c.id});
    } else if (c.action === 'schedule') {
      apply({op:'schedule',kind:'work',id:c.id,startDate:c.startDate,endDate:c.endDate}); results.push({id:c.id});
    } else if (c.action === 'save_project_document') {
      if (typeof c.text !== 'string') throw new Error('문서 내용은 문자열이어야 합니다.');
      const newId = c.id || id(), existing = data.documents.find(d => d.id === newId);
      if (existing && (existing.projectId !== c.projectId || existing.workItemId)) throw new Error('다른 프로젝트의 문서입니다.');
      const orderIds = data.documents.filter(d => d.projectId === c.projectId && !d.workItemId).sort((a,b) => (a.sortOrder||0)-(b.sortOrder||0)).map(d => d.id);
      if (!existing) orderIds.push(newId);
      apply({op:'documents-save',kind:'project',id:c.projectId,documents:[{id:newId,title:c.title,parentId:c.parentId === undefined ? existing?.parentId || null : c.parentId,schemaVersion:2,content:c.text}],orderIds}); results.push({id:newId});
    } else if (c.action === 'delete_project_document') {
      apply({op:'documents-delete',kind:'project',id:c.projectId,documentId:c.id}); results.push({id:c.id});
    } else if (c.action === 'save_work_document' || c.action === 'delete_work_document') {
      const work = data.workItems.find(w => w.id === c.workId); if (!work) throw new Error('작업을 찾을 수 없습니다.');
      const newId = c.id || id();
      const expected = domain.workDocuments(work).find(doc => doc.id === newId) ?? null;
      let document = null;
      if (c.action === 'delete_work_document') {
        if (!expected) throw new Error('작업 문서를 찾을 수 없습니다.');
      } else {
        if (typeof c.text !== 'string') throw new Error('문서 내용은 문자열이어야 합니다.');
        document = {id:newId,name:c.title,schemaVersion:2,content:c.text};
      }
      apply({op:'work-documents',kind:'work',id:work.id,documentChanges:[{id:newId,expected,document}]});
      results.push({id:newId});
    } else throw new Error('지원하지 않는 변경입니다: ' + c.action);
  }
  storage.saveContent(data);
  return {results,revision:revision(storage.loadContent())};
}
module.exports = { revision, applyChanges };

