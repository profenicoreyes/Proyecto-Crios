(function(){
  'use strict';

  var startedAt = performance.now();
  var assertions = [];
  var pageErrors = [];
  var consoleErrors = [];
  var unhandledRejections = [];
  var originalConsoleError = console.error;

  window.addEventListener('error', function(event){ pageErrors.push(String(event.error || event.message || 'PAGE_ERROR')); });
  window.addEventListener('unhandledrejection', function(event){ unhandledRejections.push(String(event.reason || 'UNHANDLED_REJECTION')); });
  console.error = function(){
    consoleErrors.push(Array.from(arguments).map(String).join(' '));
    originalConsoleError.apply(console, arguments);
  };

  function assert(id, condition, message) {
    assertions.push(Object.freeze({ id: id, passed: Boolean(condition), message: condition ? '' : String(message || id) }));
  }

  function baseConfig(runtimeLaunchState, activationState, persistenceState) {
    return {
      missions: [],
      draftMissions: [],
      isInDraft: function(){ return false; },
      getCampaignLabel: function(){ return 'Sin categoría'; },
      onAdd: function(){},
      onMove: function(){},
      onRemove: function(){},
      campaignName: 'Campaña de prueba',
      campaignDescription: 'Prueba de acceso a Runtime',
      campaignScenarioId: 'antartida',
      campaignScenario: 'Antártida',
      campaignDificultad: '',
      campaignDuracion: '',
      campaignNivel: '',
      campaignModalidad: '',
      escenarios: [],
      validacion: { valida: true, errores: [], advertencias: [] },
      publication: {
        state: { status: 'IDLE', busy: false, currentDraftRevision: '', lastValidation: null, lastResult: null },
        history: [],
        actions: {}
      },
      activation: {
        state: activationState || { status: 'INACTIVE', busy: false, activeReference: null },
        history: [],
        actions: {}
      },
      runtimeLaunch: { state: runtimeLaunchState },
      persistence: {
        state: persistenceState || { status: 'EMPTY', busy: false, activeReferenceCount: 0 },
        actions: {}
      },
      missionSpecs: { state: { status: 'IDLE', missionCount: 0, validSpecCount: 0, invalidSpecCount: 0, requiredHandlers: [], manifest: null, issues: [], lastValidation: null } }
    };
  }

  try {
    var api = window.CRIOS_STUDIO_RUNTIME_LAUNCH;
    assert('API_EXISTS', Boolean(api), 'La API no existe.');
    assert('API_FROZEN', Object.isFrozen(api), 'La API debe estar congelada.');
    assert('API_VERSION', api && api.version === '2.0.0', 'Versión inesperada.');
    assert('STATUS_FROZEN', api && Object.isFrozen(api.status), 'Los estados deben estar congelados.');

    var none = api.buildDescriptor({});
    assert('NO_PUBLICATION_UNAVAILABLE', none.available === false, 'Sin publicación no debe haber enlace.');
    assert('NO_PUBLICATION_STATUS', none.status === 'NO_PUBLICATION', 'Estado incorrecto sin publicación.');
    assert('NO_PUBLICATION_NO_HREF', none.href === null, 'No debe generar href sin publicación.');
    assert('NO_PUBLICATION_FROZEN', Object.isFrozen(none), 'Descriptor sin publicación no congelado.');

    var invalid = api.buildDescriptor({ publication: { campaignId: 'campana-a' } });
    assert('INVALID_PUBLICATION_UNAVAILABLE', invalid.available === false, 'Publicación incompleta no debe habilitarse.');
    assert('INVALID_PUBLICATION_STATUS', invalid.status === 'INVALID_PUBLICATION', 'Estado incorrecto para publicación inválida.');

    var available = api.buildDescriptor({
      publication: { campaignId: 'campaña con espacios/área', publicationId: 'pub-a' },
      runtimePath: '../index.html'
    });
    assert('AVAILABLE_TRUE', available.available === true, 'Una publicación válida debe estar disponible.');
    assert('AVAILABLE_STATUS', available.status === 'AVAILABLE', 'Estado disponible incorrecto.');
    assert('AVAILABLE_CAMPAIGN', available.campaignId === 'campaña con espacios/área', 'campaignId alterado.');
    assert('AVAILABLE_PUBLICATION', available.publicationId === 'pub-a', 'publicationId alterado.');
    assert('AVAILABLE_HREF', available.href === '../index.html?source=published&campaignId=campa%C3%B1a%20con%20espacios%2F%C3%A1rea&publicationId=pub-a', 'Enlace incorrecto.');
    assert('AVAILABLE_TARGET', available.target === '_blank', 'Target incorrecto.');
    assert('AVAILABLE_REL', available.rel === 'noopener', 'Rel incorrecto.');
    assert('AVAILABLE_FROZEN', Object.isFrozen(available), 'Descriptor disponible no congelado.');
    assert('AVAILABLE_IMMUTABLE_MESSAGE', /inmutable/.test(available.message), 'El mensaje debe explicar la inmutabilidad del enlace.');

    var samePublicationWithoutPersistence = api.buildDescriptor({
      publication: { campaignId: 'campaña con espacios/área', publicationId: 'pub-a' },
      persistenceState: { status: 'UNAVAILABLE', activeReferenceCount: 0 },
      activationBusy: true,
      runtimePath: '../index.html'
    });
    assert('PERSISTENCE_DOES_NOT_GATE_LINK', samePublicationWithoutPersistence.available === true, 'La persistencia local no debe bloquear un enlace remoto inmutable.');
    assert('ACTIVATION_DOES_NOT_GATE_LINK', samePublicationWithoutPersistence.href === available.href, 'La activación no debe alterar el enlace de publicación.');

    var runtimeLaunchContract = window.CRIOS_RUNTIME_LAUNCH;
    var runtimeInvalidCampaignId = new Array(162).join('a');
    var runtimeContractError = null;
    try {
      runtimeLaunchContract.buildPublishedLaunchSearch(runtimeInvalidCampaignId, 'pub-runtime-invalid');
    } catch (error) {
      runtimeContractError = error;
    }
    var runtimeInvalidDescriptor = api.buildDescriptor({
      publication: { campaignId: runtimeInvalidCampaignId, publicationId: 'pub-runtime-invalid' },
      runtimePath: '../index.html'
    });
    assert(
      'A2_014E_STUDIO_REJECTS_RUNTIME_INVALID_CAMPAIGN_ID',
      Boolean(runtimeLaunchContract) &&
        runtimeContractError && runtimeContractError.code === 'INVALID_CAMPAIGN_ID' &&
        runtimeInvalidDescriptor.available === false &&
        runtimeInvalidDescriptor.status === 'INVALID_PUBLICATION' &&
        runtimeInvalidDescriptor.href === null,
      'Studio debe bloquear el campaignId que Runtime rechaza.'
    );

    var runtimeInvalidPublicationId = new Array(202).join('p');
    var runtimePublicationContractError = null;
    try {
      runtimeLaunchContract.buildPublishedLaunchSearch('campana-runtime-valid', runtimeInvalidPublicationId);
    } catch (error) {
      runtimePublicationContractError = error;
    }
    var runtimeInvalidPublicationDescriptor = api.buildDescriptor({
      publication: { campaignId: 'campana-runtime-valid', publicationId: runtimeInvalidPublicationId },
      runtimePath: '../index.html'
    });
    assert(
      'A3_003B3_STUDIO_REJECTS_RUNTIME_INVALID_PUBLICATION_ID',
      Boolean(runtimeLaunchContract) &&
        runtimePublicationContractError && runtimePublicationContractError.code === 'INVALID_PUBLICATION_ID' &&
        runtimeInvalidPublicationDescriptor.available === false &&
        runtimeInvalidPublicationDescriptor.status === 'INVALID_PUBLICATION' &&
        runtimeInvalidPublicationDescriptor.href === null,
      'Studio debe bloquear el publicationId que Runtime rechaza.'
    );

    window.CRIOS_STUDIO_RENDERER.render(baseConfig(none));
    var link = document.getElementById('studioRuntimeLaunchLink');
    var status = document.getElementById('studioRuntimeLaunchStatus');
    assert('RENDER_LINK_EXISTS', Boolean(link), 'El enlace no fue creado.');
    assert('RENDER_STATUS_EXISTS', Boolean(status), 'El estado no fue creado.');
    assert('RENDER_UNAVAILABLE_HIDDEN', link.hidden === true, 'El enlace debe estar oculto sin publicación.');
    assert('RENDER_UNAVAILABLE_NO_HREF', !link.hasAttribute('href'), 'No debe conservar href sin disponibilidad.');
    assert('RENDER_UNAVAILABLE_STATUS', status.dataset.status === 'NO_PUBLICATION', 'Estado DOM incorrecto sin publicación.');
    assert('RENDER_UNAVAILABLE_MESSAGE', /Publicá una versión/.test(status.textContent), 'Mensaje DOM incorrecto sin publicación.');

    var inactiveState = { status: 'INACTIVE', busy: false, activeReference: null };
    var unavailablePersistence = { status: 'UNAVAILABLE', busy: false, activeReferenceCount: 0, publicationCount: 0, activationRecordCount: 0 };
    window.CRIOS_STUDIO_RENDERER.render(baseConfig(available, inactiveState, unavailablePersistence));
    link = document.getElementById('studioRuntimeLaunchLink');
    status = document.getElementById('studioRuntimeLaunchStatus');
    assert('RENDER_AVAILABLE_VISIBLE', link.hidden === false, 'El enlace publicado debe mostrarse sin activación.');
    assert('RENDER_AVAILABLE_HREF', link.getAttribute('href') === available.href, 'Href DOM incorrecto.');
    assert('RENDER_AVAILABLE_TARGET', link.getAttribute('target') === '_blank', 'Target DOM incorrecto.');
    assert('RENDER_AVAILABLE_REL', link.getAttribute('rel') === 'noopener', 'Rel DOM incorrecto.');
    assert('RENDER_AVAILABLE_TEXT', link.textContent.trim() === 'Abrir campaña en CRIOS', 'Texto del enlace incorrecto.');
    assert('RENDER_AVAILABLE_CAMPAIGN_DATA', link.dataset.campaignId === available.campaignId, 'campaignId DOM incorrecto.');
    assert('RENDER_AVAILABLE_PUBLICATION_DATA', link.dataset.publicationId === available.publicationId, 'publicationId DOM incorrecto.');
    assert('RENDER_AVAILABLE_STATUS', status.dataset.status === 'AVAILABLE', 'Estado DOM disponible incorrecto.');
    assert('RENDER_AVAILABLE_MESSAGE', /inmutable/.test(status.textContent), 'Mensaje DOM disponible incorrecto.');

    window.CRIOS_STUDIO_RENDERER.render(baseConfig(none, inactiveState, unavailablePersistence));
    link = document.getElementById('studioRuntimeLaunchLink');
    status = document.getElementById('studioRuntimeLaunchStatus');
    assert('RERENDER_HIDES_LINK', link.hidden === true, 'El enlace debe ocultarse cuando no existe publicación.');
    assert('RERENDER_REMOVES_HREF', !link.hasAttribute('href'), 'Debe eliminar href al no existir publicación.');
    assert('RERENDER_REMOVES_TARGET', !link.hasAttribute('target'), 'Debe eliminar target al no existir publicación.');
    assert('RERENDER_REMOVES_REL', !link.hasAttribute('rel'), 'Debe eliminar rel al no existir publicación.');
    assert('RERENDER_REMOVES_CAMPAIGN_DATA', !Object.prototype.hasOwnProperty.call(link.dataset, 'campaignId'), 'Debe eliminar campaignId del DOM.');
    assert('RERENDER_STATUS', status.dataset.status === 'NO_PUBLICATION', 'Estado DOM final incorrecto.');
  } catch (error) {
    assertions.push(Object.freeze({ id: 'UNEXPECTED_EXCEPTION', passed: false, message: String(error && error.stack || error) }));
  } finally {
    console.error = originalConsoleError;
  }

  var failed = assertions.filter(function(item){ return !item.passed; });
  var result = Object.freeze({
    status: failed.length === 0 && pageErrors.length === 0 && consoleErrors.length === 0 && unhandledRejections.length === 0 ? 'PASS' : 'FAIL',
    total: assertions.length,
    passed: assertions.length - failed.length,
    failed: failed.length,
    assertions: Object.freeze(assertions.slice()),
    pageErrors: Object.freeze(pageErrors.slice()),
    consoleErrors: Object.freeze(consoleErrors.slice()),
    unhandledRejections: Object.freeze(unhandledRejections.slice()),
    durationMs: Number((performance.now() - startedAt).toFixed(3))
  });

  Object.defineProperty(window, 'CRIOS_STUDIO_RUNTIME_LAUNCH_TEST_RESULTS', {
    value: result,
    enumerable: true,
    configurable: false,
    writable: false
  });

  document.getElementById('testOutput').textContent = JSON.stringify(result, null, 2);
})();
