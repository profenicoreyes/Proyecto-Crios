/* CRIOS A3-003A - top-level entry routing contract */
(function(){
  'use strict';

  var results = [];
  var failed = [];
  function equal(id, actual, expected) {
    results.push(id);
    if (actual === expected) return;
    failed.push({ id: id, actual: actual, expected: expected });
  }

  var api = window.CRIOS_RUNTIME_ENTRY_GATE;
  equal('API_AVAILABLE', Boolean(api), true);
  equal('NO_QUERY_TO_STUDIO', api.resolveEntry(''), api.routes.STUDIO);
  equal('UNRELATED_QUERY_TO_STUDIO', api.resolveEntry('?foo=bar'), api.routes.STUDIO);
  equal('EXPLICIT_LEGACY_TO_STUDIO', api.resolveEntry('?source=legacy'), api.routes.STUDIO);
  equal('PUBLISHED_WITH_CAMPAIGN_TO_RUNTIME', api.resolveEntry('?source=published&campaignId=campana-1'), api.routes.RUNTIME);
  equal('PUBLISHED_WITHOUT_CAMPAIGN_STAYS_RUNTIME_CANDIDATE', api.resolveEntry('?source=published'), api.routes.RUNTIME);
  equal('CAMPAIGN_WITHOUT_SOURCE_STAYS_RUNTIME_CANDIDATE', api.resolveEntry('?campaignId=campana-1'), api.routes.RUNTIME);
  equal('INVALID_SOURCE_STAYS_RUNTIME_CANDIDATE', api.resolveEntry('?source=other'), api.routes.RUNTIME);
  equal('DUPLICATE_SOURCE_STAYS_RUNTIME_CANDIDATE', api.resolveEntry('?source=legacy&source=published'), api.routes.RUNTIME);

  var result = Object.freeze({
    status: failed.length === 0 ? 'PASS' : 'FAIL',
    total: results.length,
    passed: results.length - failed.length,
    failed: failed.length,
    failedAssertions: failed.slice()
  });
  window.CRIOS_RUNTIME_ENTRY_GATE_TEST_RESULTS = result;
  document.getElementById('results').textContent = JSON.stringify(result, null, 2);
})();
