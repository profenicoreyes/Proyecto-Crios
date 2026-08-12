'use strict';

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const repo = path.resolve(process.argv[2] || path.join(__dirname, '..'));
const read = rel => fs.readFileSync(path.join(repo, rel), 'utf8');

let total = 0;
let failed = 0;
function check(condition, message) {
  total += 1;
  if (!condition) {
    failed += 1;
    console.error('FAIL=' + message);
  }
}
function equal(actual, expected, message) {
  check(Object.is(actual, expected), message + ' actual=' + String(actual) + ' expected=' + String(expected));
}

function loadDraft(uuid) {
  const window = {
    crypto: {
      randomUUID() { return uuid; }
    }
  };
  window.window = window;
  const context = vm.createContext({
    window,
    Object,
    String,
    Boolean,
    Number,
    Array,
    RegExp,
    Error,
    Math,
    JSON,
    Map,
    Set,
    Date,
    structuredClone,
    console
  });
  vm.runInContext(read('js/studio/modelo/campaign-draft.js'), context, { filename: 'campaign-draft.js' });
  vm.runInContext(read('js/studio/publication/studio-publication-adapter.js'), context, { filename: 'studio-publication-adapter.js' });
  return { window, context };
}

const firstUuid = '11111111-1111-4111-8111-111111111111';
const secondUuid = '22222222-2222-4222-8222-222222222222';

{
  const { window } = loadDraft(firstUuid);
  const draftApi = window.CRIOS_CAMPAIGN_DRAFT;
  const expectedId = 'campaign-' + firstUuid;

  equal(draftApi.obtenerCampana().id, expectedId, 'new Studio draft receives its own campaign id');
  equal(draftApi.getCampaign().id, expectedId, 'compatibility snapshot preserves campaign id');

  draftApi.establecerNombre('Campaña con identidad estable');
  draftApi.establecerDescripcion('La identidad no cambia al editar el borrador.');
  draftApi.establecerEscenario('antartida');
  equal(draftApi.obtenerCampana().id, expectedId, 'campaign id remains stable across draft edits');

  const externalSnapshot = draftApi.obtenerCampana();
  externalSnapshot.id = 'tampered-outside';
  equal(draftApi.obtenerCampana().id, expectedId, 'external snapshots cannot mutate internal campaign id');

  const adapter = window.CRIOS_STUDIO_PUBLICATION_ADAPTER.createStudioPublicationAdapter({ draftApi });
  equal(adapter.getCampaignId(), expectedId, 'publication adapter resolves the generated campaign id');
}

{
  const first = loadDraft(firstUuid).window.CRIOS_CAMPAIGN_DRAFT.obtenerCampana().id;
  const second = loadDraft(secondUuid).window.CRIOS_CAMPAIGN_DRAFT.obtenerCampana().id;
  check(first !== second, 'independent new drafts receive different campaign ids');
}

console.log('STUDIO_CAMPAIGN_IDENTITY_TEST_STATUS=' + (failed ? 'FAIL' : 'PASS'));
console.log('STUDIO_CAMPAIGN_IDENTITY_TEST_TOTAL=' + total);
console.log('STUDIO_CAMPAIGN_IDENTITY_TEST_FAILED=' + failed);
if (failed) process.exit(1);
