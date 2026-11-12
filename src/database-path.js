const fs = require('node:fs');
const path = require('node:path');
const { DatabaseSync, backup } = require('node:sqlite');

async function prepareDatabase(destination, legacy) {
  if (fs.existsSync(destination) || !fs.existsSync(legacy)) return;
  fs.mkdirSync(path.dirname(destination), { recursive: true });
  const tempDir = fs.mkdtempSync(path.join(path.dirname(destination), '.migration-'));
  const tempFile = path.join(tempDir, 'backup.sqlite');
  let source;
  try {
    source = new DatabaseSync(legacy, { readOnly: true });
    await backup(source, tempFile);
    try { fs.linkSync(tempFile, destination); }
    catch (error) { if (error.code !== 'EEXIST') throw error; }
  } finally {
    if (source) source.close();
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
}
module.exports = { prepareDatabase };
