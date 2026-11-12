const test = require('node:test');
const assert = require('node:assert/strict');
const t = require('../src/timeline');
const d = require('../src/domain');
test('날짜 좌표는 윤년·연말·지원 범위를 보존한다', () => {
  assert.equal(t.parse('2024-02-29') + 1, t.parse('2024-03-01'));
  assert.equal(t.parse('2023-12-31') + 1, t.parse('2024-01-01'));
  assert.equal(t.parse('2023-02-29'), null); assert.equal(t.parse('0000-01-01'), null);
  assert.equal(t.format(t.parse('0001-01-01')), '0001-01-01'); assert.equal(t.format(t.parse('9999-12-31')), '9999-12-31');
  assert.deepEqual(t.validate('', ''), {startDate:null,endDate:null});
  assert.throws(() => t.validate('2024-01-01','')); assert.throws(() => t.validate('2024-03-01','2024-02-29'));
  assert.deepEqual(t.validate('2024-02-29','2024-02-29'), {startDate:'2024-02-29',endDate:'2024-02-29'});
});
test('기간 미정과 빈 그룹, 중첩 그룹을 집계한다', () => {
  const items = [{id:'g',type:'group',projectId:'p'}, {id:'s',type:'group',projectId:'p',parentId:'g'}, {id:'empty',type:'group',projectId:'p',parentId:'g'}, {id:'a',type:'task',projectId:'p',parentId:'s',startDate:'2024-02-29',endDate:'2024-02-29'}, {id:'b',type:'task',projectId:'p',parentId:'g'}, {id:'c',type:'task',projectId:'p',parentId:'g',startDate:'2025-01-01',endDate:'2025-01-05'}];
  const result = t.aggregate(items,'p');
  assert.deepEqual(result.get('empty'),{start:null,end:null,undated:0});
  assert.deepEqual(result.get('g'),{start:t.parse('2024-02-29'),end:t.parse('2025-01-05'),undated:1});
  assert.equal(result.get('a').end - result.get('a').start + 1, 1);
});
test('일정 명령은 작업 날짜만 검증해 저장한다', () => {
  const data = {projects:[{id:'p'}],workItems:[{id:'t',type:'task',projectId:'p'},{id:'g',type:'group',projectId:'p'}]};
  assert.throws(() => d.apply(data,{op:'schedule',kind:'work',id:'t',startDate:'2024-02-30',endDate:'2024-03-01'}));
  assert.throws(() => d.apply(data,{op:'schedule',kind:'work',id:'g',startDate:'2024-02-29',endDate:'2024-02-29'}));
  assert.equal(d.apply(data,{op:'schedule',kind:'work',id:'t',startDate:'2024-02-29',endDate:'2024-02-29'}).workItems[0].startDate,'2024-02-29');
});
test('포인터 기준 줌과 범위 제한, 달력 눈금', () => {
  const center=t.parse('2024-03-01'), width=700, ppd=10, x=140;
  const anchor = center + (x-width/2)/ppd, z=t.zoom(center,ppd,width,x,-100);
  assert.ok(z.ppd > ppd); assert.ok(Math.abs(anchor-(z.center+(x-width/2)/z.ppd)) < 1e-8);
  const min=t.limit(center,100000,width); const again=t.zoom(min.center,min.ppd,width,0,-100); assert.deepEqual(again,min);
  assert.ok(t.limit(t.MIN_DAY-999,10,width).center >= t.MIN_DAY);
  const ticks=t.ticks(center, 4, width); assert.ok(ticks.ticks.every(x => x.day === Math.floor(x.day))); assert.ok(ticks.ticks.length>0);
  const years=t.ticks(center, 0.03, width); assert.equal(years.level,4); assert.ok(years.ticks.slice(1).every((x,i) => (x.day-years.ticks[i].day)*0.03 > 60));
  const march=t.ticks(center, 5, width).ticks.find(x=>x.label==='2024.03'); assert.equal(march.day,center);
});

test('일 단위 연도 영역은 연말 경계에서 분리된다', () => {
 const center=t.parse('2024-12-31')+.5, bands=t.yearBands(center,50,400);
 assert.deepEqual(bands.map(x=>x.year),[2024,2025]);
 assert.ok(Math.abs(bands[0].left+bands[0].width-bands[1].left)<1e-8);
 assert.equal(bands[0].left,0); assert.ok(Math.abs(bands[1].left+bands[1].width-400)<1e-8);
});

test('약 2~3개월 표시부터 일별 눈금으로 전환하고 날짜 간격을 확보한다', () => {
 const center=t.parse('2025-04-01'), width=900;
 assert.equal(t.ticks(center,width/60,width).level,0);
 assert.equal(t.ticks(center,width/90,width).level,0);
 assert.equal(t.ticks(center,width/100,width).level,1);
 const daily=t.ticks(center,width/90,width).ticks;
 assert.ok(daily.length>=90 && daily.every((tick,i)=>i===0 || tick.day-daily[i-1].day===1));
 assert.ok(t.dayLabelInterval(width/90)*(width/90)>=48);
});
