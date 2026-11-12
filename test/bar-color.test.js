const test=require('node:test'),assert=require('node:assert/strict'),domain=require('../src/domain');
test('작업과 그룹 막대 색상은 상세 저장에 포함되고 잘못된 값은 거부된다',()=>{
 const data={projects:[{id:'p'}],workItems:[{id:'g',name:'그룹',projectId:'p',type:'group'},{id:'t',name:'작업',projectId:'p',type:'task',parentId:'g',isScheduleLocked:true}]};
 const detail=(id,color)=>({op:'detail',kind:'work',id,name:id==='g'?'그룹':'작업',overview:'',hoverSummary:'',startDate:null,endDate:null,barColor:color});
 let result=domain.apply(data,detail('t','#Ab12Cd'));assert.equal(result.workItems[1].barColor,'#ab12cd');
 result=domain.apply(result,detail('g','#135790'));assert.equal(result.workItems[0].barColor,'#135790');
 assert.throws(()=>domain.apply(result,detail('t','red;display:none')),/색상/);assert.equal(result.workItems[1].barColor,'#ab12cd');
});

test('새 작업의 색상은 전체 작업과 그룹의 기존 색상과 겹치지 않는다',()=>{
 const data={projects:[{id:'p'},{id:'q'}],workItems:[{id:'a',type:'task',projectId:'p',barColor:'#a0a0a0'},{id:'b',type:'task',projectId:'q',barColor:'#a0a0a1'},{id:'g',type:'group',projectId:'p'},{id:'legacy',type:'task',projectId:'p'}]};
 const random=Math.random;
 try { Math.random=()=>0;
   const result=domain.apply(data,{op:'create',kind:'work',id:'new',name:'새 작업',type:'task',projectId:'p'});
   assert.equal(result.workItems.at(-1).barColor,'#a0a0a2');assert.equal(result.workItems[0].barColor,'#a0a0a0');assert.equal(result.workItems[1].barColor,'#a0a0a1');
   const second=domain.apply(result,{op:'create',kind:'work',id:'next',name:'새 작업',type:'task',projectId:'p'});assert.equal(second.workItems.at(-1).barColor,'#a0a0a3');
 } finally { Math.random=random; }
});

test('무작위 기본 막대 색상은 밝은 색 범위에 속한다',()=>{
 const data={projects:[{id:'p'}],workItems:[]};for(let i=0;i<100;i++){const result=domain.apply(data,{op:'create',kind:'work',id:'n'+i,name:'새 작업',type:'task',projectId:'p'});const color=result.workItems[0].barColor;for(const n of [1,3,5])assert.ok(parseInt(color.slice(n,n+2),16)>=160);}
});
