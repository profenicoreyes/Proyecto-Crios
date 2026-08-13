'use strict';

const fs = require('fs');
const path = require('path');

const repo = path.resolve(process.argv[2] || path.join(__dirname, '..'));
let total = 0;
let failed = 0;

function check(condition, message) {
  total += 1;
  if (!condition) {
    failed += 1;
    console.error('FAIL=' + message);
  }
}

function read(rel) {
  return fs.readFileSync(path.join(repo, rel), 'utf8');
}

const client = read('js/publication/remote/remote-publication-client.js');
const bootstrap = read('js/studio/publication/studio-remote-publication-bootstrap.js');
const bridge = read('js/publication/remote/remote-publication-deployment-config.js');
const studioHtml = read('studio/index.html');
const studioDoc = read('docs/STUDIO.md');
const architecture = read('docs/architecture/A3_STUDIO_ANONYMOUS_PUBLICATION.md');

check(!fs.existsSync(path.join(repo, 'js/studio/publication/studio-write-auth.js')), 'teacher write auth implementation removed');
check(!studioHtml.includes('studio-write-auth.js'), 'Studio no longer loads teacher write auth');
check(!client.includes('writeTokenProvider'), 'remote client has no write token provider');
check(!client.includes('writeToken'), 'remote client has no write token transport');
check(!client.includes('INSECURE_CONTEXT'), 'remote client has no secure-context credential gate');
check(client.includes('body: JSON.stringify({ request: request })'), 'publish transport uses request-only envelope');
check(bootstrap.includes("Object.freeze(['endpoint', 'timeoutMs'])"), 'Studio bootstrap config allows endpoint and timeout only');
check(bootstrap.includes("'REMOTE_PUBLICATION_AUTH_RETIRED'"), 'stale auth configuration rejected explicitly');
check(!bootstrap.includes('Teacher write authorization'), 'bootstrap has no live teacher auth flow');
check(!bridge.includes('CRIOS_STUDIO_WRITE_AUTH'), 'deployment bridge has no auth module dependency');
check(!bridge.includes('writeTokenProvider'), 'deployment bridge has no token provider');
check(bridge.includes('window.CRIOS_STUDIO_REMOTE_PUBLICATION_CONFIG = Object.freeze({'), 'deployment bridge always creates Studio config');
check(studioDoc.includes('no solicita clave docente'), 'Studio documentation states no teacher key');
check(studioDoc.includes('no puede sobrescribir ni borrar'), 'Studio documentation states create-only boundary');
check(architecture.includes('No activation step and no teacher publication key are required.'), 'architecture records keyless product flow');
check(architecture.includes('`{ request }`'), 'architecture records request-only envelope');
check(architecture.includes('524288-byte content limit'), 'architecture records content limit');
check(architecture.includes('30 per 60 seconds'), 'architecture records rate limit');
check(architecture.includes('5000 publications'), 'architecture records storage ceiling');
check(architecture.includes('stale authorization configuration'), 'architecture records stale auth rejection');
check(architecture.includes('live remote smoke'), 'architecture records B7D1 live-smoke prerequisite');
check(!client.includes('prompt('), 'remote client never prompts');
check(!bridge.includes('prompt('), 'deployment bridge never prompts');
check(!studioHtml.includes('writeToken'), 'Studio HTML contains no write token');
check(!studioHtml.includes('clave docente'), 'Studio HTML contains no teacher-key copy');

console.log('STUDIO_ANONYMOUS_PUBLICATION_TEST_STATUS=' + (failed ? 'FAIL' : 'PASS'));
console.log('STUDIO_ANONYMOUS_PUBLICATION_TEST_TOTAL=' + total);
console.log('STUDIO_ANONYMOUS_PUBLICATION_TEST_FAILED=' + failed);
console.log('STUDIO_ANONYMOUS_PUBLICATION_NO_KEY=true');
console.log('STUDIO_ANONYMOUS_PUBLICATION_CREATE_ONLY=true');
if (failed) process.exit(1);
