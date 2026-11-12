const test=require('node:test'),assert=require('node:assert/strict'),d=require('../src/domain');
const base=()=>({projects:[{id:'p'},{id:'q'}],workItems:[{id:'g',type:'group',name:'그룹',projectId:'p',parentId:null},{id:'sub',type:'group',name:'하위',projectId:'p',parentId:'g'},{id:'t',type:'task',name:'작업',projectId:'p',parentId:'sub',startDate:'2024-01-01',endDate:'2024-01-02',isScheduleLocked:true},{id:'u',type:'task',name:'다른 작업',projectId:'p',parentId:null},{id:'other',type:'group',name:'외부',projectId:'q',parentId:null}]});
test('작업과 그룹을 앞뒤 또는 다른 그룹 안으로 이동하고 순환과 교차 프로젝트를 차단한다',()=>{
 let data=base();data=d.apply(data,{op:'move',kind:'work',id:'sub',targetId:'u',placement:'after'});assert.equal(data.workItems.find(x=>x.id==='sub').parentId,null);assert.deepEqual(d.numbered(data,'p').map(x=>x.item.id),['g','u','sub','t']);
 data=d.apply(data,{op:'move',kind:'work',id:'sub',targetId:'g',placement:'inside'});assert.equal(data.workItems.find(x=>x.id==='sub').parentId,'g');
 data=d.apply(data,{op:'move',kind:'work',id:'u',targetId:'t',placement:'before'});assert.equal(data.workItems.find(x=>x.id==='u').parentId,'sub');
 assert.throws(()=>d.apply(data,{op:'move',kind:'work',id:'g',targetId:'sub',placement:'inside'}),/하위/);
 assert.throws(()=>d.apply(data,{op:'move',kind:'work',id:'g',targetId:'other',placement:'inside'}),/위치/);
 assert.throws(()=>d.apply(data,{op:'move',kind:'work',id:'g',targetId:'t',placement:'inside'}),/그룹/);
});
test('그룹 잠금은 후손 일정 변경을 막고 개별 잠금 상태를 보존한다',()=>{
 let data=base();data=d.apply(data,{op:'lock',kind:'work',id:'g',locked:true});let t=data.workItems.find(x=>x.id==='t');
 assert.equal(d.isLocked(data.workItems,t),true);assert.equal(d.inheritedLock(data.workItems,t),true);
 assert.throws(()=>d.apply(data,{op:'shift',kind:'work',id:'t',days:1}),/잠겨/);
 assert.throws(()=>d.apply(data,{op:'detail',kind:'work',id:'t',name:'작업',overview:'',hoverSummary:'',startDate:'2024-01-02',endDate:'2024-01-03'}),/잠겨/);
 data=d.apply(data,{op:'detail',kind:'work',id:'t',name:'변경',overview:'편집',hoverSummary:'',startDate:'2024-01-01',endDate:'2024-01-02'});
 data=d.apply(data,{op:'lock',kind:'work',id:'g',locked:false});t=data.workItems.find(x=>x.id==='t');assert.equal(d.isLocked(data.workItems,t),true);assert.equal(d.inheritedLock(data.workItems,t),false);
 data=d.apply(data,{op:'lock',kind:'work',id:'t',locked:false});assert.equal(d.isLocked(data.workItems,data.workItems.find(x=>x.id==='t')),false);
});
