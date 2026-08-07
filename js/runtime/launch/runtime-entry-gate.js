/* CRIOS Runtime — top-level entry gate */
(function(){
  'use strict';

  var ROUTES = Object.freeze({
    STUDIO: 'studio',
    RUNTIME: 'runtime'
  });

  function knownValues(search) {
    var params;
    try {
      params = new URLSearchParams(search == null ? '' : String(search));
    } catch (error) {
      return { source: [], campaignId: [] };
    }
    return {
      source: params.getAll('source'),
      campaignId: params.getAll('campaignId')
    };
  }

  function resolveEntry(search) {
    var values = knownValues(search);
    var sources = values.source;
    var campaignIds = values.campaignId;

    if (sources.length === 0 && campaignIds.length === 0) return ROUTES.STUDIO;
    if (sources.length === 1 && sources[0] === 'legacy' && campaignIds.length === 0) return ROUTES.STUDIO;
    return ROUTES.RUNTIME;
  }

  function enforce(options) {
    var opts = options && typeof options === 'object' ? options : {};
    var topLevel = window.top === window.self;
    var route = resolveEntry(window.location && window.location.search);
    var studioHref = typeof opts.studioHref === 'string' && opts.studioHref.trim()
      ? opts.studioHref.trim()
      : './studio/index.html';

    if (topLevel && route === ROUTES.STUDIO) {
      window.location.replace(studioHref);
      return Object.freeze({ route: route, redirected: true, studioHref: studioHref });
    }

    return Object.freeze({ route: route, redirected: false, studioHref: studioHref });
  }

  window.CRIOS_RUNTIME_ENTRY_GATE = Object.freeze({
    version: '1.0.0',
    routes: ROUTES,
    resolveEntry: resolveEntry,
    enforce: enforce
  });
})();
