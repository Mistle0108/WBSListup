const { DatabaseSync } = require('node:sqlite');
const fs = require('node:fs');
const path = require('node:path');
const domain = require('./domain');

const VERSION = 2;
const emptyContent = () => ({ workspace: null, projects: [], workItems: [], documents: [] });
const projectDocument = doc => doc && doc.projectId && !doc.workItemId;
function separate(content) {
  const metadata = structuredClone(content), bodies = [];
  if (metadata.documents) metadata.documents = metadata.documents.map(doc => {
    if (!projectDocument(doc) || !Object.hasOwn(doc, 'content')) return doc;
    const {content: body, ...rest} = doc;
    if (body === undefined) throw new Error('프로젝트 문서 본문이 없습니다.');
    bodies.push({id:doc.id, body:JSON.stringify(body)}); return rest;
  });
  return {metadata,bodies};
}
class Storage {
  constructor(file) {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    this.db = new DatabaseSync(file);
    try {
      const version = this.db.prepare('PRAGMA user_version').get().user_version;
      if (version > VERSION) throw new Error(`지원하지 않는 데이터 버전입니다: ${version}`);
      if (version < 2) {
        this.db.exec('BEGIN IMMEDIATE');
        try {
          if (version === 0) this.db.exec('CREATE TABLE state (key TEXT PRIMARY KEY, value TEXT NOT NULL)');
          this.db.exec('CREATE TABLE project_document_content (id TEXT PRIMARY KEY, value TEXT NOT NULL)');
          const row = this.db.prepare("SELECT value FROM state WHERE key = 'content'").get();
          if (row) {
            const {metadata,bodies} = separate(JSON.parse(row.value));
            const insert = this.db.prepare('INSERT INTO project_document_content (id, value) VALUES (?, ?)');
            for (const body of bodies) insert.run(body.id, body.body);
            this.db.prepare("UPDATE state SET value = ? WHERE key = 'content'").run(JSON.stringify(metadata));
          }
          this.db.exec('PRAGMA user_version = 2');
          this.db.exec('COMMIT');
        } catch (error) { this.db.exec('ROLLBACK'); throw error; }
      }
    } catch (error) { this.db.close(); throw error; }
  }
  read(key, fallback) {
    const row = this.db.prepare('SELECT value FROM state WHERE key = ?').get(key);
    return row ? JSON.parse(row.value) : fallback();
  }
  loadContentMetadata() { return this.read('content', emptyContent); }
  loadProjectDocument(projectId, documentId) {
    const doc = (this.loadContentMetadata().documents || []).find(x => x.id === documentId && x.projectId === projectId && !x.workItemId);
    if (!doc) throw new Error('프로젝트 문서를 찾을 수 없습니다.');
    const row = this.db.prepare('SELECT value FROM project_document_content WHERE id = ?').get(documentId);
    if (!row) throw new Error('프로젝트 문서 본문을 불러오지 못했습니다.');
    return JSON.parse(row.value);
  }
  loadContent() {
    const content = this.loadContentMetadata(), rows = this.db.prepare('SELECT id, value FROM project_document_content').all();
    const bodies = new Map(rows.map(row => [row.id,row.value]));
    for (const doc of content.documents || []) if (projectDocument(doc)) {
      if (!bodies.has(doc.id)) throw new Error('프로젝트 문서 본문을 불러오지 못했습니다.');
      doc.content = JSON.parse(bodies.get(doc.id));
    }
    return content;
  }
  loadViewState() { return this.read('view', () => ({})); }
  write(key, value) {
    const json = JSON.stringify(value);
    if (json === undefined) throw new TypeError('저장할 수 없는 데이터입니다.');
    this.db.exec('BEGIN IMMEDIATE');
    try {
      this.db.prepare('INSERT INTO state (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value').run(key, json);
      this.db.exec('COMMIT');
    } catch (error) { this.db.exec('ROLLBACK'); throw error; }
  }
  saveContent(content) {
    const {metadata,bodies} = separate(content), json = JSON.stringify(metadata);
    if (json === undefined) throw new TypeError('저장할 수 없는 데이터입니다.');
    this.db.exec('BEGIN IMMEDIATE');
    try {
      const upsert = this.db.prepare('INSERT INTO project_document_content (id, value) VALUES (?, ?) ON CONFLICT(id) DO UPDATE SET value = excluded.value WHERE value != excluded.value');
      for (const body of bodies) upsert.run(body.id, body.body);
      const keep = new Set((metadata.documents || []).filter(projectDocument).map(doc => doc.id));
      const remove = this.db.prepare('DELETE FROM project_document_content WHERE id = ?');
      for (const row of this.db.prepare('SELECT id FROM project_document_content').all()) if (!keep.has(row.id)) remove.run(row.id);
      this.db.prepare("INSERT INTO state (key, value) VALUES ('content', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value").run(json);
      this.db.exec('COMMIT');
    } catch (error) { this.db.exec('ROLLBACK'); throw error; }
  }
  executeContent(command) {
    const updated = domain.apply(this.loadContentMetadata(), command);
    this.saveContent(updated);
    return this.loadContentMetadata();
  }
  saveViewState(view) { this.write('view', view); }
  close() { this.db.close(); }
}
module.exports = { Storage };
