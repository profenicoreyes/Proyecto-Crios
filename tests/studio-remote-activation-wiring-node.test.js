'use strict';

const fs = require('fs');
const path = require('path');

const repo = path.resolve(process.argv[2] || process.cwd());
let total = 0;
let failed = 0;

function check(condition, message) {
  total += 1;
  if (!condition) {
    failed += 1;
    console.error('FAIL=' + message);
  }
}

function has(source, needle) { return source.indexOf(needle) >= 0; }

const html = fs.readFileSync(path.join(repo, 'studio/index.html'), 'utf8');
const studio = fs.readFileSync(path.join(repo, 'js/studio/studio.js'), 'utf8');
const renderer = fs.readFileSync(path.join(repo, 'js/studio/render/studio-renderer.js'), 'utf8');
const remoteBootstrap = fs.readFileSync(path.join(repo, 'js/studio/publication/studio-remote-publication-bootstrap.js'), 'utf8');
const remoteClient = fs.readFileSync(path.join(repo, 'js/publication/remote/remote-publication-client.js'), 'utf8');

const retiredScripts = [
  '../js/publication/activation/activation-model.js',
  '../js/publication/activation/activation-store.js',
  '../js/publication/activation/activation-service.js',
  '../js/publication/activation/activation-api.js',
  '../js/studio/publication/studio-remote-activation-service.js',
  '../js/studio/publication/studio-activation-controller.js'
];

retiredScripts.forEach(function(src){
  check(!has(html, src), 'normal Studio no longer loads ' + src);
});

const retainedPublicationScripts = [
  '../js/publication/remote/remote-publication-contract.js',
  '../js/publication/remote/remote-publication-client.js',
  '../js/studio/publication/studio-remote-publication-service.js',
  '../js/studio/publication/studio-remote-publication-bootstrap.js',
  '../js/studio/publication/studio-publication-controller.js',
  '../js/studio/studio.js'
];
retainedPublicationScripts.forEach(function(src){
  check(has(html, src), 'normal Studio retains publication dependency ' + src);
});

check(has(html, '../js/publication/persistence/persistent-activation-store.js'), 'legacy persistence reader remains temporarily loadable for schema compatibility');
check(!has(studio, 'studioActivationController'), 'Studio bootstrap owns no activation controller');
check(!has(studio, 'studioActivationApi'), 'Studio exposes no activation API object');
check(!has(studio, 'remoteActivationService'), 'Studio composes no remote activation service');
check(!has(studio, 'CRIOS_STUDIO_REMOTE_ACTIVATION_SERVICE'), 'Studio reads no remote activation factory');
check(!has(studio, 'CRIOS_PUBLICATION_ACTIVATION'), 'Studio reads no activation domain API');
check(!has(studio, 'CRIOS_STUDIO_ACTIVATION_CONTROLLER'), 'Studio reads no activation controller factory');
check(!has(studio, 'activatePublication('), 'Studio performs no activate operation');
check(!has(studio, 'deactivatePublication('), 'Studio performs no deactivate operation');
check(!has(studio, 'rollbackPublication('), 'Studio performs no rollback operation');
check(!has(studio, 'createReloadSafeActivationStore'), 'Studio has no activation cache wrapper');
check(!has(studio, 'activationStore'), 'Studio bootstrap keeps no activation store handle');
check(!has(studio, 'activeReferences[0]'), 'campaign recovery no longer depends on an active reference');
check(has(studio, 'publicationSnapshot.publications[publicationSnapshot.publications.length - 1].campaignId'), 'campaign recovery derives from latest stored publication');
check(!has(studio, 'activation: studioActivationApi'), 'CRIOS_STUDIO public API has no activation member');
check(has(studio, 'publication: studioPublicationApi'), 'CRIOS_STUDIO keeps publication API');
check(has(studio, 'runtimeLaunch: studioRuntimeLaunchApi'), 'CRIOS_STUDIO keeps direct Runtime launch API');
check(has(studio, 'persistence: studioPersistenceApi'), 'CRIOS_STUDIO keeps persistence API');

