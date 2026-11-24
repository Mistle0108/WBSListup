const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { app, BrowserWindow, dialog } = require('electron');
const { Storage } = require('../src/storage');

const dir = process.env.WBS_TEST_DIR;
app.setPath('userData', dir);
app.setPath('appData', dir);
const source = path.join(dir, 'sample.txt');
fs.writeFileSync(source, 'attachment fixture');
dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [source] });

const db = new Storage(path.join(dir, 'data', 'wbs-list-up.sqlite'));
const comment = { id:'c', text:'Group comment', createdAt:new Date().toISOString() };
db.saveContent({
  projects: [{ id:'p', name:'Project', boards:[] }],
  workItems: [
    { id:'g', name:'Group', type:'group', projectId:'p', comments:[comment], boards:[], taskDocuments:[] },
    { id:'t', name:'Task', type:'task', projectId:'p', parentId:'g', boards:[], taskDocuments:[] },
    { id:'legacy', name:'Legacy task', type:'task', projectId:'p' }
  ],
  documents: [{ id:'d', projectId:'p', title:'Project doc', schemaVersion:2, content:'text' }],
  projectDocumentFolders: [{ id:'f', projectId:'p', name:'Folder' }]
});
db.addAttachment('work', 't', source);
db.saveViewState({ selectedProject:'p', projects:{p:{collapsed:[], selected:null}} });
db.close();

require('../src/main');
app.whenReady().then(() => {
  const win = BrowserWindow.getAllWindows()[0];
  win.webContents.once('did-finish-load', async () => {
    const run = code => win.webContents.executeJavaScript(code);
    const wait = async condition => {
      for (let i = 0; i < 60; i++) {
        if (await run('Boolean(' + condition + ')')) return;
        await new Promise(resolve => setTimeout(resolve, 50));
      }
      throw Error('Timed out: ' + condition);
    };
    const click = selector => run('document.querySelector(' + JSON.stringify(selector) + ').click()');
    const match = selector => 'document.querySelector(' + JSON.stringify(selector) + ')';
    const count = (id, tab) => '.content-count[data-id="' + id + '"][data-content-tab="' + tab + '"]';
    const badge = tab => match('#' + tab + ' .tab-count') + '?.textContent';
    const active = tab => match('#' + tab) + '.getAttribute("aria-selected") === "true"';
    try {
      await wait(match(count('t', 'attachments')));
      assert.equal(await run(match(count('p', 'document')) + '.textContent'), '1');
      assert.equal(await run(match(count('g', 'comments')) + '.textContent'), '1');
      assert.equal(await run('!' + match(count('g', 'attachments'))), true);
      assert.equal(await run('!' + match(count('legacy', 'notes'))), true);

      await click(count('g', 'comments'));
      await wait(active('tab-comments'));
      assert.equal(await run(badge('tab-notes')), '0');
      await run('document.querySelector("#comment-input").value = "Draft"');
      await click('#comment-add');
      assert.equal(await run(badge('tab-comments')), '2');
      assert.equal(await run(match(count('g', 'comments')) + '.textContent'), '1');
      await click('#detail-cancel');
      await wait(match('#discard-dialog') + '.open');
      await click('#discard-changes');
      await wait('document.activeElement === ' + match(count('g', 'comments')));

      await click(count('t', 'attachments'));
      await wait(active('tab-attachments') + ' && ' + match('#task-attachments .attachment-row'));
      assert.equal(await run(badge('tab-attachments')), '1');
      await run('void (window.confirm = () => true)');
      await click('#task-attachments .attachment-row button:last-child');
      await wait(badge('tab-attachments') + ' === "0"');
      assert.equal(await run('!' + match(count('t', 'attachments'))), true);
      await click('#task-attachments button');
      await wait(badge('tab-attachments') + ' === "1" && !!' + match(count('t', 'attachments')));
      await click('#tab-document');
      await click('#task-document-add');
      assert.equal(await run(badge('tab-document')), '1');
      assert.equal(await run('!' + match(count('t', 'document'))), true);
      await click('#detail-save');
      await wait('!' + match('#detail-dialog') + '.open && !!' + match(count('t', 'document')));

      await click(count('p', 'document'));
      await wait(active('project-tab-docs'));
      assert.equal(await run(badge('project-tab-board')), '0');
      assert.equal(await run('!' + match('#project-tab-comments')), true);
      await click('#project-tab-board');
      await click('#project-board-add');
      await wait(badge('project-tab-board') + ' === "1"');
      assert.equal(await run('!' + match(count('p', 'notes'))), true);
      await click('#project-board-save');
      await wait(match(count('p', 'notes')));
      await click('#project-detail-close');
      await wait('!' + match('#project-dialog') + '.open');
      await click(count('p', 'notes'));
      await wait(active('project-tab-board'));
      await click('#project-tab-attachments');
      await click('#project-attachments button');
      await wait(badge('project-tab-attachments') + ' === "1" && !!' + match(count('p', 'attachments')));
      await click('#project-detail-close');
      await wait('!' + match('#project-dialog') + '.open');
      await click(count('p', 'attachments'));
      await wait(active('project-tab-attachments'));
      await click('#project-detail-close');
      await wait('!' + match('#project-dialog') + '.open');

      await click('[data-action="create-task"]');
      const newTask = '[data-action="select-work"][aria-label="새 작업"]';
      await wait(match(newTask));
      const newId = await run(match(newTask) + '.dataset.id');
      assert.equal(await run('!' + match(count(newId, 'document'))), true);
      await run(match(newTask) + '.dispatchEvent(new MouseEvent("dblclick", {bubbles:true}))');
      await wait(match('#detail-dialog') + '.open');
      await click('#tab-document');
      assert.equal(await run(badge('tab-document')), '0');
      assert.equal(await run(match('#editor-workspace') + '.hidden'), true);
      await click('#tab-notes');
      assert.equal(await run(badge('tab-notes')), '0');
      assert.equal(await run(match('#note-workspace') + '.hidden'), true);
      await click('#board-add');
      await wait(badge('tab-notes') + ' === "1"');
      await click('#detail-save');
      await wait('!' + match('#detail-dialog') + '.open');
      const created = await run('window.storage.loadContent().then(data => data.workItems.find(item => item.name === "새 작업"))');
      assert.equal(created.boards.length, 1);
      assert.deepEqual(created.taskDocuments, []);
      console.log('Content count visibility, deep links, draft and saved updates, and attachment mutations passed.');
      app.exit(0);
    } catch (error) {
      console.error(error);
      app.exit(1);
    }
  });
});
setTimeout(() => app.exit(1), 30000).unref();
