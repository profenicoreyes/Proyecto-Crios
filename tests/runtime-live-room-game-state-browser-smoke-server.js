'use strict';

const fs = require('fs');
const http = require('http');
const path = require('path');

const root = path.resolve(process.argv[2] || path.resolve(__dirname, '..'));
const port = Number(process.argv[3] || 41873);
const host = '127.0.0.1';
const maxReportBytes = 256 * 1024;
let report = null;

function json(response, statusCode, value) {
  const body = JSON.stringify(value);
  response.writeHead(statusCode, {
    'Content-Type': 'application/json;charset=utf-8',
    'Content-Length': Buffer.byteLength(body),
    'Cache-Control': 'no-store'
  });
  response.end(body);
}

function validReport(value) {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value) &&
    (value.status === 'PASS' || value.status === 'FAIL') &&
    Number.isInteger(value.total) && value.total > 0 &&
    Number.isInteger(value.failed) && value.failed >= 0 && value.failed <= value.total &&
    Array.isArray(value.messages) && value.messages.every((message) => typeof message === 'string'));
}

function receiveReport(request, response) {
  let size = 0;
  const chunks = [];
  request.on('data', (chunk) => {
    size += chunk.length;
    if (size > maxReportBytes) request.destroy();
    else chunks.push(chunk);
  });
  request.on('end', () => {
    if (size > maxReportBytes) return json(response, 413, {accepted: false});
    let parsed;
    try { parsed = JSON.parse(Buffer.concat(chunks).toString('utf8')); }
    catch (error) { return json(response, 400, {accepted: false}); }
    if (!validReport(parsed)) return json(response, 400, {accepted: false});
    report = {
      status: parsed.status,
      total: parsed.total,
      failed: parsed.failed,
      messages: parsed.messages.slice(),
      receivedAt: new Date().toISOString()
    };
    return json(response, 200, {accepted: true});
  });
}

function contentType(file) {
  const extension = path.extname(file).toLowerCase();
  if (extension === '.html') return 'text/html;charset=utf-8';
  if (extension === '.js') return 'text/javascript;charset=utf-8';
  if (extension === '.css') return 'text/css;charset=utf-8';
  if (extension === '.json') return 'application/json;charset=utf-8';
  return 'application/octet-stream';
}

function serveFile(request, response) {
  let pathname;
  try { pathname = decodeURIComponent(new URL(request.url, 'http://' + host).pathname); }
  catch (error) { return response.writeHead(400).end(); }
  const relative = pathname.replace(/^\/+/, '');
  const absolute = path.resolve(root, relative || 'index.html');
  if (absolute !== root && !absolute.startsWith(root + path.sep)) return response.writeHead(403).end();
  fs.stat(absolute, (statError, stat) => {
    if (statError || !stat.isFile()) return response.writeHead(404).end();
    response.writeHead(200, {'Content-Type': contentType(absolute), 'Cache-Control': 'no-store'});
    fs.createReadStream(absolute).pipe(response);
  });
}

const server = http.createServer((request, response) => {
  const pathname = new URL(request.url, 'http://' + host).pathname;
  if (pathname === '/__crios_smoke_result' && request.method === 'GET') {
    return json(response, 200, report || {status: 'PENDING'});
  }
  if (pathname === '/__crios_smoke_result' && request.method === 'POST') {
    return receiveReport(request, response);
  }
  if (request.method !== 'GET' && request.method !== 'HEAD') return response.writeHead(405).end();
  return serveFile(request, response);
});

server.listen(port, host, () => {
  console.log('CRIOS_BROWSER_SMOKE_SERVER_STATUS=READY');
  console.log('CRIOS_BROWSER_SMOKE_SERVER_URL=http://' + host + ':' + port + '/tests/runtime-live-room-game-state-browser-smoke.test.html');
});
