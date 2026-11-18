const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { Storage } = require('../src/storage');

test('내용과 보기 상태 저장, 재조회, 재실행 복원', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'planweave-'));
  try {
    const file = path.join(dir, 'data.sqlite');
    let db = new Storage(file);
    const content = { workspace: { id: 'w', name: '작업공간', updatedAt: '2026-01-01' }, projects: [{ id: 'p' }], workItems: [{ id: 't' }], documents: [{ id: 'd', content: '내용' }] };
    const view = { selectedProject: 'p', zoom: 2 };
    db.saveContent(content);
    db.saveViewState(view);
    assert.deepEqual(db.loadContent(), content);
    assert.deepEqual(db.loadViewState(), view);
    db.close();
    db = new Storage(file);
    assert.deepEqual(db.loadContent(), content);
    assert.deepEqual(db.loadViewState(), view);
    db.saveViewState({ zoom: 3 });
    assert.deepEqual(db.loadContent(), content);
    db.saveContent({ ...content, projects: [] });
    assert.deepEqual(db.loadViewState(), { zoom: 3 });
    db.close();
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test('저장 실패는 호출자에게 전달하고 기존 내용을 보존한다', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'planweave-'));
  try {
    const file = path.join(dir, 'data.sqlite');
    let db = new Storage(file);
    db.saveContent({ name: '기존' });
    db.db.exec("CREATE TRIGGER fail_update BEFORE UPDATE ON state BEGIN SELECT RAISE(ABORT, '실패'); END");
    assert.throws(() => db.saveContent({ name: '변경' }), /실패/);
    db.close();
    db = new Storage(file);
    assert.deepEqual(db.loadContent(), { name: '기존' });
    db.close();
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test('더 새로운 스키마를 빈 데이터로 열지 않는다', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'planweave-'));
  try {
    const file = path.join(dir, 'data.sqlite');
    const db = new Storage(file);
    db.db.exec('PRAGMA user_version = 99');
    db.close();
    assert.throws(() => new Storage(file), /지원하지 않는 데이터 버전/);
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test('첨부파일은 대상별로 복사하여 보관하고 삭제한다', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'wbs-attachment-'));
  try {
    const file = path.join(dir, 'data.sqlite'), source = path.join(dir, '한글 문서.txt');
    fs.writeFileSync(source, '첨부 내용');
    let db = new Storage(file);
    db.saveContent({ projects: [{id:'p'}], workItems: [{id:'t',projectId:'p'}], documents: [] });
    db.addAttachment('project', 'p', source);
    db.addAttachment('work', 't', source);
    const [work] = db.listAttachments('work', 't');
    assert.equal(work.name, '한글 문서.txt');
    assert.equal(db.listAttachments('project', 'p').length, 1);
    assert.throws(() => db.attachmentPath('project', 'p', work.id), /찾을 수 없습니다/);
    fs.unlinkSync(source);
    db.close(); db = new Storage(file);
    const copy = db.attachmentPath('work', 't', work.id).path;
    assert.equal(fs.readFileSync(copy, 'utf8'), '첨부 내용');
    db.deleteAttachment('work', 't', work.id);
    assert.equal(fs.existsSync(copy), false);
    assert.equal(db.listAttachments('work', 't').length, 0);
    assert.equal(db.listAttachments('project', 'p').length, 1);
    db.close();
  } finally { fs.rmSync(dir, {recursive:true, force:true}); }
});
