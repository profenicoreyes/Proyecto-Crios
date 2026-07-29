/* CRIOS Studio — bootstrap y coordinador */
(function(){
  'use strict';

  function el(id){ return document.getElementById(id); }

  var studioPublicationController = null;
  var studioActivationController = null;
  var studioPersistenceController = null;
  var studioMissionSpecController = null;

  function safeText(element, text){
    if (!element) return;
    element.textContent = text;
  }

  const DOMAIN_SCRIPT_PATHS = [
    '../js/release/release-model.js',
    '../js/release/release-validator.js',
    '../js/release/release-factory.js',
    '../js/publish/publish-service.js',
    '../js/share/share-validator.js',
    '../js/share/share-model.js',
    '../js/share/share-service.js',
    '../js/session/session-model.js',
    '../js/session/session-validator.js',
    '../js/session/session-factory.js',
    '../js/player-state/player-state-validator.js',
    '../js/player-state/player-state-service.js',
    '../js/runtime/runtime-core.js',
    '../js/navigation/navigation-core.js'
  ];

  let domainModulesPromise = null;

  function registerDomainModule(name, contract) {
    window.CRIOS_DOMAIN = window.CRIOS_DOMAIN || {};
    window.CRIOS_DOMAIN[name] = contract;
  }

  function loadDomainScript(src) {
    return new Promise((resolve, reject) => {
      const existing = document.querySelector('script[data-crios-domain="' + src + '"]');
      if (existing) {
        resolve();
        return;
      }

      const script = document.createElement('script');
      script.src = src;
      script.async = false;
      script.dataset.criosDomain = src;
      script.onload = () => resolve();
      script.onerror = () => reject(new Error('No se pudo cargar módulo de dominio: ' + src));
      document.head.appendChild(script);
    });
  }

  function ensureDomainModulesLoaded() {
    if (domainModulesPromise) return domainModulesPromise;

    window.__CRIOS_REGISTER_DOMAIN_MODULE__ = registerDomainModule;

    domainModulesPromise = DOMAIN_SCRIPT_PATHS.reduce(
      (chain, src) => chain.then(() => loadDomainScript(src)),
      Promise.resolve()
    ).finally(() => {
      delete window.__CRIOS_REGISTER_DOMAIN_MODULE__;
    });

    return domainModulesPromise;
  }

  function obtenerNivelDificultadMision(mision) {
    const nivel = Number(mision && (mision.dificultadNivel ?? mision.dificultad ?? mision.clasificacion?.dificultad));
    if (!Number.isFinite(nivel) || nivel <= 0) return 1;
    return Math.max(1, Math.min(6, Math.round(nivel)));
  }

  function obtenerDuracionMision(mision) {
    const duracion = Number(mision && (mision.duracionMinutos ?? mision.duracionEstimadaMinutos ?? mision.duracion));
    if (!Number.isFinite(duracion) || duracion < 0) return 0;
    return Math.max(0, Math.round(duracion));
  }

  function normalizarMisionVista(mision) {
    return Object.assign({}, mision, {
      dificultadNivel: obtenerNivelDificultadMision(mision),
      duracionMinutos: obtenerDuracionMision(mision)
    });
  }

  function calculateMissionIndicators(misiones) {
    const lista = Array.isArray(misiones) ? misiones : [];
    const calculateReleaseMetadata = getDomainContract(
      ['releaseModel', 'calculateReleaseMetadata'],
      'No se pueden calcular indicadores de campaña: ReleaseModel no disponible.'
    );

    const metadata = calculateReleaseMetadata(lista);
    return {
      cantidad: Number(metadata.missionCount) || 0,
      duracionTotal: Number(metadata.estimatedDuration) || 0,
      dificultadNivel: Number(metadata.averageDifficulty) || 0
    };
  }

  function obtenerContextoEscenarios(draftScenarioId) {
    let escenarios = [];
    let escenarioActual = null;
    if (typeof REGISTRO_ESCENARIOS !== 'undefined' && typeof REGISTRO_ESCENARIOS.listar === 'function') {
      escenarios = REGISTRO_ESCENARIOS.listar();
      if (typeof REGISTRO_ESCENARIOS.obtener === 'function') {
        escenarioActual = REGISTRO_ESCENARIOS.obtener(draftScenarioId);
      }
    }

    let draftScenarioNombre = 'Sin seleccionar';
    if (escenarioActual && escenarioActual.nombre) {
      draftScenarioNombre = escenarioActual.nombre;
    }

    return {
      escenarios: Array.isArray(escenarios) ? escenarios : [],
      draftScenarioNombre
    };
  }

  function updateDraft(field, value) {
    if (field === 'nombre') {
      return window.CRIOS_CAMPAIGN_DRAFT.establecerNombre(value);
    }
    if (field === 'descripcion') {
      return window.CRIOS_CAMPAIGN_DRAFT.establecerDescripcion(value);
    }
    if (field === 'escenario') {
      return window.CRIOS_CAMPAIGN_DRAFT.establecerEscenario(value);
    }
    return { ok: false };
  }

  function wireEvents(missions, campaigns, taxonomy) {
    return {
      isInDraft: id => window.CRIOS_CAMPAIGN_DRAFT.hasMission(id),
      getCampaignLabel: id => getCampaignLabel(id, missions, campaigns, taxonomy),
      alCambiarNombre: name => {
        const res = updateDraft('nombre', name);
        if (res && res.ok) render(missions, campaigns, taxonomy);
      },
      alCambiarDescripcion: desc => {
        const res = updateDraft('descripcion', desc);
        if (res && res.ok) render(missions, campaigns, taxonomy);
      },
      alCambiarEscenario: escenarioId => {
        const res = updateDraft('escenario', escenarioId);
        if (res && res.ok) render(missions, campaigns, taxonomy);
      },
      onAdd: mission => {
        const added = window.CRIOS_CAMPAIGN_ACTIONS.agregarMision(mission);
        if (added) render(missions, campaigns, taxonomy);
      },
      onMove: (index, offset) => {
        const moved = window.CRIOS_CAMPAIGN_ACTIONS.moverMision(index, offset);
        if (moved) render(missions, campaigns, taxonomy);
      },
      onRemove: id => {
        const removed = window.CRIOS_CAMPAIGN_ACTIONS.quitarMision(id);
        if (removed) render(missions, campaigns, taxonomy);
      }
    };
  }

  function renderConfiguration(draftName, draftDescription, draftScenarioId, escenarioContexto) {
    return {
      campaignName: draftName,
      campaignDescription: draftDescription,
      campaignScenario: escenarioContexto.draftScenarioNombre,
      campaignScenarioId: draftScenarioId,
      escenarios: escenarioContexto.escenarios
    };
  }

  function renderMissionBank(missionsVista) {
    return {
      missions: missionsVista
    };
  }

  function renderCampaignSummary(draftMissionsVista, draftIndicators, validacion) {
    return {
      draftMissions: draftMissionsVista,
      campaignMissionIndicators: draftIndicators,
      validacion: validacion
    };
  }

  function getDomainContract(path, errorMessage) {
    const [ownerKey, contractKey] = path;
    const domain = window.CRIOS_DOMAIN || {};
    const owner = domain[ownerKey];
    const contract = owner && owner[contractKey];
    if (typeof contract !== 'function') {
      throw new Error(errorMessage);
    }
    return contract;
  }

  function validateReleaseStructure(release) {
    const contract = getDomainContract(
      ['releaseValidator', 'validateReleaseStructure'],
      'Campaign Release invalida: ReleaseValidator no disponible.'
    );
    return contract(release);
  }

  function createCampaignRelease(draftSnapshot) {
    const contract = getDomainContract(
      ['releaseFactory', 'createCampaignRelease'],
      'No se puede crear Campaign Release: ReleaseFactory no disponible.'
    );
    return contract(draftSnapshot);
  }

  function publishCampaign() {
    const contract = getDomainContract(
      ['publishService', 'publishCampaign'],
      'No se puede publicar campaña: PublishService no disponible.'
    );
    return contract(window.CRIOS_CAMPAIGN_DRAFT);
  }

  function validateReleaseForShare(release) {
    const contract = getDomainContract(
      ['shareValidator', 'validateReleaseForShare'],
      'No se puede construir SharePayload: ShareValidator no disponible.'
    );
    return contract(release);
  }

  function createSharePayloadFromRelease(release) {
    const contract = getDomainContract(
      ['shareModel', 'createSharePayloadFromRelease'],
      'No se puede construir SharePayload: ShareModel no disponible.'
    );
    return contract(release);
  }

  function createShareModelFromPayload(payload) {
    const contract = getDomainContract(
      ['shareModel', 'createShareModelFromPayload'],
      'No se puede construir ShareModel: ShareModel no disponible.'
    );
    return contract(payload);
  }

  function createShareService() {
    const contract = getDomainContract(
      ['shareService', 'createShareService'],
      'No se puede construir ShareService: ShareService no disponible.'
    );
    return contract();
  }

  function validateStudentSession(session) {
    const contract = getDomainContract(
      ['sessionValidator', 'validateStudentSession'],
      'Student Session inválida: SessionValidator no disponible.'
    );
    return contract(session);
  }

  function createStudentSession(release) {
    const contract = getDomainContract(
      ['sessionFactory', 'createStudentSession'],
      'No se puede crear Student Session: SessionFactory no disponible.'
    );
    return contract(release);
  }

  function createStudentSessionApi() {
    return {
      createStudentSession,
      validateStudentSession
    };
  }

  function createRuntime(release, session) {
    const contract = getDomainContract(
      ['runtimeCore', 'createRuntime'],
      'No se puede crear Runtime: RuntimeCore no disponible.'
    );
    return contract(release, session);
  }

  function validateRuntime(runtime) {
    const contract = getDomainContract(
      ['runtimeCore', 'validateRuntime'],
      'Runtime inválido: RuntimeCore no disponible.'
    );
    return contract(runtime);
  }

  function createRuntimeApi() {
    return {
      createRuntime,
      validateRuntime
    };
  }

  function getCurrentMission(runtime, release) {
    const contract = getDomainContract(
      ['navigationCore', 'getCurrentMission'],
      'Navigation inválida: NavigationCore no disponible.'
    );
    return contract(runtime, release);
  }

  function createNavigation(runtime, release) {
    const contract = getDomainContract(
      ['navigationCore', 'createNavigation'],
      'Navigation inválida: NavigationCore no disponible.'
    );
    return contract(runtime, release);
  }

  function validateNavigation(navigation) {
    const contract = getDomainContract(
      ['navigationCore', 'validateNavigation'],
      'Navigation inválida: NavigationCore no disponible.'
    );
    return contract(navigation);
  }

  function hasNextMission(runtime, release) {
    const contract = getDomainContract(
      ['navigationCore', 'hasNextMission'],
      'Navigation inválida: NavigationCore no disponible.'
    );
    return contract(runtime, release);
  }

  function getNextMission(runtime, release) {
    const contract = getDomainContract(
      ['navigationCore', 'getNextMission'],
      'Navigation inválida: NavigationCore no disponible.'
    );
    return contract(runtime, release);
  }

  function isFinished(runtime, release) {
    const contract = getDomainContract(
      ['navigationCore', 'isFinished'],
      'Navigation inválida: NavigationCore no disponible.'
    );
    return contract(runtime, release);
  }

  function createNavigationApi() {
    return {
      createNavigation,
      validateNavigation,
      getCurrentMission,
      hasNextMission,
      getNextMission,
      isFinished
    };
  }

  function createReloadSafeActivationStore(store) {
    return Object.freeze({
      commit: function(reference, record, options){
        var history = store.listHistory(record.campaignId);
        var ids = new Set(history.map(function(item){ return item.activationId; }));
        var storedRecord = record;
        if (ids.has(record.activationId)) {
          var next = history.reduce(function(max, item){
            var match = /^activation-(\d+)$/.exec(item.activationId);
            return match ? Math.max(max, Number(match[1])) : max;
          }, 0) + 1;
          while (ids.has('activation-' + next)) next += 1;
          storedRecord = Object.freeze(Object.assign({}, record, { activationId: 'activation-' + next }));
        }
        return store.commit(reference, storedRecord, options);
      },
      getActiveReference: store.getActiveReference,
      listHistory: store.listHistory,
      snapshot: store.snapshot
    });
  }

  function render(missions, campaigns, taxonomy){
    const draft = window.CRIOS_CAMPAIGN_DRAFT.getCampaign();
    const draftMissions = window.CRIOS_CAMPAIGN_DRAFT.getMissions();
    const missionsVista = Array.isArray(missions) ? missions.map(normalizarMisionVista) : [];
    const draftMissionsVista = Array.isArray(draftMissions) ? draftMissions.map(normalizarMisionVista) : [];
    const draftIndicators = calculateMissionIndicators(draftMissionsVista);
    const draftName = window.CRIOS_CAMPAIGN_DRAFT.obtenerNombre();
    const draftDescription = window.CRIOS_CAMPAIGN_DRAFT.obtenerDescripcion();
    const draftScenarioId = window.CRIOS_CAMPAIGN_DRAFT.obtenerEscenario();
    const escenarioContexto = obtenerContextoEscenarios(draftScenarioId);
    const callbacks = wireEvents(missions, campaigns, taxonomy);

    // Validar el draft
    const validacion = window.CRIOS_CAMPAIGN_VALIDATOR.validarCampaignDraft(draft, escenarioContexto.escenarios);

    const publicationState = studioPublicationController
      ? studioPublicationController.getState()
      : { status: 'IDLE', busy: false, lastValidation: null, lastResult: null, currentDraftRevision: '', currentCampaignId: '' };

    const publicationHistory = studioPublicationController
      ? studioPublicationController.listPublications().map(function(publication){
        var record = studioPublicationController.getRecord(publication.publicationId);
        return Object.assign({}, publication, {
          createdAt: record && record.createdAt ? record.createdAt : '',
          sourceDraftRevision: record && record.sourceDraftRevision ? record.sourceDraftRevision : ''
        });
      })
      : [];

    const currentCampaignId = publicationState.currentCampaignId ||
      (publicationHistory[0] && publicationHistory[0].campaignId) || '';

    if (studioActivationController) {
      studioActivationController.setCurrentCampaign(currentCampaignId);
    }
    const activationState = studioActivationController
      ? studioActivationController.getState()
      : { status: 'IDLE', busy: false, currentCampaignId: '', activeReference: null, history: [], lastResult: null, lastError: null };
    const activationHistory = studioActivationController && currentCampaignId
      ? studioActivationController.listHistory(currentCampaignId)
      : [];
    const persistenceState = studioPersistenceController
      ? studioPersistenceController.getStatus()
      : { status: 'UNAVAILABLE', busy: false, storageKey: '', schemaVersion: 1, stateRevision: 0, updatedAt: null, serializedBytes: 0, publicationCount: 0, activeReferenceCount: 0, activationRecordCount: 0, lastError: null };
    const missionSpecState = studioMissionSpecController
      ? studioMissionSpecController.getState()
      : { status: 'IDLE', busy: false, missionCount: 0, validSpecCount: 0, invalidSpecCount: 0, requiredHandlers: [], manifest: null, issues: [], lastValidation: null };
    const publicationActivationHistory = publicationHistory.map(function(publication){
      return Object.assign({}, publication, {
        isActive: Boolean(activationState.activeReference && activationState.activeReference.publicationId === publication.publicationId),
        canActivate: !activationState.activeReference || activationState.activeReference.publicationId !== publication.publicationId,
        canRollback: studioActivationController ? studioActivationController.canRollback(publication) : false
      });
    });

    const renderConfig = Object.assign(
      {},
      renderMissionBank(missionsVista),
      renderConfiguration(draftName, draftDescription, draftScenarioId, escenarioContexto),
      renderCampaignSummary(draftMissionsVista, draftIndicators, validacion),
      {
        publication: {
          state: publicationState,
          history: publicationActivationHistory,
          actions: {
            onValidate: function(){
              if (!studioPublicationController) return;
              if (studioMissionSpecController) studioMissionSpecController.validateCurrentDraft();
              studioPublicationController.validateCurrentDraft().then(function(){
                render(missions, campaigns, taxonomy);
              });
            },
            onPublish: function(){
              if (!studioPublicationController) return;
              studioPublicationController.publishCurrentDraft().then(function(){
                render(missions, campaigns, taxonomy);
              });
            }
          }
        },
        missionSpecs: { state: missionSpecState },
        activation: {
          state: activationState,
          history: activationHistory,
          actions: {
            onActivate: function(campaignId, publicationId){
              if (!studioActivationController) return;
              studioActivationController.activatePublication(campaignId, publicationId).then(function(){
                render(missions, campaigns, taxonomy);
              });
            },
            onDeactivate: function(campaignId){
              if (!studioActivationController) return;
              studioActivationController.deactivatePublication(campaignId);
              render(missions, campaigns, taxonomy);
            },
            onRollback: function(campaignId, publicationId){
              if (!studioActivationController) return;
              studioActivationController.rollbackPublication(campaignId, publicationId).then(function(){
                render(missions, campaigns, taxonomy);
              });
            }
          }
        },
        persistence: {
          state: persistenceState,
          actions: {
            onClear: function(){
              if (!studioPersistenceController) return;
              studioPersistenceController.clearLocalData();
            }
          }
        }
      },
      callbacks
    );

    window.CRIOS_STUDIO_RENDERER.render(renderConfig);
  }

  function getCampaignLabel(missionId, missions, campaigns, taxonomy){
    const campaign = Array.isArray(campaigns)
      ? campaigns.find(c => Array.isArray(c.misiones) && c.misiones.includes(missionId))
      : null;

    if(campaign) return campaign.titulo || campaign.id || 'Campaña existente';

    const mission = Array.isArray(missions)
      ? missions.find(m => m.id === missionId)
      : null;

    if(mission && mission.clasificacion && taxonomy){
      const materia = taxonomy.materias?.[mission.clasificacion.materia];
      const tema = materia?.temas?.[mission.clasificacion.tema];
      const subtema = tema?.subtemas?.[mission.clasificacion.subtema];
      return subtema?.etiqueta || tema?.etiqueta || materia?.etiqueta || 'Sin categoría';
    }

    return 'Sin categoría';
  }

  document.addEventListener('DOMContentLoaded', async ()=>{
    try {
      await ensureDomainModulesLoaded();
    } catch (error) {
      safeText(el('missionBankContent'), error.message);
      safeText(el('campaignBuilderContent'), error.message);
      safeText(el('campaignSummaryContent'), error.message);
      return;
    }

    const required = [
      window.CRIOS_STUDIO_ADAPTER,
      window.CRIOS_CAMPAIGN_DRAFT,
      window.CRIOS_CAMPAIGN_ACTIONS,
      window.CRIOS_CAMPAIGN_VALIDATOR,
      window.CRIOS_STUDIO_RENDERER,
      window.CRIOS_DOMAIN && window.CRIOS_DOMAIN.releaseFactory,
      window.CRIOS_DOMAIN && window.CRIOS_DOMAIN.releaseValidator,
      window.CRIOS_DOMAIN && window.CRIOS_DOMAIN.publishService,
      window.CRIOS_DOMAIN && window.CRIOS_DOMAIN.shareModel,
      window.CRIOS_DOMAIN && window.CRIOS_DOMAIN.shareService,
      window.CRIOS_DOMAIN && window.CRIOS_DOMAIN.shareValidator,
      window.CRIOS_DOMAIN && window.CRIOS_DOMAIN.sessionFactory,
      window.CRIOS_DOMAIN && window.CRIOS_DOMAIN.sessionValidator,
      window.CRIOS_DOMAIN && window.CRIOS_DOMAIN.playerStateValidator,
      window.CRIOS_DOMAIN && window.CRIOS_DOMAIN.playerStateService,
      window.CRIOS_DOMAIN && window.CRIOS_DOMAIN.runtimeCore,
      window.CRIOS_DOMAIN && window.CRIOS_DOMAIN.navigationCore
    ];

    if (required.some(feature => !feature)) {
      safeText(el('missionBankContent'), 'Adapter no disponible.');
      safeText(el('campaignBuilderContent'), 'Adapter no disponible.');
      safeText(el('campaignSummaryContent'), 'Adapter no disponible.');
      return;
    }

    const adapter = window.CRIOS_STUDIO_ADAPTER;
    const missions = adapter.getMissions() || [];
    const campaigns = adapter.getCampaigns() || [];
    const taxonomy = adapter.getTaxonomy();

    var publicationCore = window.CRIOS_PUBLICATION_CORE;
    var publicationAdapterFactory = window.CRIOS_STUDIO_PUBLICATION_ADAPTER;
    var publicationControllerFactory = window.CRIOS_STUDIO_PUBLICATION_CONTROLLER;
    var activationApi = window.CRIOS_PUBLICATION_ACTIVATION;
    var activationControllerFactory = window.CRIOS_STUDIO_ACTIVATION_CONTROLLER;
    var persistenceApi = window.CRIOS_PUBLICATION_PERSISTENCE;
    var persistenceControllerFactory = window.CRIOS_STUDIO_PERSISTENCE_CONTROLLER;
    var missionCatalog = window.CRIOS_STUDIO_GEOMETRY_AREA_SPEC_CATALOG;
    var missionAdapterFactory = window.CRIOS_STUDIO_MISSION_SPEC_ADAPTER;
    var missionControllerFactory = window.CRIOS_STUDIO_MISSION_SPEC_CONTROLLER;
    var studioPublicationApi = null;
    var studioActivationApi = null;
    var studioPersistenceApi = null;
    var studioMissionSpecsApi = null;
    var persistenceCoordinator = null;
    var publicationStore = null;
    var activationStore = null;
    var recoveredCampaignId = '';
    var missionSpecAdapter = null;

    if (missionCatalog && missionAdapterFactory && missionControllerFactory && window.CRIOS_RUNTIME_MISSION_HANDLERS) {
      window.CRIOS_CAMPAIGN_DRAFT.configurarCatalogoSpecs(missionCatalog);
      missionSpecAdapter = missionAdapterFactory.createStudioMissionSpecAdapter({
        runtime: window.CRIOS_RUNTIME_MISSION_HANDLERS,
        catalog: missionCatalog
      });
      studioMissionSpecController = missionControllerFactory.createStudioMissionSpecController({
        draftApi: window.CRIOS_CAMPAIGN_DRAFT,
        adapter: missionSpecAdapter,
        onStateChange: function(){}
      });
      studioMissionSpecsApi = Object.freeze({
        version: '1.0.0',
        validateCurrentDraft: studioMissionSpecController.validateCurrentDraft,
        listCurrentSpecs: studioMissionSpecController.listCurrentSpecs,
        getCurrentSpec: studioMissionSpecController.getCurrentSpec,
        getExecutionManifest: studioMissionSpecController.getExecutionManifest,
        getState: studioMissionSpecController.getState
      });
    }

    if (persistenceApi) {
      try {
        persistenceCoordinator = persistenceApi.createPersistenceCoordinator();
        var persistenceStatus = persistenceCoordinator.getStatus();
        if (persistenceStatus.status === 'EMPTY' || persistenceStatus.status === 'READY') {
          publicationStore = persistenceCoordinator.publicationStore;
          activationStore = createReloadSafeActivationStore(persistenceCoordinator.activationStore);
          var activationSnapshot = activationStore.snapshot();
          var publicationSnapshot = publicationStore.snapshot();
          recoveredCampaignId = activationSnapshot.activeReferences[0]
            ? activationSnapshot.activeReferences[0].campaignId
            : (publicationSnapshot.publications.length
              ? publicationSnapshot.publications[publicationSnapshot.publications.length - 1].campaignId
              : '');
        }
      } catch (persistenceError) {
        persistenceCoordinator = null;
      }
    }

    if (publicationCore && publicationAdapterFactory && publicationControllerFactory) {
      try {
        var publicationAdapter = publicationAdapterFactory.createStudioPublicationAdapter({
          draftApi: window.CRIOS_CAMPAIGN_DRAFT
        });
        if (recoveredCampaignId) {
          var draftCampaignId = publicationAdapter.getCampaignId;
          publicationAdapter = Object.freeze(Object.assign({}, publicationAdapter, {
            getCampaignId: function(snapshot){ return draftCampaignId(snapshot) || recoveredCampaignId; }
          }));
        }

        var publicationController = publicationControllerFactory.createStudioPublicationController({
          core: publicationCore,
          adapter: publicationAdapter,
          missionSpecAdapter: missionSpecAdapter,
          publicationStore: publicationStore,
          onStateChange: function(){
            render(missions, campaigns, taxonomy);
          }
        });

        studioPublicationController = publicationController;

        studioPublicationApi = Object.freeze({
          version: '1.0.0',
          validateCurrentDraft: publicationController.validateCurrentDraft,
          publishCurrentDraft: publicationController.publishCurrentDraft,
          listPublications: publicationController.listPublications,
          getPublication: publicationController.getPublication,
          getRecord: publicationController.getRecord,
          getLastResult: publicationController.getLastResult,
          getState: publicationController.getState
        });
      } catch (publicationError) {
        studioPublicationApi = Object.freeze({
          version: '1.0.0',
          validateCurrentDraft: async function(){
            return Object.freeze({ ok: false, error: { code: 'PUBLICATION_CORE_UNAVAILABLE', message: publicationError.message, metadata: null }, validation: null, draftRevision: '', campaignId: '' });
          },
          publishCurrentDraft: async function(){
            return Object.freeze({ success: false, publication: null, record: null, validation: null, error: { code: 'PUBLICATION_CORE_UNAVAILABLE', message: publicationError.message, metadata: null } });
          },
          listPublications: function(){ return Object.freeze([]); },
          getPublication: function(){ return null; },
          getRecord: function(){ return null; },
          getLastResult: function(){ return null; },
          getState: function(){ return Object.freeze({ status: 'ERROR', busy: false, lastValidation: null, lastResult: null, lastError: { code: 'PUBLICATION_CORE_UNAVAILABLE', message: publicationError.message, metadata: null }, currentDraftRevision: '', currentCampaignId: '' }); }
        });
      }
    } else {
      studioPublicationApi = Object.freeze({
        version: '1.0.0',
        validateCurrentDraft: async function(){
          return Object.freeze({ ok: false, error: { code: 'PUBLICATION_CORE_UNAVAILABLE', message: 'CRIOS Publication Core is not available.', metadata: null }, validation: null, draftRevision: '', campaignId: '' });
        },
        publishCurrentDraft: async function(){
          return Object.freeze({ success: false, publication: null, record: null, validation: null, error: { code: 'PUBLICATION_CORE_UNAVAILABLE', message: 'CRIOS Publication Core is not available.', metadata: null } });
        },
        listPublications: function(){ return Object.freeze([]); },
        getPublication: function(){ return null; },
        getRecord: function(){ return null; },
        getLastResult: function(){ return null; },
        getState: function(){ return Object.freeze({ status: 'ERROR', busy: false, lastValidation: null, lastResult: null, lastError: { code: 'PUBLICATION_CORE_UNAVAILABLE', message: 'CRIOS Publication Core is not available.', metadata: null }, currentDraftRevision: '', currentCampaignId: '' }); }
      });
    }

    if (activationApi && activationControllerFactory && publicationCore && studioPublicationApi) {
      studioActivationController = activationControllerFactory.createStudioActivationController({
        publicationApi: studioPublicationApi,
        activationApi: activationApi,
        core: publicationCore,
        activationStore: activationStore,
        onStateChange: function(){
          render(missions, campaigns, taxonomy);
        }
      });
      studioActivationApi = Object.freeze({
        version: '1.0.0',
        activatePublication: studioActivationController.activatePublication,
        deactivatePublication: studioActivationController.deactivatePublication,
        rollbackPublication: studioActivationController.rollbackPublication,
        getActiveReference: studioActivationController.getActiveReference,
        resolveActivePublication: studioActivationController.resolveActivePublication,
        listHistory: studioActivationController.listHistory,
        getState: studioActivationController.getState
      });
    }

    if (persistenceCoordinator && persistenceControllerFactory) {
      studioPersistenceController = persistenceControllerFactory.createStudioPersistenceController({
        coordinator: persistenceCoordinator,
        onStateChange: function(){ render(missions, campaigns, taxonomy); },
        reloadStudio: function(){ window.location.reload(); }
      });
      studioPersistenceApi = Object.freeze({
        version: '1.0.0',
        getStatus: studioPersistenceController.getStatus,
        exportLocalData: studioPersistenceController.exportLocalData,
        clearLocalData: studioPersistenceController.clearLocalData
      });
    } else {
      studioPersistenceApi = Object.freeze({
        version: '1.0.0',
        getStatus: function(){
          return Object.freeze({ status:'UNAVAILABLE',busy:false,storageKey:'crios.publication.persistence.v1',schemaVersion:1,stateRevision:0,updatedAt:null,serializedBytes:0,publicationCount:0,activeReferenceCount:0,activationRecordCount:0,lastError:Object.freeze({ code:'PERSISTENCE_UNAVAILABLE',message:'El almacenamiento local no está disponible.',metadata:null }) });
        },
        exportLocalData: function(){ return null; },
        clearLocalData: function(){ return Object.freeze({ success:false,error:Object.freeze({ code:'PERSISTENCE_UNAVAILABLE',message:'El almacenamiento local no está disponible.',metadata:null }) }); }
      });
    }

    render(missions, campaigns, taxonomy);

    const shareService = createShareService();
    window.CRIOS_SHARE_SERVICE = shareService;

    const studentSessionApi = createStudentSessionApi();
    window.CRIOS_STUDENT_SESSION = studentSessionApi;

    const runtimeApi = createRuntimeApi();
    window.CRIOS_RUNTIME_CORE = runtimeApi;

    const navigationApi = createNavigationApi();
    window.CRIOS_NAVIGATION = navigationApi;

    window.CRIOS_STUDIO = Object.freeze(Object.assign({}, window.CRIOS_STUDIO || {}, {
      publishCampaign,
      publication: studioPublicationApi,
      activation: studioActivationApi,
      persistence: studioPersistenceApi
      ,missionSpecs: studioMissionSpecsApi
    }));

    try { delete window.CRIOS_STUDIO_PUBLICATION_ADAPTER; } catch (ignoreA) {}
    try { delete window.CRIOS_STUDIO_PUBLICATION_CONTROLLER; } catch (ignoreC) {}
    try { delete window.CRIOS_STUDIO_ACTIVATION_CONTROLLER; } catch (ignoreActivation) {}
    try { delete window.CRIOS_STUDIO_PERSISTENCE_CONTROLLER; } catch (ignorePersistence) {}
    try { delete window.CRIOS_STUDIO_GEOMETRY_AREA_SPEC_CATALOG; } catch (ignoreCatalog) {}
    try { delete window.CRIOS_STUDIO_MISSION_SPEC_ADAPTER; } catch (ignoreMissionAdapter) {}
    try { delete window.CRIOS_STUDIO_MISSION_SPEC_CONTROLLER; } catch (ignoreMissionController) {}
  });
})();
