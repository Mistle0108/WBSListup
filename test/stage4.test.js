const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs'); const os = require('node:os'); const path = require('node:path');
const domain = require('../src/domain'), time = require('../src/timeline'), {Storage} = require('../src/storage');
function fixture() { return {projects:[{id:'p'}],workItems:[{id:'g',type:'group',projectId:'p'},{id:'t',type:'task',projectId:'p',parentId:'g',name:'작업',startDate:'2024-02-28',endDate:'2024-03-01'}]}; }
test('정수 일수 이동은 윤년과 기간 길이를 유지하고 조상 기간을 갱신한다', () => {
  const data=domain.apply(fixture(),{op:'shift',kind:'work',id:'t',days:2}); const item=data.workItems[1];
  assert.equal(item.startDate,'2024-03-01'); assert.equal(item.endDate,'2024-03-03');
  assert.equal(time.parse(item.endDate)-time.parse(item.startDate),2);
  assert.equal(time.aggregate(data.workItems,'p').get('g').start,time.parse('2024-03-01'));
  assert.throws(()=>domain.shiftDates({...item,startDate:'9999-12-31',endDate:'9999-12-31'},1),/범위/);
  assert.throws(()=>domain.shiftDates(item,0.5),/이동/);
});
test('잠긴 작업은 날짜 변경을 거부하고 내용 편집을 허용한다', () => {
  let data=domain.apply(fixture(),{op:'lock',kind:'work',id:'t',locked:true});
  assert.throws(()=>domain.apply(data,{op:'shift',kind:'work',id:'t',days:1}),/잠겨/);
  assert.throws(()=>domain.apply(data,{op:'schedule',kind:'work',id:'t',startDate:'2024-02-29',endDate:'2024-03-01'}),/잠겨/);
  assert.throws(()=>domain.apply(data,{op:'detail',kind:'work',id:'t',name:'변경',overview:'',hoverSummary:'',startDate:'',endDate:''}),/잠겨/);
  data=domain.apply(data,{op:'detail',kind:'work',id:'t',name:'변경',overview:'개요',hoverSummary:'요약',startDate:'2024-02-28',endDate:'2024-03-01'});
  assert.equal(data.workItems[1].overview,'개요'); assert.equal(data.workItems[1].isScheduleLocked,true);
  data=domain.apply(data,{op:'lock',kind:'work',id:'t',locked:false});
  assert.equal(domain.apply(data,{op:'shift',kind:'work',id:'t',days:1}).workItems[1].startDate,'2024-02-29');
});
test('저장 명령이 최신 잠금을 재검사하고 실패 시 데이터를 보존한다', () => {
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'wbs-lock-')); let db;
  try { db=new Storage(path.join(dir,'db.sqlite')); db.saveContent(fixture()); db.executeContent({op:'lock',kind:'work',id:'t',locked:true});
    assert.throws(()=>db.executeContent({op:'shift',kind:'work',id:'t',days:2}),/잠겨/);
    db.db.exec("CREATE TRIGGER fail_update BEFORE UPDATE ON state BEGIN SELECT RAISE(ABORT, '실패'); END");
    assert.throws(()=>db.executeContent({op:'lock',kind:'work',id:'t',locked:false}),/실패/);
    db.close(); db=new Storage(path.join(dir,'db.sqlite')); const item=db.loadContent().workItems[1]; assert.equal(item.isScheduleLocked,true); assert.equal(item.startDate,'2024-02-28');
  } finally { if(db) db.close(); fs.rmSync(dir,{recursive:true,force:true}); }
});
