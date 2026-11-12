const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const {revision, applyChanges} = require('./agent-operations');
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
          if (!await window.webContents.executeJavaScript('window.agentBridge.begin()')) throw new Error('앱에서 편집 또는 다른 작업이 진행 중입니다. 창을 닫은 뒤 다시 시도하세요.');
          acquired = true;
          result = applyChanges(storage, request.revision, request.changes);
          await window.webContents.executeJavaScript(`window.agentBridge.finish(${JSON.stringify(storage.loadContentMetadata())})`);
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
