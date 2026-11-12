const test = require('node:test');
const assert = require('node:assert/strict');
const d = require('../src/domain');
const base = () => d.normalize({workspace: null});
function create(data, kind, id, parentId = null, more = {}) { return d.apply(data, {op:'create', kind, id, parentId, name:id, ...more}); }
test('폴더 부모 검증과 순환 이동 거부', () => {
  let data = create(base(), 'folder', 'a');
  data = create(data, 'folder', 'b', 'a');
  assert.throws(() => d.apply(data, {op:'move',kind:'folder',id:'a',parentId:'b'}), /하위/);
  assert.throws(() => create(data, 'project', 'p', 'missing'), /상위/);
  assert.throws(() => d.apply(data, {op:'rename',kind:'folder',id:'a',name:'  '}), /이름/);
  assert.equal(data.folders[0].parentId, null);
});
test('작업 부모 검증, 순환 방지와 이동·정렬 후 WBS 번호', () => {
  let data = create(base(), 'project', 'p'); data = create(data, 'project', 'p2');
  data = create(data, 'work', 'g', null, {projectId:'p',type:'group'});
  data = create(data, 'work', 'sub', 'g', {projectId:'p',type:'group'});
  data = create(data, 'work', 'a', 'sub', {projectId:'p',type:'task'});
  data = create(data, 'work', 'b', null, {projectId:'p',type:'task'});
  data = create(data, 'work', 'foreign', null, {projectId:'p2',type:'group'});
  assert.throws(() => d.apply(data,{op:'move',kind:'work',id:'g',parentId:'sub'}), /하위/);
  assert.throws(() => d.apply(data,{op:'move',kind:'work',id:'g',parentId:'foreign'}), /상위/);
  assert.throws(() => d.apply(data,{op:'move',kind:'work',id:'g',parentId:'a'}), /상위/);
  assert.deepEqual(d.numbered(data,'p').map(x => [x.item.id,x.number]), [['g','1'],['sub','1.1'],['a','1.1.1'],['b','2']]);
  data = d.apply(data,{op:'move',kind:'work',id:'b',parentId:'g'});
  data = d.apply(data,{op:'reorder',kind:'work',id:'b',direction:-1});
  assert.deepEqual(d.numbered(data,'p').map(x => [x.item.id,x.number]), [['g','1'],['b','1.1'],['sub','1.2'],['a','1.2.1']]);
});
test('삭제는 해당 계층과 연결된 문서만 제거한다', () => {
  let data = create(base(), 'folder', 'f'); data = create(data, 'project', 'p', 'f'); data = create(data, 'project', 'other');
  data = create(data, 'work', 'g', null, {projectId:'p',type:'group'}); data = create(data, 'work', 't', 'g', {projectId:'p',type:'task'});
  data.documents = [{id:'d1',projectId:'p'}, {id:'d2',workItemId:'t'}, {id:'d3',projectId:'other'}];
  data = d.apply(data,{op:'delete',kind:'folder',id:'f'});
  assert.deepEqual(data.projects.map(x=>x.id),['other']); assert.equal(data.workItems.length,0); assert.deepEqual(data.documents.map(x=>x.id),['d3']);
});
