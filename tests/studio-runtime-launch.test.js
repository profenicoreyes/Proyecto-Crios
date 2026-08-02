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
    assert('API_VERSION', api && api.version === '1.0.0', 'Versión inesperada.');
    assert('STATUS_FROZEN', api && Object.isFrozen(api.status), 'Los estados deben estar congelados.');

    var busyWithoutActive = api.buildDescriptor({
      activationBusy: true,
      persistenceState: { status: 'READY', activeReferenceCount: 0 }
    });
    assert('BUSY_WITHOUT_ACTIVE_UNAVAILABLE', busyWithoutActive.available === false, 'No debe abrir durante una primera activación.');
    assert('BUSY_WITHOUT_ACTIVE_STATUS', busyWithoutActive.status === 'ACTIVATION_BUSY', 'La primera activación debe informar estado ocupado.');

    var noActive = api.buildDescriptor({ persistenceState: { status: 'READY', activeReferenceCount: 1 } });
    assert('NO_ACTIVE_UNAVAILABLE', noActive.available === false, 'Sin activa no debe estar disponible.');
    assert('NO_ACTIVE_STATUS', noActive.status === 'NO_ACTIVE_PUBLICATION', 'Estado incorrecto sin activa.');
    assert('NO_ACTIVE_NO_HREF', noActive.href === null, 'No debe generar enlace sin activa.');
    assert('NO_ACTIVE_FROZEN', Object.isFrozen(noActive), 'Descriptor sin activa no congelado.');

    var invalid = api.buildDescriptor({ activeReference: { campaignId: 'campana-a' }, persistenceState: { status: 'READY', activeReferenceCount: 1 } });
    assert('INVALID_REFERENCE_UNAVAILABLE', invalid.available === false, 'Referencia incompleta no debe habilitarse.');
    assert('INVALID_REFERENCE_STATUS', invalid.status === 'INVALID_ACTIVE_REFERENCE', 'Estado incorrecto para referencia inválida.');

    var busy = api.buildDescriptor({
      activeReference: { campaignId: 'campana-a', publicationId: 'pub-a' },
      activationBusy: true,
      persistenceState: { status: 'READY', activeReferenceCount: 1 }
    });
    assert('BUSY_UNAVAILABLE', busy.available === false, 'No debe abrir durante activación.');
    assert('BUSY_STATUS', busy.status === 'ACTIVATION_BUSY', 'Estado incorrecto durante activación.');

    var unavailablePersistence = api.buildDescriptor({
      activeReference: { campaignId: 'campana-a', publicationId: 'pub-a' },
      persistenceState: { status: 'UNAVAILABLE', activeReferenceCount: 0 }
    });
    assert('PERSISTENCE_UNAVAILABLE_BLOCKS', unavailablePersistence.available === false, 'Sin persistencia no debe habilitarse.');
    assert('PERSISTENCE_UNAVAILABLE_STATUS', unavailablePersistence.status === 'PERSISTENCE_UNAVAILABLE', 'Estado incorrecto sin persistencia.');

    var notPersisted = api.buildDescriptor({
      activeReference: { campaignId: 'campana-a', publicationId: 'pub-a' },
      persistenceState: { status: 'READY', activeReferenceCount: 0 }
    });
    assert('NOT_PERSISTED_BLOCKS', notPersisted.available === false, 'Una referencia no persistida no debe habilitarse.');
    assert('NOT_PERSISTED_STATUS', notPersisted.status === 'ACTIVE_REFERENCE_NOT_PERSISTED', 'Estado incorrecto para referencia no persistida.');

    var missingPersistenceCount = api.buildDescriptor({
      activeReference: { campaignId: 'campana-a', publicationId: 'pub-a' },
      persistenceState: { status: 'READY' }
    });
    assert('MISSING_PERSISTENCE_COUNT_BLOCKS', missingPersistenceCount.available === false, 'Debe comprobar que la referencia figure en persistencia.');
    assert('MISSING_PERSISTENCE_COUNT_STATUS', missingPersistenceCount.status === 'ACTIVE_REFERENCE_NOT_PERSISTED', 'Estado incorrecto sin conteo persistido.');

    var available = api.buildDescriptor({
      activeReference: { campaignId: 'campaña con espacios/área', publicationId: 'pub-a' },
      persistenceState: { status: 'READY', activeReferenceCount: 1 },
      runtimePath: '../index.html'
    });
    assert('AVAILABLE_TRUE', available.available === true, 'La referencia persistida debe estar disponible.');
    assert('AVAILABLE_STATUS', available.status === 'AVAILABLE', 'Estado disponible incorrecto.');
    assert('AVAILABLE_CAMPAIGN', available.campaignId === 'campaña con espacios/área', 'campaignId alterado.');
    assert('AVAILABLE_PUBLICATION', available.publicationId === 'pub-a', 'publicationId alterado.');
    assert('AVAILABLE_HREF', available.href === '../index.html?source=published&campaignId=campa%C3%B1a%20con%20espacios%2F%C3%A1rea', 'Enlace incorrecto.');
    assert('AVAILABLE_TARGET', available.target === '_blank', 'Target incorrecto.');
    assert('AVAILABLE_REL', available.rel === 'noopener', 'Rel incorrecto.');
    assert('AVAILABLE_FROZEN', Object.isFrozen(available), 'Descriptor disponible no congelado.');

    window.CRIOS_STUDIO_RENDERER.render(baseConfig(noActive));
    var link = document.getElementById('studioRuntimeLaunchLink');
    var status = document.getElementById('studioRuntimeLaunchStatus');
    assert('RENDER_LINK_EXISTS', Boolean(link), 'El enlace no fue creado.');
    assert('RENDER_STATUS_EXISTS', Boolean(status), 'El estado no fue creado.');
    assert('RENDER_UNAVAILABLE_HIDDEN', link.hidden === true, 'El enlace debe estar oculto sin activa.');
    assert('RENDER_UNAVAILABLE_NO_HREF', !link.hasAttribute('href'), 'No debe conservar href sin disponibilidad.');
    assert('RENDER_UNAVAILABLE_STATUS', status.dataset.status === 'NO_ACTIVE_PUBLICATION', 'Estado DOM incorrecto sin activa.');
    assert('RENDER_UNAVAILABLE_MESSAGE', /Activá una publicación/.test(status.textContent), 'Mensaje DOM incorrecto sin activa.');

    var activationState = {
      status: 'ACTIVE',
      busy: false,
      activeReference: { campaignId: 'campaña con espacios/área', publicationId: 'pub-a', version: 1, contentHash: 'abcdef1234567890' }
    };
    var persistenceState = { status: 'READY', busy: false, activeReferenceCount: 1, publicationCount: 1, activationRecordCount: 1 };
    window.CRIOS_STUDIO_RENDERER.render(baseConfig(available, activationState, persistenceState));
    link = document.getElementById('studioRuntimeLaunchLink');
    status = document.getElementById('studioRuntimeLaunchStatus');
    assert('RENDER_AVAILABLE_VISIBLE', link.hidden === false, 'El enlace disponible debe mostrarse.');
    assert('RENDER_AVAILABLE_HREF', link.getAttribute('href') === available.href, 'Href DOM incorrecto.');
    assert('RENDER_AVAILABLE_TARGET', link.getAttribute('target') === '_blank', 'Target DOM incorrecto.');
    assert('RENDER_AVAILABLE_REL', link.getAttribute('rel') === 'noopener', 'Rel DOM incorrecto.');
    assert('RENDER_AVAILABLE_TEXT', link.textContent.trim() === 'Abrir campaña en CRIOS', 'Texto del enlace incorrecto.');
    assert('RENDER_AVAILABLE_CAMPAIGN_DATA', link.dataset.campaignId === available.campaignId, 'campaignId DOM incorrecto.');
    assert('RENDER_AVAILABLE_PUBLICATION_DATA', link.dataset.publicationId === available.publicationId, 'publicationId DOM incorrecto.');
    assert('RENDER_AVAILABLE_STATUS', status.dataset.status === 'AVAILABLE', 'Estado DOM disponible incorrecto.');
    assert('RENDER_AVAILABLE_MESSAGE', /activa y guardada/.test(status.textContent), 'Mensaje DOM disponible incorrecto.');

    window.CRIOS_STUDIO_RENDERER.render(baseConfig(notPersisted, activationState, { status: 'READY', busy: false, activeReferenceCount: 0 }));
    link = document.getElementById('studioRuntimeLaunchLink');
    status = document.getElementById('studioRuntimeLaunchStatus');
    assert('RERENDER_HIDES_LINK', link.hidden === true, 'El enlace debe ocultarse al perder persistencia.');
    assert('RERENDER_REMOVES_HREF', !link.hasAttribute('href'), 'Debe eliminar href al bloquearse.');
    assert('RERENDER_REMOVES_TARGET', !link.hasAttribute('target'), 'Debe eliminar target al bloquearse.');
    assert('RERENDER_REMOVES_REL', !link.hasAttribute('rel'), 'Debe eliminar rel al bloquearse.');
    assert('RERENDER_REMOVES_CAMPAIGN_DATA', !Object.prototype.hasOwnProperty.call(link.dataset, 'campaignId'), 'Debe eliminar campaignId del DOM.');
    assert('RERENDER_STATUS', status.dataset.status === 'ACTIVE_REFERENCE_NOT_PERSISTED', 'Estado DOM final incorrecto.');
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
