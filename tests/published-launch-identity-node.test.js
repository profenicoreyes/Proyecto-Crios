'use strict';

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const repo = path.resolve(process.argv[2] || path.join(__dirname, '..'));
const failures = [];
let total = 0;

function check(name, condition, detail) {
  total += 1;
  if (!condition) failures.push(name + (detail ? ': ' + detail : ''));
}
function equal(name, actual, expected) {
  check(name, Object.is(actual, expected), 'actual=' + String(actual) + ' expected=' + String(expected));
}
function load(relativePath, context) {
  const source = fs.readFileSync(path.join(repo, relativePath), 'utf8');
  vm.runInContext(source, context, { filename: relativePath });
  return source;
}
function context() {
  const window = {};
  window.window = window;
  window.top = window;
  window.self = window;
  window.location = { search: '', replace() {} };
  const ctx = vm.createContext({ window, URLSearchParams, decodeURIComponent, encodeURIComponent });
  return { window, ctx };
}

const shared = context();
const launchSource = load('js/runtime/launch/runtime-launch-contract.js', shared.ctx);
const selectionSource = load('js/runtime/launch/runtime-launch-selection.js', shared.ctx);
const gateSource = load('js/runtime/launch/runtime-entry-gate.js', shared.ctx);
const studioSource = load('js/studio/publication/studio-runtime-launch.js', shared.ctx);
const criosSource = fs.readFileSync(path.join(repo, 'js/crios.js'), 'utf8');

const launch = shared.window.CRIOS_RUNTIME_LAUNCH;
const selection = shared.window.CRIOS_RUNTIME_LAUNCH_SELECTION;
const gate = shared.window.CRIOS_RUNTIME_ENTRY_GATE;
const studio = shared.window.CRIOS_STUDIO_RUNTIME_LAUNCH;

check('launch api exists', Boolean(launch));
equal('launch version', launch.version, '1.1.0');
equal('publication parameter name', launch.constants.parameters.PUBLICATION_ID, 'publicationId');
equal('publication max length', launch.constants.maxPublicationIdLength, 200);
equal('publication required code', launch.constants.errorCodes.PUBLICATION_ID_REQUIRED, 'PUBLICATION_ID_REQUIRED');
equal('publication invalid code', launch.constants.errorCodes.INVALID_PUBLICATION_ID, 'INVALID_PUBLICATION_ID');
equal('publication legacy code', launch.constants.errorCodes.PUBLICATION_ID_NOT_ALLOWED, 'PUBLICATION_ID_NOT_ALLOWED');

const canonical = launch.buildPublishedLaunchSearch(' campaña uno ', ' publicación uno ');
equal('canonical includes both ids', canonical, '?source=published&campaignId=campa%C3%B1a%20uno&publicationId=publicaci%C3%B3n%20uno');
check('canonical omits content hash', canonical.indexOf('contentHash') < 0);
const resolved = launch.resolveLaunchRequest(canonical);
check('canonical resolves', resolved.success === true);
equal('resolved source', resolved.request.sourceMode, 'published');
equal('resolved campaign', resolved.request.campaignId, 'campaña uno');
equal('resolved publication', resolved.request.publicationId, 'publicación uno');
check('resolved frozen', Object.isFrozen(resolved) && Object.isFrozen(resolved.request));
check('resolved validates', launch.isLaunchResolution(resolved));
equal('request exact key count', Object.keys(resolved.request).length, 4);
check('request has publicationId key', Object.prototype.hasOwnProperty.call(resolved.request, 'publicationId'));

const noPublication = launch.resolveLaunchRequest('?source=published&campaignId=campana');
check('missing publication blocked', noPublication.success === false);
equal('missing publication code', noPublication.error.code, 'PUBLICATION_ID_REQUIRED');
equal('missing publication parameter', noPublication.error.parameter, 'publicationId');
const noCampaign = launch.resolveLaunchRequest('?source=published&publicationId=pub');
check('missing campaign blocked', noCampaign.success === false);
equal('missing campaign code', noCampaign.error.code, 'CAMPAIGN_ID_REQUIRED');
const isolatedPublication = launch.resolveLaunchRequest('?publicationId=pub');
check('isolated publication blocked', isolatedPublication.success === false);
equal('isolated publication source required', isolatedPublication.error.code, 'SOURCE_REQUIRED');
const legacyPublication = launch.resolveLaunchRequest('?source=legacy&publicationId=pub');
check('legacy publication blocked', legacyPublication.success === false);
equal('legacy publication code', legacyPublication.error.code, 'PUBLICATION_ID_NOT_ALLOWED');
const duplicatePublication = launch.resolveLaunchRequest('?source=published&campaignId=camp&publicationId=a&publicationId=b');
check('duplicate publication blocked', duplicatePublication.success === false);
equal('duplicate publication code', duplicatePublication.error.code, 'DUPLICATE_PARAMETER');
equal('duplicate publication parameter', duplicatePublication.error.parameter, 'publicationId');
const emptyPublication = launch.resolveLaunchRequest('?source=published&campaignId=camp&publicationId=');
check('empty publication blocked', emptyPublication.success === false);
equal('empty publication code', emptyPublication.error.code, 'INVALID_PUBLICATION_ID');
const controlPublication = launch.resolveLaunchRequest('?source=published&campaignId=camp&publicationId=a%0Ab');
check('control publication blocked', controlPublication.success === false);
equal('control publication code', controlPublication.error.code, 'INVALID_PUBLICATION_ID');
const maxPublication = 'p'.repeat(200);
equal('max publication accepted', launch.resolveLaunchRequest(launch.buildPublishedLaunchSearch('camp', maxPublication)).request.publicationId.length, 200);
const overPublication = launch.resolveLaunchRequest('?source=published&campaignId=camp&publicationId=' + 'p'.repeat(201));
check('over publication blocked', overPublication.success === false);
equal('over publication code', overPublication.error.code, 'INVALID_PUBLICATION_ID');
let builderError = null;
try { launch.buildPublishedLaunchSearch('camp', ''); } catch (error) { builderError = error; }
equal('builder publication error code', builderError && builderError.code, 'INVALID_PUBLICATION_ID');
equal('builder publication error parameter', builderError && builderError.parameter, 'publicationId');

