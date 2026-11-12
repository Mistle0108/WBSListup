const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { Storage } = require('../src/storage');
const { prepareDatabase } = require('../src/database-path');

test('기존 DB를 새 위치에 복사하고 이미 존재하는 DB는 유지한다', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'wbs-migrate-'));
  const old = path.join(dir, 'old', 'planweave.sqlite');
  const next = path.join(dir, 'new', 'wbs-list-up.sqlite');
  try {
    const source = new Storage(old);
    source.saveContent({projects:[{id:'p',name:'기존 프로젝트'}],workItems:[],documents:[]});
    source.saveViewState({selectedProject:'p'});
    await prepareDatabase(next, old);
    const migrated = new Storage(next);
    assert.equal(migrated.loadContent().projects[0].name, '기존 프로젝트');
    assert.equal(migrated.loadViewState().selectedProject, 'p');
    migrated.saveContent({projects:[{id:'new',name:'새 프로젝트'}],workItems:[],documents:[]});
    migrated.close();
    await prepareDatabase(next, old);
    const reopened = new Storage(next);
    assert.equal(reopened.loadContent().projects[0].name, '새 프로젝트');
    reopened.close();
    assert.equal(source.loadContent().projects[0].name, '기존 프로젝트');
    source.close();
  } finally { fs.rmSync(dir, {recursive:true,force:true}); }
});