const retiredRendererTokens = [
  'studioActivationStatus',
  'studioActivationActiveDetails',
  'studioActivationDeactivateButton',
  'studioActivationHistory',
  'studioActivationPersistenceNotice',
  "textContent = 'Activar'",
  "textContent = 'Desactivar'",
  "textContent = 'Volver a esta versión'",
  "textContent = 'Activa'",
  'activationActions',
  'activationState.activeReference',
  'activationRecords'
];
retiredRendererTokens.forEach(function(token){
  check(!has(renderer, token), 'renderer retired activation token ' + token);
});

check(has(renderer, "runtimeLaunchTitle.textContent = 'Acceso para estudiantes'"), 'student access remains visible');
check(has(renderer, "runtimeLaunchLink.textContent = 'Abrir campaña en CRIOS'"), 'direct CRIOS launch remains visible');
check(has(renderer, 'Cada publicación tiene un enlace propio e inmutable.'), 'immutable-link explanation remains visible');
check(has(renderer, "historyTitle.textContent = 'Historial de publicaciones'"), 'publication history remains visible');
check(has(renderer, "persistenceTitle.textContent = 'Persistencia local'"), 'local publication persistence remains visible');
check(has(renderer, "persistenceConsentText.textContent = 'Acepto borrar los datos locales de publicación.'"), 'clear consent no longer exposes activation terminology');
check(!has(renderer, "createPublicationRow('Referencias activas'"), 'persistence panel hides active-reference count');
check(!has(renderer, "createPublicationRow('Activaciones'"), 'persistence panel hides activation-record count');
check(!has(renderer, 'config.activation'), 'renderer public composition accepts no activation config');

check(has(remoteBootstrap, 'client: client || null'), 'remote publication bootstrap remains intact');
check(has(remoteBootstrap, 'return selection(true, service, client, null);'), 'remote publication service selection remains intact');
check(!has(remoteClient, 'activatePublication'), 'remote client no longer exposes activate operation');
check(!has(remoteClient, 'deactivatePublication'), 'remote client no longer exposes deactivate operation');
check(!has(studio, 'script.google.com/macros/s/'), 'Studio embeds no production endpoint');
check(!has(studio, 'teacher-secret'), 'Studio embeds no teacher secret');
check(!has(studio, 'writeToken:'), 'Studio constructs no literal write token');
check(!has(studio, 'fetch('), 'Studio composition performs no direct fetch transport');
check(!has(studio, 'XMLHttpRequest'), 'Studio composition performs no direct XHR transport');

const legacyFiles = [
  'js/publication/activation/activation-model.js',
  'js/publication/activation/activation-store.js',
  'js/publication/activation/activation-service.js',
  'js/publication/activation/activation-api.js',
  'js/studio/publication/studio-remote-activation-service.js',
  'js/studio/publication/studio-activation-controller.js'
];
legacyFiles.forEach(function(rel){
  check(fs.existsSync(path.join(repo, rel)), 'legacy activation implementation retained for later controlled retirement: ' + rel);
});

console.log('STUDIO_ACTIVATION_RETIREMENT_TEST_STATUS=' + (failed === 0 ? 'PASS' : 'FAIL'));
console.log('STUDIO_ACTIVATION_RETIREMENT_TEST_TOTAL=' + total);
console.log('STUDIO_ACTIVATION_RETIREMENT_TEST_FAILED=' + failed);
console.log('STUDIO_NORMAL_FLOW_LOADS_ACTIVATION=false');
console.log('STUDIO_NORMAL_FLOW_EXPOSES_ACTIVATION=false');
console.log('STUDIO_DIRECT_IMMUTABLE_PUBLICATION_ACCESS=true');
console.log('LEGACY_ACTIVATION_IMPLEMENTATION_RETAINED=true');
console.log('LEGACY_ACTIVATION_BACKEND_REMOVED=false');
console.log('REMOTE_CLIENT_MUTABLE_OPERATIONS=false');

process.exitCode = failed === 0 ? 0 : 1;
