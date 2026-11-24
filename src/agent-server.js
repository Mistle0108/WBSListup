const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const {revision, applyChanges} = require('./agent-operations');
function documentTargets(changes) {
  if (!Array.isArray(changes) || !changes.length || changes.length > 100) return null;
  const targets = changes.map(change => {
    switch (change?.action) {
      case 'save_work_document':
      case 'delete_work_document':
        return {kind:'work', ownerId:change.workId, id:change.id};
      case 'save_project_document':
      case 'delete_project_document':
        return {kind:'project', ownerId:change.projectId, id:change.id};
      default: return null;
    }
  });
  return targets.every(target => target && typeof target.ownerId === 'string' &&
    (target.id === undefined || typeof target.id === 'string')) ? targets : null;
}
async function startAgentServer(storage, window, directory) {
  const token = crypto.randomBytes(32).toString('hex'); let writing = false;
  const server = http.createServer((req,res) => {
    res.setHeader('Content-Type','application/json; charset=utf-8');
    if (req.method !== 'POST' || req.url !== '/agent' || req.headers.authorization !== `Bearer ${token}`) { res.writeHead(403); res.end('{"error":"forbidden"}'); return; }
    let raw = ''; req.setEncoding('utf8');
    req.on('data', chunk => { raw += chunk; if (raw.length > 2_000_000) req.destroy(); });
    req.on('end', async () => {
      let locked = false, acquired = false;
      try {
        const request = JSON.parse(raw);
        let result;
        if (request.method === 'read') { const data = storage.loadContent(); result = {revision:revision(data),data}; }
        else if (request.method === 'apply') {
          if (writing) throw new Error('다른 요청이 처리 중입니다.');
          writing = true; locked = true;
          const targets = documentTargets(request.changes);
          const blocked = await window.webContents.executeJavaScript(`window.agentBridge.begin(${JSON.stringify(targets)})`);
          if (blocked) throw new Error(blocked);
          acquired = true;
          result = applyChanges(storage, request.revision, request.changes);
          const savedTargets = targets?.map((target, index) => ({...target, id:result.results[index].id})) ?? [];
          const update = {content:storage.loadContentMetadata(), targets:savedTargets};
          await window.webContents.executeJavaScript(`window.agentBridge.finish(${JSON.stringify(update)})`);
        } else throw new Error('알 수 없는 요청입니다.');
        res.end(JSON.stringify({result}));
      } catch (error) {
        if (acquired && !window.isDestroyed()) await window.webContents.executeJavaScript('window.agentBridge.cancel()').catch(() => {});
        res.writeHead(400); res.end(JSON.stringify({error:error.message}));
      } finally { if (locked) writing = false; }
    });
  });
  await new Promise((resolve,reject) => { server.once('error',reject); server.listen(0,'127.0.0.1',resolve); });
  const descriptor = path.join(directory,'agent-connection.json');
  fs.writeFileSync(descriptor, JSON.stringify({port:server.address().port,token}), {mode:0o600});
  return () => { server.close(); try { const current = JSON.parse(fs.readFileSync(descriptor,'utf8')); if (current.token === token) fs.unlinkSync(descriptor); } catch {} };
}
module.exports = {startAgentServer};