check('selection api exists', Boolean(selection));
equal('selection version', selection.version, '1.1.0');
const selected = selection.selectRuntimeLaunch('legacy', canonical, launch);
check('selected validates', selection.isRuntimeLaunchSelection(selected));
check('selected explicit', selected.explicit === true);
check('selected not blocked', selected.blocked === false);
equal('selected mode', selected.sourceMode, 'published');
equal('selected campaign', selected.campaignId, 'campaña uno');
equal('selected publication', selected.publicationId, 'publicación uno');
const selectedMissingPublication = selection.selectRuntimeLaunch('legacy', '?source=published&campaignId=camp', launch);
check('selection missing publication blocked', selectedMissingPublication.blocked === true);
equal('selection missing publication code', selectedMissingPublication.error.code, 'PUBLICATION_ID_REQUIRED');
const selectedNoContract = selection.selectRuntimeLaunch('legacy', '?publicationId=pub', null);
check('selection no contract recognizes publication param', selectedNoContract.blocked === true);
equal('selection no contract code', selectedNoContract.error.code, 'LAUNCH_CONTRACT_UNAVAILABLE');
const defaultLegacy = selection.selectRuntimeLaunch('legacy', '', launch);
check('default legacy validates', selection.isRuntimeLaunchSelection(defaultLegacy));
equal('default legacy publication null', defaultLegacy.publicationId, null);

check('entry gate exists', Boolean(gate));
equal('entry gate version', gate.version, '1.1.0');
equal('no query goes studio', gate.resolveEntry(''), gate.routes.STUDIO);
equal('legacy goes studio', gate.resolveEntry('?source=legacy'), gate.routes.STUDIO);
equal('published identity goes runtime', gate.resolveEntry(canonical), gate.routes.RUNTIME);
equal('publication alone stays runtime candidate', gate.resolveEntry('?publicationId=pub'), gate.routes.RUNTIME);
equal('missing publication stays runtime candidate', gate.resolveEntry('?source=published&campaignId=camp'), gate.routes.RUNTIME);

check('studio launch api exists', Boolean(studio));
equal('studio launch version', studio.version, '1.1.0');
const descriptor = studio.buildDescriptor({
  activeReference: { campaignId: 'campaña uno', publicationId: 'publicación uno' },
  persistenceState: { status: 'READY', activeReferenceCount: 1 },
  runtimePath: '../index.html'
});
check('studio descriptor available', descriptor.available === true);
equal('studio descriptor campaign', descriptor.campaignId, 'campaña uno');
equal('studio descriptor publication', descriptor.publicationId, 'publicación uno');
equal('studio descriptor href', descriptor.href, '../index.html' + canonical);
check('studio descriptor frozen', Object.isFrozen(descriptor));
const invalidDescriptor = studio.buildDescriptor({
  activeReference: { campaignId: 'camp', publicationId: 'p'.repeat(201) },
  persistenceState: { status: 'READY', activeReferenceCount: 1 }
});
check('studio invalid publication blocked', invalidDescriptor.available === false);
equal('studio invalid publication status', invalidDescriptor.status, 'INVALID_ACTIVE_REFERENCE');

check('crios fallback carries publicationId', /campaignId:\s*null,\s*publicationId:\s*null,\s*error:/.test(criosSource));
check('crios reads selected publicationId', criosSource.indexOf('const requestedPublishedPublicationId = runtimeLaunchState.publicationId;') >= 0);
check('crios passes publicationId to bootstrap boundary', criosSource.indexOf('publicationId:requestedPublishedPublicationId') >= 0);
check('crios does not derive publicationId from storage', criosSource.indexOf('requestedPublishedPublicationId = sessionStorage') < 0);

for (const [name, source] of [
  ['launch contract', launchSource],
  ['launch selection', selectionSource],
  ['entry gate', gateSource],
  ['studio runtime launch', studioSource]
]) {
  check(name + ' has no fetch transport', source.indexOf('fetch(') < 0);
  check(name + ' has no XMLHttpRequest', source.indexOf('XMLHttpRequest') < 0);
}

console.log('PUBLISHED_LAUNCH_IDENTITY_TEST_STATUS=' + (failures.length ? 'FAIL' : 'PASS'));
console.log('PUBLISHED_LAUNCH_IDENTITY_TEST_TOTAL=' + total);
console.log('PUBLISHED_LAUNCH_IDENTITY_TEST_FAILED=' + failures.length);
console.log('PUBLISHED_LAUNCH_REQUIRES_CAMPAIGN_AND_PUBLICATION=true');
console.log('PUBLISHED_LAUNCH_SELECTION_PRESERVES_PUBLICATION_ID=true');
console.log('STUDIO_SHARED_LINK_CONTAINS_PUBLICATION_ID=true');
console.log('INVALID_PUBLISHED_IDENTITY_FAILS_CLOSED=true');
console.log('PUBLISHED_LAUNCH_CONTENT_HASH_IN_URL=false');
console.log('PUBLISHED_LAUNCH_REAL_NETWORK=false');
if (failures.length) {
  failures.forEach((failure) => console.error('FAIL=' + failure));
  process.exit(1);
}
