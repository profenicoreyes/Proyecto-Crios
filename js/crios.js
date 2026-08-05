(function bootstrapCrios() {
'use strict';

let campanaActiva = null;
let misionesActivas = [];
let missionIds = [];
const runtimeLaunchApi = window.CRIOS_RUNTIME_LAUNCH || null;
const runtimeLaunchSelectionApi = window.CRIOS_RUNTIME_LAUNCH_SELECTION || null;
const runtimeLaunchSearch = window.location && typeof window.location.search === 'string'
  ? window.location.search
  : '';
const runtimeLaunchState = runtimeLaunchSelectionApi && typeof runtimeLaunchSelectionApi.selectRuntimeLaunch === 'function'
  ? runtimeLaunchSelectionApi.selectRuntimeLaunch(CRIOS_CONFIG.runtimeCampaignMode, runtimeLaunchSearch, runtimeLaunchApi)
  : Object.freeze({
    explicit: false,
    blocked: true,
    sourceMode: null,
    campaignId: null,
    error: Object.freeze({ code: 'LAUNCH_SELECTION_UNAVAILABLE', message: 'Launch selection is unavailable.', parameter: null })
  });
const runtimeLaunchBlocked = runtimeLaunchState.blocked;
const runtimeLaunchError = runtimeLaunchState.error;
const runtimeCampaignMode = runtimeLaunchState.sourceMode;
const requestedPublishedCampaignId = runtimeLaunchState.campaignId;
const runtimeCampaignModeValid = !runtimeLaunchBlocked && (runtimeCampaignMode === 'legacy' || runtimeCampaignMode === 'published');
let preparedRuntimeCampaign = null;

function obtenerMision(id) {
  if (runtimeCampaignMode === 'published') {
    const bridge = preparedRuntimeCampaign && preparedRuntimeCampaign.bridge;
    const misionPublicada = bridge && bridge.missionById ? bridge.missionById[id] : null;
    if (!misionPublicada) throw new Error(`No existe una misión publicada preparada con el id: ${id}`);
    return misionPublicada;
  }
  const mision = REGISTRO_MISIONES.obtener(id);
  if (!mision) throw new Error(`No existe una misión registrada con el id: ${id}`);
  return mision;
}
const CRIOS_VERSION = CRIOS_CONFIG.version;
const RESULTS_ENDPOINT = CRIOS_CONFIG.resultsEndpoint;
const STORAGE = CRIOS_CONFIG.storage;
const DOMAIN_SCRIPT_PATHS = [
  'js/release/release-model.js',
  'js/release/release-validator.js',
  'js/release/release-factory.js',
  'js/session/session-model.js',
  'js/session/session-validator.js',
  'js/session/session-factory.js',
  'js/player-state/player-state-validator.js',
  'js/player-state/player-state-service.js',
  'js/runtime/runtime-core.js',
  'js/navigation/navigation-core.js',
  'js/runtime/bootstrap/runtime-bootstrap-adapter.js'
];

let domainModulesPromise = null;
let domainReady = false;
let domainRelease = null;
let domainSession = null;
let domainRuntime = null;
let domainNavigation = null;
let gameFlowLegacyAdapterPromise = null;
let createLegacyGameFlowAdapter = null;
let evaluationModelPromise = null;
let createMissionEvaluation = null;
let progressModelPromise = null;
let createMissionProgressUpdate = null;
let missionNavigationModelPromise = null;
let createMissionNavigationDecision = null;
let missionGameFlowAdapter = null;

function getTracer() {
  try {
    const tracer = window.CRIOS_TRACE;
    if (!tracer) return null;
    if (typeof tracer.isRecording !== 'function') return null;
    if (typeof tracer.emit !== 'function') return null;
    return tracer;
  } catch (error) {
    return null;
  }
}

function isTraceRecording() {
  try {
    const tracer = getTracer();
    return Boolean(tracer && tracer.isRecording());
  } catch (error) {
    return false;
  }
}

function traceEvent(eventType, payloadOrFactory) {
  try {
    const tracer = getTracer();
    if (!tracer) return false;
    if (!isTraceRecording()) return false;

    let payload = payloadOrFactory;
    if (typeof payloadOrFactory === 'function') {
      payload = payloadOrFactory();
    }

    if (!payload || typeof payload !== 'object') {
      payload = {};
    }

    if (payload.sourceFile === undefined || payload.sourceFile === null) {
      payload.sourceFile = 'js/crios.js';
    }

    return tracer.emit(eventType, payload);
  } catch (error) {
    return false;
  }
}

function traceErrorData(error) {
  return {
    name: error && error.name ? String(error.name) : 'Error',
    message: error && error.message ? String(error.message) : String(error || 'unknown')
  };
}

function captureMissionTraceSnapshot() {
  return {
    sessionMissionIndex: domainSession && Number.isInteger(domainSession.currentMissionIndex)
      ? domainSession.currentMissionIndex
      : null,
    sessionMissionId: domainSession && domainSession.progress
      ? domainSession.progress.currentMissionId || null
      : null,
    runtimeMissionId: domainRuntime && domainRuntime.mission
      ? domainRuntime.mission.id || null
      : null,
    navigationMissionId: domainNavigation
      ? domainNavigation.currentMissionId || null
      : null
  };
}

function captureVisibleTraceSnapshot() {
  const activeScreen = document.querySelector('.screen.active');
  return {
    currentScreen: currentScreen,
    activeScreenId: activeScreen ? activeScreen.id : null,
    routePath: window.location ? window.location.pathname : null,
    routeHash: window.location ? window.location.hash : null,
    dedicatedGameOverScreen: Boolean(document.getElementById('gameOver'))
  };
}

function traceReturnEarly(scope, reason, details) {
  traceEvent('flow:return-early', {
    scope: scope,
    reason: reason,
    details: details || null
  });
}

function traceAsyncScheduled(scope, kind, details) {
  traceEvent('async:scheduled', {
    scope: scope,
    kind: kind,
    details: details || null
  });
}

function traceAsyncResolved(scope, kind, details) {
  traceEvent('async:resolved', {
    scope: scope,
    kind: kind,
    details: details || null
  });
}

function traceAsyncRejected(scope, kind, error) {
  traceEvent('async:rejected', {
    scope: scope,
    kind: kind,
    error: traceErrorData(error)
  });
}

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
  if (domainModulesPromise) {
    traceReturnEarly('ensureDomainModulesLoaded', 'already-scheduled', null);
    return domainModulesPromise;
  }

  window.__CRIOS_REGISTER_DOMAIN_MODULE__ = registerDomainModule;
  traceAsyncScheduled('ensureDomainModulesLoaded', 'domain-script-chain', {
    scripts: DOMAIN_SCRIPT_PATHS.slice()
  });
  domainModulesPromise = DOMAIN_SCRIPT_PATHS.reduce(
    (chain, src) => chain.then(() => loadDomainScript(src)),
    Promise.resolve()
  ).then((value) => {
    traceAsyncResolved('ensureDomainModulesLoaded', 'domain-script-chain', {
      scripts: DOMAIN_SCRIPT_PATHS.length
    });
    return value;
  }).catch((error) => {
    traceAsyncRejected('ensureDomainModulesLoaded', 'domain-script-chain', error);
    throw error;
  }).finally(() => {
    delete window.__CRIOS_REGISTER_DOMAIN_MODULE__;
  });

  return domainModulesPromise;
}

function ensureGameFlowLegacyAdapterLoaded() {
  if (gameFlowLegacyAdapterPromise) return gameFlowLegacyAdapterPromise;

  gameFlowLegacyAdapterPromise = import('./game-flow/game-flow-legacy-adapter.js')
    .then((module) => {
      if (!module || typeof module.createLegacyGameFlowAdapter !== 'function') {
        throw new Error('No se pudo cargar Game Flow Legacy Adapter: fábrica no disponible.');
      }
      createLegacyGameFlowAdapter = module.createLegacyGameFlowAdapter;
      return createLegacyGameFlowAdapter;
    });

  return gameFlowLegacyAdapterPromise;
}

function ensureEvaluationModelLoaded() {
  if (evaluationModelPromise) return evaluationModelPromise;

  evaluationModelPromise = import('./evaluation/evaluation-model.js')
    .then((module) => {
      if (!module || typeof module.createMissionEvaluation !== 'function') {
        throw new Error('No se pudo cargar Evaluation Model: fábrica no disponible.');
      }
      createMissionEvaluation = module.createMissionEvaluation;
      return createMissionEvaluation;
    });

  return evaluationModelPromise;
}

function ensureProgressModelLoaded() {
  if (progressModelPromise) return progressModelPromise;

  progressModelPromise = import('./progress/progress-model.js')
    .then((module) => {
      if (!module || typeof module.createMissionProgressUpdate !== 'function') {
        throw new Error('No se pudo cargar Progress Model: fábrica no disponible.');
      }
      createMissionProgressUpdate = module.createMissionProgressUpdate;
      return createMissionProgressUpdate;
    });

  return progressModelPromise;
}

function ensureMissionNavigationModelLoaded() {
  if (typeof createMissionNavigationDecision === 'function') {
    return missionNavigationModelPromise;
  }
  if (missionNavigationModelPromise) return missionNavigationModelPromise;

  missionNavigationModelPromise = import('./navigation/mission-navigation-model.js')
    .then((module) => {
      if (!module || typeof module.createMissionNavigationDecision !== 'function') {
        throw new Error('No se pudo cargar Mission Navigation Model: fábrica no disponible.');
      }
      createMissionNavigationDecision = module.createMissionNavigationDecision;
      return module;
    });

  return missionNavigationModelPromise;
}

function getDomainContract(ownerKey, contractKey) {
  const domain = window.CRIOS_DOMAIN || {};
  const owner = domain[ownerKey];
  const contract = owner && owner[contractKey];
  return typeof contract === 'function' ? contract : null;
}

function buildCampaignDraftForRelease(campaign) {
  const publishedMetadata = runtimeCampaignMode === 'published'
    ? preparedRuntimeCampaign?.data?.campaign
    : null;

  return {
    id: publishedMetadata ? publishedMetadata.publicationId : null,
    nombre: String(campaign.titulo || '').trim(),
    descripcion: String(campaign.descripcion || '').trim(),
    escenario: publishedMetadata ? publishedMetadata.escenario : 'antartida',
    estado: 'draft',
    version: 1,
    misiones: runtimeCampaignMode === 'published'
      ? misionesActivas.slice()
      : REGISTRO_MISIONES.obtenerPorCampana(campaign)
  };
}

function rebuildDomainStateForActiveCampaign() {
  if (!domainReady || !campanaActiva) {
    traceReturnEarly('rebuildDomainStateForActiveCampaign', 'domain-not-ready-or-no-campaign', {
      domainReady: domainReady,
      hasCampaign: Boolean(campanaActiva)
    });
    return false;
  }

  if (runtimeCampaignMode === 'published' && !preparedRuntimeCampaign) {
    traceReturnEarly('rebuildDomainStateForActiveCampaign', 'published-campaign-not-prepared', {
      hasPreparedRuntimeCampaign: false,
      activeMissionCount: Array.isArray(misionesActivas) ? misionesActivas.length : null,
      activeMissionIdCount: Array.isArray(missionIds) ? missionIds.length : null
    });
    return false;
  }

  const createCampaignRelease = getDomainContract('releaseFactory', 'createCampaignRelease');
  const createStudentSession = getDomainContract('sessionFactory', 'createStudentSession');
  const createRuntime = getDomainContract('runtimeCore', 'createRuntime');
  const createNavigation = getDomainContract('navigationCore', 'createNavigation');
  const safeClone = getDomainContract('releaseModel', 'safeClone');

  if (!createCampaignRelease || !createStudentSession || !createRuntime || !createNavigation || !safeClone) {
    traceReturnEarly('rebuildDomainStateForActiveCampaign', 'domain-contract-missing', null);
    return false;
  }

  try {
    const draftSnapshot = buildCampaignDraftForRelease(campanaActiva);
    domainRelease = createCampaignRelease(draftSnapshot);
    const frozenSession = createStudentSession(domainRelease);
    domainSession = safeClone(frozenSession);
    domainRuntime = createRuntime(domainRelease, domainSession);
    domainNavigation = createNavigation(domainRuntime, domainRelease);
    return true;
  } catch (error) {
    traceEvent('error:caught', {
      scope: 'rebuildDomainStateForActiveCampaign',
      error: traceErrorData(error)
    });
    console.warn('[CRIOS] No se pudo reconstruir el dominio de campaña:', error);
    domainRelease = null;
    domainSession = null;
    domainRuntime = null;
    domainNavigation = null;
    return false;
  }
}

function syncDomainMissionById(missionId) {
  if (!domainSession || !Array.isArray(missionIds)) {
    traceReturnEarly('syncDomainMissionById', 'domain-session-or-mission-list-missing', {
      missionId: missionId
    });
    return missionId;
  }

  const index = missionIds.indexOf(missionId);
  if (index < 0) {
    traceReturnEarly('syncDomainMissionById', 'mission-id-not-found', {
      missionId: missionId
    });
    return missionId;
  }

  const before = isTraceRecording() ? captureMissionTraceSnapshot() : null;
  traceEvent('domain:mission-sync:before', () => ({
    missionId: missionId,
    currentMissionIndexBefore: before.sessionMissionIndex,
    currentMissionIdBefore: before.sessionMissionId,
    metadata: before
  }));
  domainSession.currentMissionIndex = index;
  domainSession.progress.currentMissionId = missionIds[index];
  const after = isTraceRecording() ? captureMissionTraceSnapshot() : null;
  traceEvent('domain:mission-sync:after', () => ({
    missionId: missionIds[index],
    currentMissionIndexBefore: before.sessionMissionIndex,
    currentMissionIndexAfter: after.sessionMissionIndex,
    currentMissionIdBefore: before.sessionMissionId,
    currentMissionIdAfter: after.sessionMissionId,
    metadata: after
  }));
  return missionIds[index];
}

function refreshDomainRuntimeAndNavigation() {
  if (!domainReady || !domainRelease || !domainSession) {
    traceReturnEarly('refreshDomainRuntimeAndNavigation', 'domain-state-incomplete', {
      domainReady: domainReady,
      hasRelease: Boolean(domainRelease),
      hasSession: Boolean(domainSession)
    });
    return false;
  }

  const createRuntime = getDomainContract('runtimeCore', 'createRuntime');
  const createNavigation = getDomainContract('navigationCore', 'createNavigation');
  if (!createRuntime || !createNavigation) {
    traceReturnEarly('refreshDomainRuntimeAndNavigation', 'runtime-or-navigation-contract-missing', null);
    return false;
  }

  const before = isTraceRecording() ? captureMissionTraceSnapshot() : null;
  traceEvent('domain:runtime-navigation-refresh:before', () => ({
    missionId: before.sessionMissionId,
    currentMissionIndexBefore: before.sessionMissionIndex,
    currentMissionIdBefore: before.sessionMissionId,
    metadata: before
  }));
  domainRuntime = createRuntime(domainRelease, domainSession);
  domainNavigation = createNavigation(domainRuntime, domainRelease);
  const after = isTraceRecording() ? captureMissionTraceSnapshot() : null;
  traceEvent('domain:runtime-navigation-refresh:after', () => ({
    missionId: after.sessionMissionId,
    currentMissionIndexBefore: before.sessionMissionIndex,
    currentMissionIndexAfter: after.sessionMissionIndex,
    currentMissionIdBefore: before.sessionMissionId,
    currentMissionIdAfter: after.sessionMissionId,
    metadata: after
  }));
  return true;
}

function resolveMissionIdUsingDomain(missionId) {
  if (!domainReady || !domainSession) {
    traceReturnEarly('resolveMissionIdUsingDomain', 'domain-not-ready-or-no-session', {
      missionId: missionId
    });
    return missionId;
  }

  try {
    const normalizedMissionId = syncDomainMissionById(missionId);
    const refreshed = refreshDomainRuntimeAndNavigation();
    if (!refreshed || !domainNavigation) return normalizedMissionId;
    return domainNavigation.currentMissionId || normalizedMissionId;
  } catch (error) {
    traceEvent('error:caught', {
      scope: 'resolveMissionIdUsingDomain',
      error: traceErrorData(error)
    });
    console.warn('[CRIOS] No se pudo resolver misión con NavigationCore:', error);
    return missionId;
  }
}

function applyPlayerEvaluation({ evaluation, session, mission, campaign }) {
  const playerStateService = (window.CRIOS_DOMAIN || {}).playerStateService;
  if (!playerStateService || typeof playerStateService.applyEvaluation !== 'function') {
    throw new Error('PlayerStateService no disponible.');
  }
  return playerStateService.applyEvaluation(session, {
    missionId: mission.id,
    isCorrect: evaluation.success
  });
}

function updateProgress({ evaluation, playerState, session, mission, campaign }) {
  if (typeof createMissionProgressUpdate !== 'function') {
    throw new Error('Progress Model no disponible.');
  }

  const id = mission.id;
  const rec = missionRecord(id);
  const result = createMissionProgressUpdate({
    evaluation,
    missionId: id,
    progress,
    sessionStats,
    missionRecord: rec,
    openedAt: missionOpenedAt[id],
    now: Date.now()
  });

  progress = result.progress;
  sessionStats = result.sessionStats;
  if (sessionData && result.missionRecord) {
    sessionData.misiones[id] = result.missionRecord;
  }

  return {
    progress: { ...progress },
    campaignCompleted: result.campaignCompleted
  };
}

function rebuildRuntime({ evaluation, playerState, progress, session, mission, campaign }) {
  const createRuntime = getDomainContract('runtimeCore', 'createRuntime');
  if (!createRuntime) throw new Error('RuntimeCore no disponible.');
  domainRuntime = createRuntime(domainRelease, session);
  return domainRuntime;
}

function resolveNavigation({ evaluation, playerState, progress, runtime, session, mission, campaign }) {
  if (typeof createMissionNavigationDecision !== 'function') {
    throw new Error('MissionNavigationModel no disponible.');
  }
  const createNavigation = getDomainContract('navigationCore', 'createNavigation');
  if (!createNavigation) throw new Error('NavigationCore no disponible.');
  domainNavigation = createNavigation(runtime.runtime, domainRelease);
  return createMissionNavigationDecision(evaluation);
}

function getMissionGameFlowAdapter() {
  if (missionGameFlowAdapter) return missionGameFlowAdapter;
  if (typeof createLegacyGameFlowAdapter !== 'function') return null;
  missionGameFlowAdapter = createLegacyGameFlowAdapter({
    applyPlayerEvaluation,
    updateProgress,
    rebuildRuntime,
    resolveNavigation
  });
  return missionGameFlowAdapter;
}

function cloneMissionGameFlowState(value) {
  if (value === null || value === undefined) return value;
  const safeClone = getDomainContract('releaseModel', 'safeClone');
  if (safeClone) return safeClone(value);
  return JSON.parse(JSON.stringify(value));
}

function captureMissionGameFlowTransaction() {
  return {
    domainSession: cloneMissionGameFlowState(domainSession),
    domainRuntime: domainRuntime,
    domainNavigation: domainNavigation,
    progress: cloneMissionGameFlowState(progress),
    sessionStats: cloneMissionGameFlowState(sessionStats),
    sessionData: cloneMissionGameFlowState(sessionData)
  };
}

function rollbackMissionGameFlowTransaction(snapshot) {
  if (!snapshot) return false;
  domainSession = snapshot.domainSession;
  domainRuntime = snapshot.domainRuntime;
  domainNavigation = snapshot.domainNavigation;
  progress = snapshot.progress;
  sessionStats = snapshot.sessionStats;
  sessionData = snapshot.sessionData;
  return true;
}

function missionGameFlowResultCommits(result) {
  return Boolean(result && (
    result.status === 'FLOW_COMPLETED'
    || result.status === 'GAME_OVER'
    || result.status === 'CAMPAIGN_COMPLETED'
  ));
}

function applyDomainEvaluationForMission(missionId, isCorrect) {
  getMissionGameFlowAdapter();
  if (!domainReady || !domainSession || !domainRelease || !missionGameFlowAdapter
    || typeof createMissionEvaluation !== 'function'
    || typeof createMissionProgressUpdate !== 'function'
    || typeof createMissionNavigationDecision !== 'function') {
    traceReturnEarly('applyDomainEvaluationForMission', 'domain-or-adapter-not-ready', {
      missionId: missionId,
      isCorrect: Boolean(isCorrect),
      domainReady: domainReady,
      hasSession: Boolean(domainSession),
      hasRelease: Boolean(domainRelease),
      hasAdapter: Boolean(missionGameFlowAdapter),
      hasEvaluationFactory: typeof createMissionEvaluation === 'function',
      hasProgressFactory: typeof createMissionProgressUpdate === 'function',
      hasMissionNavigationFactory: typeof createMissionNavigationDecision === 'function'
    });
    return null;
  }

  let transactionSnapshot = null;
  let transactionRolledBack = false;
  try {
    transactionSnapshot = captureMissionGameFlowTransaction();
    const coherentMissionId = syncDomainMissionById(missionId);
    const mission = domainRelease.missions.find((item) => item && item.id === coherentMissionId);
    if (!mission) throw new Error('La misión no existe en el Campaign Release activo.');
    const statusBefore = domainSession.status;
    const livesBefore = domainSession.lives;
    const gameOverBefore = statusBefore === 'gameOver';
    const missionBefore = isTraceRecording() ? captureMissionTraceSnapshot() : null;
    const visibleBefore = isTraceRecording() ? captureVisibleTraceSnapshot() : null;
    const evaluation = createMissionEvaluation(isCorrect);

    traceEvent('player-state:evaluation:before', {
      missionId: coherentMissionId,
      evaluationBefore: { status: statusBefore, lives: livesBefore },
      gameOverBefore: gameOverBefore,
      currentMissionIndexBefore: missionBefore ? missionBefore.sessionMissionIndex : null,
      currentMissionIdBefore: missionBefore ? missionBefore.sessionMissionId : null,
      screenBefore: visibleBefore ? visibleBefore.currentScreen : null,
      visibleEffect: visibleBefore,
      metadata: {
        requestedMissionId: missionId,
        isCorrect: Boolean(isCorrect),
        statusBefore: statusBefore,
        livesBefore: livesBefore,
        runtimeMissionId: missionBefore ? missionBefore.runtimeMissionId : null,
        navigationMissionId: missionBefore ? missionBefore.navigationMissionId : null
      }
    });
    traceEvent('domain:evaluation:apply:before', {
      missionId: coherentMissionId,
      evaluationBefore: { status: statusBefore, lives: livesBefore },
      gameOverBefore: gameOverBefore,
      metadata: { isCorrect: Boolean(isCorrect) }
    });
    traceEvent('domain:integration:before', {
      missionId: coherentMissionId,
      evaluationBefore: { status: statusBefore, lives: livesBefore },
      gameOverBefore: gameOverBefore,
      currentMissionIndexBefore: missionBefore ? missionBefore.sessionMissionIndex : null,
      currentMissionIdBefore: missionBefore ? missionBefore.sessionMissionId : null,
      screenBefore: visibleBefore ? visibleBefore.currentScreen : null,
      metadata: missionBefore
    });

    const command = {
      evaluation,
      session: domainSession,
      mission,
      campaign: domainRelease
    };
    const result = missionGameFlowAdapter.execute(command);
    const evaluatedSession = result.playerState && result.playerState.state
      ? result.playerState.state
      : domainSession;
    const statusAfterEvaluation = evaluatedSession.status;
    const livesAfterEvaluation = evaluatedSession.lives;
    const gameOverAfterEvaluation = result.status === 'GAME_OVER';
    traceEvent('domain:evaluation:apply:after', {
      missionId: coherentMissionId,
      evaluationBefore: { status: statusBefore, lives: livesBefore },
      evaluationAfter: { status: statusAfterEvaluation, lives: livesAfterEvaluation },
      gameOverBefore: gameOverBefore,
      gameOverAfter: gameOverAfterEvaluation,
      metadata: { isCorrect: Boolean(isCorrect) }
    });

    if (!missionGameFlowResultCommits(result)) {
      transactionRolledBack = rollbackMissionGameFlowTransaction(transactionSnapshot);
      traceEvent('domain:integration:rollback', {
        missionId: coherentMissionId,
        evaluationBefore: { status: statusAfterEvaluation, lives: livesAfterEvaluation },
        evaluationAfter: { status: domainSession.status, lives: domainSession.lives },
        error: result.error,
        metadata: {
          status: result.status,
          stage: result.stage,
          rolledBack: transactionRolledBack
        }
      });
    }

    let refreshed = result.status === 'FLOW_COMPLETED';
    if (result.status === 'GAME_OVER') {
      const playerStateService = (window.CRIOS_DOMAIN || {}).playerStateService;
      traceEvent('gameOver:entered', {
        missionId: coherentMissionId,
        evaluationBefore: { status: statusBefore, lives: livesBefore },
        evaluationAfter: { status: statusAfterEvaluation, lives: livesAfterEvaluation },
        gameOverBefore: gameOverBefore,
        gameOverAfter: true,
        screenBefore: visibleBefore ? visibleBefore.currentScreen : null,
        screenAfter: visibleBefore ? visibleBefore.currentScreen : null,
        visibleEffect: visibleBefore,
        metadata: { statusAfter: statusAfterEvaluation, livesAfter: livesAfterEvaluation }
      });
      domainSession = playerStateService.restorePlayerState(domainSession);
      refreshed = refreshDomainRuntimeAndNavigation();
      const visibleAfterRestore = isTraceRecording() ? captureVisibleTraceSnapshot() : null;
      traceEvent('gameOver:restored', {
        missionId: coherentMissionId,
        evaluationBefore: { status: statusAfterEvaluation, lives: livesAfterEvaluation },
        evaluationAfter: { status: domainSession.status, lives: domainSession.lives },
        gameOverBefore: true,
        gameOverAfter: false,
        screenBefore: visibleBefore ? visibleBefore.currentScreen : null,
        screenAfter: visibleAfterRestore ? visibleAfterRestore.currentScreen : null,
        visibleEffect: visibleAfterRestore,
        metadata: { restoredStatus: domainSession.status, restoredLives: domainSession.lives }
      });
    }

    const missionAfter = isTraceRecording() ? captureMissionTraceSnapshot() : null;
    const visibleAfter = isTraceRecording() ? captureVisibleTraceSnapshot() : null;
    traceEvent('domain:integration:after', {
      missionId: coherentMissionId,
      evaluationBefore: { status: statusBefore, lives: livesBefore },
      evaluationAfter: { status: domainSession.status, lives: domainSession.lives },
      gameOverBefore: gameOverBefore,
      gameOverAfter: domainSession.status === 'gameOver',
      currentMissionIndexBefore: missionBefore ? missionBefore.sessionMissionIndex : null,
      currentMissionIndexAfter: missionAfter ? missionAfter.sessionMissionIndex : null,
      currentMissionIdBefore: missionBefore ? missionBefore.sessionMissionId : null,
      currentMissionIdAfter: missionAfter ? missionAfter.sessionMissionId : null,
      screenBefore: visibleBefore ? visibleBefore.currentScreen : null,
      screenAfter: visibleAfter ? visibleAfter.currentScreen : null,
      visibleEffect: visibleAfter,
      metadata: {
        refreshed: refreshed,
        rolledBack: transactionRolledBack,
        status: result.status,
        stage: result.stage,
        statusAfter: domainSession.status,
        livesAfter: domainSession.lives,
        runtimeMissionId: missionAfter ? missionAfter.runtimeMissionId : null,
        navigationMissionId: missionAfter ? missionAfter.navigationMissionId : null
      }
    });
    return result;
  } catch (error) {
    if (!transactionRolledBack) {
      transactionRolledBack = rollbackMissionGameFlowTransaction(transactionSnapshot);
    }
    traceEvent('error:caught', {
      scope: 'applyDomainEvaluationForMission',
      status: 'PORT_FAILURE',
      stage: 'VALIDATION',
      error: traceErrorData(error)
    });
    console.warn('[CRIOS] No se pudo aplicar Game Flow:', error);
    return null;
  }
}

function readJson(storage, key, fallback) {
  try {
    const raw = storage.getItem(key);
    return raw === null ? fallback : JSON.parse(raw);
  } catch (error) {
    console.warn('[CRIOS] No se pudo leer el almacenamiento:', key, error);
    return fallback;
  }
}

function writeJson(storage, key, value) {
  const storageName = storage === localStorage ? 'localStorage' : (storage === sessionStorage ? 'sessionStorage' : 'unknown');
  traceEvent('persistence:before', {
    storage: storageName,
    key: key,
    hasValue: value !== undefined
  });
  try {
    storage.setItem(key, JSON.stringify(value));
    traceEvent('persistence:after', {
      storage: storageName,
      key: key,
      success: true
    });
    return true;
  } catch (error) {
    traceEvent('persistence:after', {
      storage: storageName,
      key: key,
      success: false,
      error: traceErrorData(error)
    });
    traceEvent('error:caught', {
      scope: 'writeJson',
      error: traceErrorData(error)
    });
    console.warn('[CRIOS] No se pudo guardar el almacenamiento:', key, error);
    return false;
  }
}

let campanaActivaId = requestedPublishedCampaignId || sessionStorage.getItem(STORAGE.campaignId) || CAMPANA_INICIAL_ID;
let progresosCampanas = readJson(sessionStorage, STORAGE.campaignProgress, {});
const progresoAnterior = readJson(sessionStorage, STORAGE.progress, {});
let progress = {};
let missionData = {};

function activeProgressKey() {
  if (runtimeCampaignMode !== 'published') return campanaActiva.id;
  const sessionId = sessionData && typeof sessionData.idSesion === 'string'
    ? sessionData.idSesion.trim()
    : '';
  if (!preparedRuntimeCampaign || !sessionId) {
    throw new Error('La sesión published no tiene una identidad opaca válida para el progreso.');
  }
  return `${preparedRuntimeCampaign.data.progressKey}@${sessionId}`;
}

function establecerCampanaActiva(id, { navegar = false } = {}) {
  if (runtimeCampaignMode === 'published') return false;
  const campana = obtenerCampanaPorId(id);
  if (!campana || campana.estado !== 'publicada') return false;

  if (campanaActiva) {
    progresosCampanas[campanaActiva.id] = { ...progress };
  }

  campanaActiva = campana;
  campanaActivaId = campana.id;
  misionesActivas = REGISTRO_MISIONES.obtenerPorCampana(campanaActiva);
  missionIds = misionesActivas.map((mision) => mision.id);
  progress = { ...(progresosCampanas[campanaActiva.id] || {}) };
  missionData = {};
  hintRegistered = {};
  missionOpenedAt = {};

  sessionStorage.setItem(STORAGE.campaignId, campanaActiva.id);
  writeJson(sessionStorage, STORAGE.campaignProgress, progresosCampanas);
  writeJson(sessionStorage, STORAGE.progress, progress);

  if (sessionData) {
    sessionData.campana = {
      id: campana.id,
      titulo: campana.titulo,
      clasificacion: campana.clasificacion
    };
    sessionData.misiones = sessionData.misiones || {};
    missionIds.forEach((missionId) => {
      sessionData.misiones[missionId] = sessionData.misiones[missionId] || {
        procedure:'', answer:'', procedureCorrect:false, answerCorrect:false
      };
    });
    persistSession();
  }

  setupMissionUI();
  rebuildDomainStateForActiveCampaign();
  actualizarCabeceraCampana();
  updateMap();
  renderCampaignSelector();
  if (navegar) go('map');
  return true;
}

function inicializarCampana() {
  const solicitada = obtenerCampanaPorId(campanaActivaId);
  const inicial = solicitada && solicitada.estado === 'publicada'
    ? solicitada
    : obtenerCampanaPorId(CAMPANA_INICIAL_ID) || listarCampanas().find((c) => c.estado === 'publicada');
  if (!inicial) throw new Error('CRIOS no tiene campañas publicadas.');

  if (runtimeCampaignMode !== 'legacy') {
    campanaActiva = inicial;
    campanaActivaId = requestedPublishedCampaignId || inicial.id;
    misionesActivas = [];
    missionIds = [];
    progress = {};
    return;
  }

  if (!progresosCampanas[inicial.id] && Object.keys(progresoAnterior).length) {
    progresosCampanas[inicial.id] = { ...progresoAnterior };
  }
  campanaActiva = inicial;
  campanaActivaId = inicial.id;
  misionesActivas = REGISTRO_MISIONES.obtenerPorCampana(inicial);
  missionIds = misionesActivas.map((mision) => mision.id);
  progress = { ...(progresosCampanas[inicial.id] || {}) };
  sessionStorage.setItem(STORAGE.campaignId, inicial.id);
  writeJson(sessionStorage, STORAGE.campaignProgress, progresosCampanas);
}

inicializarCampana();
let sessionStats = readJson(sessionStorage, STORAGE.sessionStats, {});
let missionOpenedAt = {};
let hintRegistered = {};
let sessionData = readJson(sessionStorage, STORAGE.sessionData, null);
let currentScreen='intro';
let audioCtx=null, soundOn=true;
let introTimer=null;
let ambientNodes=[];
let ambientStarted=false;

function createSessionId(){
  if(window.crypto&&typeof window.crypto.randomUUID==='function') return window.crypto.randomUUID();
  return 'crios-'+Date.now().toString(36)+'-'+Math.random().toString(36).slice(2,10);
}
function persistSession(){
  if(sessionData) writeJson(sessionStorage, STORAGE.sessionData, sessionData);
}
function startSession(realName,characterName,groupName){
  traceEvent('session:create:before', {
    hasSessionData: Boolean(sessionData),
    missionCount: missionIds.length,
    campaignId: campanaActiva ? campanaActiva.id : null
  });
  const campaignIdentity=runtimeCampaignMode==='published'
    ? {...preparedRuntimeCampaign.data.campaign}
    : {id:campanaActiva.id,titulo:campanaActiva.titulo,clasificacion:campanaActiva.clasificacion};
  sessionData={
    idSesion:createSessionId(),nombre:realName,personaje:characterName,grupo:groupName,version:CRIOS_VERSION,
    inicioISO:new Date().toISOString(),inicioMs:Date.now(),finISO:null,
    variante:variantIdFor(characterName),pantallas:[],misiones:{},final:{procedureAttempts:0,attempts:0},
    enviada:false,
    campana:campaignIdentity
  };
  missionIds.forEach((id,index)=>{
    const trace=runtimeCampaignMode==='published'?preparedRuntimeCampaign.data.missions[index]:null;
    sessionData.misiones[id]={procedure:'',answer:'',procedureCorrect:false,answerCorrect:false};
    if(trace) Object.assign(sessionData.misiones[id],{missionId:id,position:index,handlerId:trace.handlerId,handlerVersion:trace.handlerVersion,publicationId:trace.publicationId,contentHash:trace.contentHash});
  });
  sessionStats={};progress={};hintRegistered={};missionOpenedAt={};
  rebuildDomainStateForActiveCampaign();
  if(runtimeCampaignMode==='published'){
    progresosCampanas[activeProgressKey()]={};
    writeJson(sessionStorage, STORAGE.campaignProgress, progresosCampanas);
  }
  writeJson(sessionStorage, STORAGE.progress, {});
  persistStats();persistSession();
  if(runtimeCampaignMode==='published'){
    traceEvent('bootstrap-runtime:session-pinned',{mode:'published',campaignId:campaignIdentity.campaignId,publicationId:campaignIdentity.publicationId,publicationVersion:campaignIdentity.publicationVersion,contentHash:campaignIdentity.contentHash,result:'pinned'});
  }
  traceEvent('session:create:after', {
    hasSessionData: Boolean(sessionData),
    sessionId: sessionData ? sessionData.idSesion : null,
    missionCount: missionIds.length,
    campaignId: sessionData && sessionData.campana ? sessionData.campana.id : null
  });
}
function recordScreen(id){
  if(!sessionData) return;
  sessionData.pantallas.push({id,at:new Date().toISOString()});
  if(sessionData.pantallas.length>80){
    const removed = sessionData.pantallas[0] || null;
    traceEvent('screen:history-trim:before', {
      screenId: id,
      lengthBeforeTrim: sessionData.pantallas.length,
      removedCandidate: removed
    });
    const shifted = sessionData.pantallas.shift() || null;
    traceEvent('screen:history-trim:after', {
      screenId: id,
      lengthAfterTrim: sessionData.pantallas.length,
      removed: shifted
    });
  }
  persistSession();
  queueSessionUpdate();
}
function missionRecord(id){
  if(!sessionData) return null;
  sessionData.misiones[id]=sessionData.misiones[id]||{};
  return sessionData.misiones[id];
}
function calculateEvaluation(){
  const stats=missionIds.map(id=>sessionStats[id]||{});
  const resultAttempts=stats.reduce((n,x)=>n+(x.attempts||0),0)+(sessionData?.final?.attempts||0);
  const procedureAttempts=stats.reduce((n,x)=>n+(x.procedureAttempts||0),0)+(sessionData?.final?.procedureAttempts||0);
  const hints=stats.reduce((n,x)=>n+(x.hints||0),0);
  const completed=stats.filter(x=>x.completed).length;
  const finalCorrect=Boolean(sessionData?.final?.answerCorrect);
  let score=100;
  score-=Math.max(0,resultAttempts-5)*4;
  score-=Math.max(0,procedureAttempts-5)*2;
  score-=hints*4;
  if(completed<missionIds.length) score-=((missionIds.length-completed)*15);
  if(!finalCorrect) score-=20;
  score=Math.max(0,Math.min(100,Math.round(score)));
  const grade=Math.max(1,Math.min(12,Math.round(1+(score*11/100))));
  let feedback='Operación completada. Procedimientos consistentes y revisión adecuada de los datos.';
  if(score<90) feedback='Operación completada. El sistema recomienda revisar algunos procedimientos y reducir los intentos innecesarios.';
  if(score<70) feedback='Operación completada. Se recomienda revisar la selección de datos y la construcción de las expresiones.';
  if(score<50) feedback='Registro incompleto o con dificultades importantes. Se recomienda rehacer las expresiones con apoyo docente.';
  return {score,grade,feedback,resultAttempts,procedureAttempts,hints,completed,aciertos:completed+(finalCorrect?1:0)};
}
let progressSendTimer=null;
let transmissionBusy=false;
let transmissionQueued=false;

function buildPayload(finalized=false){
  const ev=calculateEvaluation();
  const now=Date.now();
  const isFinal=Boolean(finalized||sessionData.finISO||sessionData.enviada);
  const finalISO=sessionData.finISO||(isFinal?new Date(now).toISOString():'');
  const endMs=finalISO?Date.parse(finalISO):now;
  return {
    idSesion:sessionData.idSesion,
    nombre:sessionData.nombre,
    personaje:sessionData.personaje||'',
    grupo:sessionData.grupo||'',
    variante:sessionData.variante,
    horaInicio:sessionData.inicioISO,
    horaFin:finalISO,
    tiempoSegundos:Math.max(0,Math.round((endMs-sessionData.inicioMs)/1000)),
    respuestas:{misiones:sessionData.misiones,final:sessionData.final,pantallas:sessionData.pantallas,estado:isFinal?'FINALIZADA':'EN CURSO'},
    aciertos:ev.aciertos,
    intentos:ev.resultAttempts+ev.procedureAttempts,
    pistas:ev.hints,
    puntaje:isFinal?ev.score:'',
    notaSugerida:isFinal?ev.grade:'',
    devolucion:isFinal?ev.feedback:'Sesión en curso',
    version:CRIOS_VERSION,
    campana:sessionData.campana||{id:campanaActiva.id,titulo:campanaActiva.titulo}
  };
}

async function sendSessionUpdate(finalized=false){
  if(!sessionData){
    traceReturnEarly('sendSessionUpdate', 'session-missing', { finalized: Boolean(finalized) });
    return;
  }
  if(transmissionBusy){
    transmissionQueued=transmissionQueued||finalized;
    traceReturnEarly('sendSessionUpdate', 'transmission-busy', {
      finalized: Boolean(finalized),
      queued: Boolean(transmissionQueued)
    });
    return;
  }
  transmissionBusy=true;
  const payload=buildPayload(finalized);
  const status=document.getElementById('sendStatus');
  traceEvent('transmission:before', {
    channel: 'fetch-update',
    finalized: Boolean(finalized),
    payloadState: payload && payload.respuestas ? payload.respuestas.estado : null
  });
  traceAsyncScheduled('sendSessionUpdate', 'fetch-update', {
    finalized: Boolean(finalized)
  });
  try{
    await fetch(RESULTS_ENDPOINT,{
      method:'POST',mode:'no-cors',
      headers:{'Content-Type':'text/plain;charset=utf-8'},
      body:JSON.stringify(payload),keepalive:true
    });
    traceAsyncResolved('sendSessionUpdate', 'fetch-update', {
      finalized: Boolean(finalized)
    });
    if(finalized){
      sessionData.finISO=payload.horaFin;
      sessionData.enviada=true;
      sessionData.evaluacion={puntaje:payload.puntaje,nota:payload.notaSugerida,devolucion:payload.devolucion};
      localStorage.removeItem(STORAGE.pendingResult);
      if(status) status.textContent='Registro transmitido.';
    }
    traceEvent('transmission:after', {
      channel: 'fetch-update',
      finalized: Boolean(finalized),
      outcome: 'resolved'
    });
    persistSession();
  }catch(error){
    traceAsyncRejected('sendSessionUpdate', 'fetch-update', error);
    traceEvent('error:caught', {
      scope: 'sendSessionUpdate',
      error: traceErrorData(error)
    });
    writeJson(localStorage, STORAGE.pendingResult, payload);
    traceEvent('transmission:after', {
      channel: 'fetch-update',
      finalized: Boolean(finalized),
      outcome: 'rejected'
    });
    if(status) status.textContent='Transmisión pendiente. CRIOS volverá a intentarlo.';
  }finally{
    transmissionBusy=false;
    if(transmissionQueued){
      const queuedFinal=transmissionQueued;
      transmissionQueued=false;
      traceAsyncScheduled('sendSessionUpdate', 'queued-flush', {
        queuedFinal: Boolean(queuedFinal)
      });
      sendSessionUpdate(queuedFinal);
    }
  }
}

function queueSessionUpdate(){
  clearTimeout(progressSendTimer);
  traceAsyncScheduled('queueSessionUpdate', 'setTimeout', {
    delayMs: CRIOS_CONFIG.progressSendDelayMs
  });
  progressSendTimer=setTimeout(() => {
    traceAsyncResolved('queueSessionUpdate', 'setTimeout', {
      delayMs: CRIOS_CONFIG.progressSendDelayMs
    });
    sendSessionUpdate(false);
  }, CRIOS_CONFIG.progressSendDelayMs);
}

async function transmitResults(){
  if(!sessionData) return;
  if(!sessionData.finISO) sessionData.finISO=new Date().toISOString();
  sessionData.enviada=true;
  persistSession();
  await sendSessionUpdate(true);
}

function sendExitSnapshot(){
  if(!sessionData||!RESULTS_ENDPOINT){
    traceReturnEarly('sendExitSnapshot', 'session-or-endpoint-missing', {
      hasSession: Boolean(sessionData),
      hasEndpoint: Boolean(RESULTS_ENDPOINT)
    });
    return;
  }
  const payload=buildPayload(Boolean(sessionData.finISO||sessionData.enviada));
  const raw=JSON.stringify(payload);
  traceEvent('transmission:before', {
    channel: 'exit-snapshot',
    finalized: Boolean(sessionData.finISO||sessionData.enviada)
  });
  try{
    if(navigator.sendBeacon){
      const blob=new Blob([raw],{type:'text/plain;charset=UTF-8'});
      if(navigator.sendBeacon(RESULTS_ENDPOINT,blob)){
        traceEvent('transmission:after', {
          channel: 'exit-snapshot',
          outcome: 'sendBeacon-accepted'
        });
        return;
      }
    }
  }catch(error){
    traceEvent('error:caught', {
      scope: 'sendExitSnapshot.sendBeacon',
      error: traceErrorData(error)
    });
  }
  try{
    traceAsyncScheduled('sendExitSnapshot', 'fetch-keepalive', null);
    fetch(RESULTS_ENDPOINT,{method:'POST',mode:'no-cors',headers:{'Content-Type':'text/plain;charset=utf-8'},body:raw,keepalive:true});
    traceEvent('transmission:after', {
      channel: 'exit-snapshot',
      outcome: 'fetch-dispatched'
    });
  }catch(error){
    traceAsyncRejected('sendExitSnapshot', 'fetch-keepalive', error);
    traceEvent('error:caught', {
      scope: 'sendExitSnapshot.fetch',
      error: traceErrorData(error)
    });
    traceEvent('persistence:before', {
      storage: 'localStorage',
      key: STORAGE.pendingResult,
      hasValue: true
    });
    localStorage.setItem(STORAGE.pendingResult, raw);
    traceEvent('persistence:after', {
      storage: 'localStorage',
      key: STORAGE.pendingResult,
      success: true
    });
    traceEvent('transmission:after', {
      channel: 'exit-snapshot',
      outcome: 'fetch-failed-persisted'
    });
  }
}

async function retryPendingResult(){
  const raw = localStorage.getItem(STORAGE.pendingResult);
  if(!raw||!navigator.onLine){
    traceReturnEarly('retryPendingResult', 'no-pending-or-offline', {
      hasPending: Boolean(raw),
      online: Boolean(navigator.onLine)
    });
    return;
  }
  traceEvent('transmission:before', {
    channel: 'retry-pending',
    online: Boolean(navigator.onLine)
  });
  traceAsyncScheduled('retryPendingResult', 'fetch-retry', null);
  try{
    await fetch(RESULTS_ENDPOINT,{method:'POST',mode:'no-cors',headers:{'Content-Type':'text/plain;charset=utf-8'},body:raw,keepalive:true});
    traceAsyncResolved('retryPendingResult', 'fetch-retry', null);
    localStorage.removeItem(STORAGE.pendingResult);
    traceEvent('transmission:after', {
      channel: 'retry-pending',
      outcome: 'resolved'
    });
  }catch(error){
    traceAsyncRejected('retryPendingResult', 'fetch-retry', error);
    traceEvent('error:caught', {
      scope: 'retryPendingResult',
      error: traceErrorData(error)
    });
    traceEvent('transmission:after', {
      channel: 'retry-pending',
      outcome: 'rejected'
    });
  }
}
function renderEvaluationSummary(){
  if(!sessionData) return;
  const ev=calculateEvaluation();
  const text=document.getElementById('evaluationText');
  if(text) text.innerHTML='Nivel de recuperación: <strong>'+ev.score+' %</strong> · Nota sugerida: <strong>'+ev.grade+'</strong><br>'+ev.feedback;
}

function go(id){
  const screenBefore = currentScreen;
  const visibleBefore = isTraceRecording() ? captureVisibleTraceSnapshot() : null;
  traceEvent('screen:render:before', {
    screenBefore: screenBefore,
    screenAfter: id,
    visibleEffect: visibleBefore,
    metadata: { requestedScreen: id }
  });
  currentScreen=id;recordScreen(id);
  document.querySelectorAll('.screen').forEach(s=>s.classList.remove('active'));
  const el=document.getElementById(id);
  if(el){
    el.classList.add('active');
    el.querySelectorAll('.hero,.archive,.data-card,.sidepanel,.mission-info,.final-card').forEach(x=>x.scrollTop=0);
    document.documentElement.scrollTop=0;
    document.body.scrollTop=0;
    const focused=document.activeElement;
    if(focused && typeof focused.blur==='function') focused.blur();
  }
  if(soundOn) uiClick();
  if(id==='map') updateMap();
  if(id==='final') renderFinal();
  if(id==='reveal'){
    loadUserName();
    const saved=sessionStorage.getItem(STORAGE.characterName);
    const savedSessionMode=sessionData&&sessionData.campana?sessionData.campana.sourceMode:null;
    const resumableLegacySession=runtimeCampaignMode==='legacy'&&Boolean(sessionData)&&savedSessionMode!=='published';
    const resumeSavedSession=!runtimeLaunchBlocked&&Boolean(saved)&&resumableLegacySession;
    document.getElementById('missionLogin')?.classList.toggle('hidden',resumeSavedSession);
    document.getElementById('missionWelcome')?.classList.toggle('hidden',!resumeSavedSession);
  }
  const active=document.querySelector('.screen.active');
  const visibleAfter = isTraceRecording() ? captureVisibleTraceSnapshot() : null;
  traceEvent('screen:render:after', {
    screenBefore: screenBefore,
    screenAfter: currentScreen,
    visibleEffect: visibleAfter,
    metadata: {
      requestedScreen: id,
      foundElement: Boolean(el),
      activeScreen: active ? active.id : null
    }
  });
}
function openMission(id){
  const missionBefore = isTraceRecording() ? captureMissionTraceSnapshot() : null;
  const screenBefore = currentScreen;
  traceEvent('mission:select:before', {
    missionId: id,
    currentMissionIndexBefore: missionBefore ? missionBefore.sessionMissionIndex : null,
    currentMissionIdBefore: missionBefore ? missionBefore.sessionMissionId : null,
    screenBefore: screenBefore,
    metadata: missionBefore
  });
  const resolvedMissionId=resolveMissionIdUsingDomain(id);
  const missionAfterSelection = isTraceRecording() ? captureMissionTraceSnapshot() : null;
  traceEvent('mission:select:after', {
    missionId: resolvedMissionId,
    currentMissionIndexBefore: missionBefore ? missionBefore.sessionMissionIndex : null,
    currentMissionIndexAfter: missionAfterSelection ? missionAfterSelection.sessionMissionIndex : null,
    currentMissionIdBefore: missionBefore ? missionBefore.sessionMissionId : null,
    currentMissionIdAfter: missionAfterSelection ? missionAfterSelection.sessionMissionId : null,
    screenBefore: screenBefore,
    screenAfter: currentScreen,
    metadata: {
      requestedMissionId: id,
      runtimeMissionId: missionAfterSelection ? missionAfterSelection.runtimeMissionId : null,
      navigationMissionId: missionAfterSelection ? missionAfterSelection.navigationMissionId : null
    }
  });
  traceEvent('mission:open:before', {
    missionId: resolvedMissionId,
    currentMissionIndexBefore: missionAfterSelection ? missionAfterSelection.sessionMissionIndex : null,
    currentMissionIdBefore: missionAfterSelection ? missionAfterSelection.sessionMissionId : null,
    screenBefore: screenBefore,
    metadata: missionAfterSelection
  });
  renderMission(resolvedMissionId);
  missionOpenedAt[resolvedMissionId]=Date.now();
  go('mission-'+resolvedMissionId);
  const missionAfterOpen = isTraceRecording() ? captureMissionTraceSnapshot() : null;
  const visibleAfterOpen = isTraceRecording() ? captureVisibleTraceSnapshot() : null;
  traceEvent('mission:open:after', {
    missionId: resolvedMissionId,
    currentMissionIndexAfter: missionAfterOpen ? missionAfterOpen.sessionMissionIndex : null,
    currentMissionIdAfter: missionAfterOpen ? missionAfterOpen.sessionMissionId : null,
    screenBefore: screenBefore,
    screenAfter: currentScreen,
    visibleEffect: visibleAfterOpen,
    metadata: {
      missionOpenedAt: missionOpenedAt[resolvedMissionId],
      runtimeMissionId: missionAfterOpen ? missionAfterOpen.runtimeMissionId : null,
      navigationMissionId: missionAfterOpen ? missionAfterOpen.navigationMissionId : null,
      targetScreen: 'mission-'+resolvedMissionId
    }
  });
}
function normalize(v){return Number(String(v).replace(',','.').replace(/[^\d.-]/g,''))}

function save(){progresosCampanas[activeProgressKey()]={...progress};writeJson(sessionStorage, STORAGE.campaignProgress, progresosCampanas);writeJson(sessionStorage, STORAGE.progress, progress);updateMap();renderCampaignSelector();persistSession()}
function updateMap(){
  let done=0;
  missionIds.forEach(id=>{
    const isDone=Boolean(progress[id]);
    if(isDone) done++;
    const card=document.getElementById('card-'+id);
    const mini=document.getElementById('mini-'+id);
    if(card) card.classList.toggle('done',isDone);
    if(mini){
      mini.style.color=isDone?'#9affc6':'var(--muted)';
      mini.textContent=(isDone?'✓ ':'● ')+obtenerMision(id).nombreCorto+': '+(isDone?'operativo':'sin respuesta');
    }
  });
  const total=missionIds.length;
  const target=total?Math.round(done*100/total):0;
  const count=document.getElementById('doneCount');
  const bar=document.getElementById('progressBar');
  const finalBtn=document.getElementById('finalBtn');
  if(count) count.textContent=done+'/'+total;
  if(bar){
    const progressBox=bar.parentElement;
    requestAnimationFrame(()=>{bar.style.transform='scaleX('+(target/100)+')';});
    if(progressBox) progressBox.setAttribute('aria-valuenow',String(target));
    const label=document.getElementById('progressLabel');
    if(label) label.textContent=target+' % · '+done+'/'+total+' módulos';
  }
  if(finalBtn) finalBtn.disabled=done<total;
}
function validateFinal(){
  const value=normalize(document.getElementById('finalAnswer').value);
  const fb=document.getElementById('finalFeedback');
  const expected=getFinalExpected();
  traceEvent('evaluation:submit:before', {
    scope: 'final',
    expected: expected,
    answerRaw: document.getElementById('finalAnswer').value
  });
  if(sessionData){sessionData.final=sessionData.final||{};sessionData.final.attempts=(sessionData.final.attempts||0)+1;sessionData.final.answer=document.getElementById('finalAnswer').value;sessionData.final.expected=expected;}
  if(Math.abs(value-expected)<1e-9){
    traceEvent('finalization:local:before', {
      expected: expected,
      answerValue: value
    });
    if(sessionData) sessionData.final.answerCorrect=true;
    persistSession();
    fb.className='feedback show ok';
    fb.textContent='Coincidencia confirmada. Activando secuencia final…';
    document.getElementById('finalStatus').innerHTML='<div class="result">100 %</div><h2 style="color:var(--ok)">COMPLEJO ESTABLE</h2><p>Superficie controlada: '+expected+' m²</p>';
    document.getElementById('creditsTotal').textContent=expected;
    traceEvent('persistence:before', {
      storage: 'sessionStorage',
      key: STORAGE.complete,
      hasValue: true
    });
    sessionStorage.setItem(STORAGE.complete, 'true');
    traceEvent('persistence:after', {
      storage: 'sessionStorage',
      key: STORAGE.complete,
      success: true
    });
    renderEvaluationSummary();
    transmitResults();
    if(soundOn) successSound();
    traceAsyncScheduled('validateFinal', 'setTimeout-credits', {
      delayMs: CRIOS_CONFIG.finalTransitionDelayMs
    });
    setTimeout(() => go('credits'), CRIOS_CONFIG.finalTransitionDelayMs);
    traceEvent('finalization:local:after', {
      expected: expected,
      transmitted: true,
      transitionScheduled: true
    });
    traceEvent('evaluation:submit:after', {
      scope: 'final',
      isCorrect: true
    });
  }else{
    if(sessionData) sessionData.final.answerCorrect=false;
    persistSession();
    fb.className='feedback show bad';
    fb.textContent='La red permanece inestable. Revisá la expresión final y el resultado.';
    if(soundOn) beep(150,.16);
    queueSessionUpdate();
    traceEvent('evaluation:submit:after', {
      scope: 'final',
      isCorrect: false
    });
  }
}
function resetProgress(){
  if(confirm('¿Cerrar esta sesión y comenzar con una identidad nueva? Se borrará el progreso actual.')){
    progress={};
    sessionData=null;
    sessionStats={};
    missionData={};
    hintRegistered={};
    missionOpenedAt={};

    localStorage.removeItem(STORAGE.pendingResult);
    sessionStorage.removeItem(STORAGE.progress);
    sessionStorage.removeItem(STORAGE.complete);
    sessionStorage.removeItem(STORAGE.realName);
    sessionStorage.removeItem(STORAGE.characterName);
    sessionStorage.removeItem(STORAGE.groupName);
    sessionStorage.removeItem(STORAGE.sessionStats);
    sessionStorage.removeItem(STORAGE.sessionData);
    sessionStorage.removeItem(STORAGE.campaignId);
    sessionStorage.removeItem(STORAGE.campaignProgress);
    progresosCampanas={};
    campanaActivaId=requestedPublishedCampaignId||CAMPANA_INICIAL_ID;
    inicializarCampana();

    document.querySelectorAll('input').forEach(i=>i.value='');
    document.querySelectorAll('.feedback').forEach(f=>{f.className='feedback';f.textContent=''});
    document.querySelectorAll('[data-user-name]').forEach(el=>el.textContent='operador');

    const login=document.getElementById('missionLogin');
    const welcome=document.getElementById('missionWelcome');
    if(login) login.classList.remove('hidden');
    if(welcome) welcome.classList.add('hidden');

    updateMap();
    go('reveal');
    loadGroups();
    setTimeout(()=>document.getElementById('userNameInput')?.focus(),120);
  }
}
function toast(msg){
  const t=document.getElementById('toast');t.textContent=msg;t.classList.add('show');
  setTimeout(()=>t.classList.remove('show'),1900);
}
function cleanIdentity(value){
  return String(value||'').trim().replace(/\s+/g,' ').slice(0,32);
}
function setCharacterName(name){
  const clean=cleanIdentity(name);
  if(!clean) return false;
  sessionStorage.setItem(STORAGE.characterName, clean);
  document.querySelectorAll('[data-user-name]').forEach(el=>el.textContent=clean);
  return true;
}
function loadUserName(){
  const realName=sessionStorage.getItem(STORAGE.realName);
  const characterName=sessionStorage.getItem(STORAGE.characterName);

  const realInput=document.getElementById('userNameInput');
  const characterInput=document.getElementById('characterNameInput');

  if(realInput&&realName) realInput.value=realName;
  if(characterInput&&characterName) characterInput.value=characterName;
  if(characterName) setCharacterName(characterName);
}
async function loadGroups(){
  const select=document.getElementById('groupInput');
  const status=document.getElementById('groupLoadStatus');
  const button=document.getElementById('identifyButton');
  if(!select||!button) return;

  if(runtimeLaunchBlocked){
    select.disabled=true;
    button.disabled=true;
    select.innerHTML='<option value="">Enlace de campaña no válido</option>';
    if(status) status.textContent='Abrí el modo estable o solicitá un nuevo enlace docente.';
    neutralPublishedBlock(document.getElementById('nameFeedback'),'El enlace de acceso a la campaña no es válido.');
    traceEvent('bootstrap-runtime:blocked',{mode:null,phase:'launch-request',code:runtimeLaunchError&&runtimeLaunchError.code||'INVALID_LAUNCH_REQUEST',result:'blocked'});
    return;
  }

  select.disabled=true;
  button.disabled=true;
  select.innerHTML='<option value="">Cargando grupos…</option>';
  if(status) status.textContent='Consultando la configuración del curso…';

  try{
    traceAsyncScheduled('loadGroups', 'fetch-groups', null);
    const separator=RESULTS_ENDPOINT.includes('?')?'&':'?';
    const response=await fetch(RESULTS_ENDPOINT+separator+'accion=grupos&_='+Date.now(),{
      method:'GET',
      cache:'no-store'
    });
    if(!response.ok) throw new Error('Respuesta '+response.status);

    const data=await response.json();
    traceAsyncResolved('loadGroups', 'fetch-groups', {
      ok: Boolean(response.ok)
    });
    const groups=Array.isArray(data.grupos)
      ? data.grupos.map(cleanIdentity).filter(Boolean)
      : [];

    if(!data.ok||!groups.length){
      throw new Error(data.error||'No hay grupos configurados.');
    }

    select.innerHTML='<option value="">Seleccioná tu grupo</option>';
    groups.forEach(group=>{
      const option=document.createElement('option');
      option.value=group;
      option.textContent=group;
      select.appendChild(option);
    });

    const savedGroup=sessionStorage.getItem(STORAGE.groupName);
    if(savedGroup&&groups.includes(savedGroup)) select.value=savedGroup;

    select.disabled=false;
    button.disabled=false;
    if(status) status.textContent='Grupos cargados desde Google Sheets.';
  }catch(error){
    traceAsyncRejected('loadGroups', 'fetch-groups', error);
    traceEvent('error:caught', {
      scope: 'loadGroups',
      error: traceErrorData(error)
    });
    select.innerHTML='<option value="">No se pudieron cargar los grupos</option>';
    if(status){
      status.innerHTML='No fue posible leer la hoja CONFIG. <button type="button" class="btn secondary" style="padding:6px 10px;margin-left:8px" onclick="loadGroups()">Reintentar</button>';
    }
  }
}

function emitBootstrapRuntime(eventType,payload){
  traceEvent(eventType,payload);
}

function buildLegacyLaunchHref(){
  const search=runtimeLaunchApi&&typeof runtimeLaunchApi.buildLegacyLaunchSearch==='function'
    ? runtimeLaunchApi.buildLegacyLaunchSearch()
    : '?source=legacy';
  return `${window.location.pathname}${search}${window.location.hash||''}`;
}

function neutralPublishedBlock(feedback,message){
  if(!feedback) return;
  feedback.className='feedback show bad';
  feedback.replaceChildren();
  const text=document.createElement('span');
  text.textContent=message||'La campaña no está disponible en este momento. Solicitá asistencia docente.';
  feedback.appendChild(text);
  const actions=document.createElement('div');
  actions.className='actions';
  const fallback=document.createElement('a');
  fallback.id='legacyLaunchFallback';
  fallback.className='btn secondary';
  fallback.href=buildLegacyLaunchHref();
  fallback.textContent='Abrir modo estable';
  actions.appendChild(fallback);
  feedback.appendChild(actions);
}

function applyPreparedPublishedCampaign(prepared){
  preparedRuntimeCampaign=prepared;
  const metadata=prepared.data.campaign;
  campanaActiva={id:metadata.campaignId,titulo:metadata.titulo,descripcion:metadata.descripcion,escenario:metadata.escenario,estado:'publicada',clasificacion:metadata.clasificacion,misiones:prepared.data.missionOrder.slice()};
  campanaActivaId=metadata.campaignId;
  sessionStorage.setItem(STORAGE.campaignId, metadata.campaignId);
  misionesActivas=prepared.bridge.missions.slice();
  missionIds=prepared.data.missionOrder.slice();
  progress=sessionData&&sessionData.idSesion
    ? {...(progresosCampanas[activeProgressKey()]||{})}
    : {};
  missionData={};
  hintRegistered={};
  missionOpenedAt={};
}

async function preparePublishedForIdentity(realName,characterName,groupName,recoverPinned){
  await ensureDomainModulesLoaded();
  const adapter=(window.CRIOS_DOMAIN||{}).runtimeBootstrapAdapter;
  if(!adapter) return {success:false,error:{code:'BOOTSTRAP_DEPENDENCY_MISSING'}};
  const options={mode:runtimeCampaignMode,campaignId:campanaActivaId,identity:[realName,characterName,groupName].join('|'),runtimePublicationApi:window.CRIOS_RUNTIME_EXECUTABLE_PUBLICATION,publicationCore:window.CRIOS_PUBLICATION_CORE,missionHandlersApi:window.CRIOS_RUNTIME_MISSION_HANDLERS,persistenceApi:window.CRIOS_PUBLICATION_PERSISTENCE,telemetry:emitBootstrapRuntime};
  const pinned=recoverPinned&&sessionData&&sessionData.campana&&sessionData.campana.sourceMode==='published'?sessionData.campana:null;
  return pinned
    ? adapter.recoverPublishedCampaign({...options,pinnedPublication:pinned})
    : adapter.preparePublishedCampaign(options);
}

async function identifyUser(){
  const realInput=document.getElementById('userNameInput');
  const characterInput=document.getElementById('characterNameInput');
  const groupInput=document.getElementById('groupInput');
  const fb=document.getElementById('nameFeedback');

  const realName=cleanIdentity(realInput?.value);
  const characterName=cleanIdentity(characterInput?.value);
  const groupName=cleanIdentity(groupInput?.value);

  if(!realName||!characterName||!groupName){
    fb.className='feedback show bad';
    fb.textContent=!realName
      ? 'Escribí el nombre real para registrar la sesión.'
      : !characterName
        ? 'Elegí un nombre para tu personaje.'
        : 'Seleccioná tu grupo.';
    return;
  }

  if(runtimeLaunchBlocked){
    traceEvent('bootstrap-runtime:blocked',{mode:null,phase:'launch-request',code:runtimeLaunchError&&runtimeLaunchError.code||'INVALID_LAUNCH_REQUEST',result:'blocked'});
    neutralPublishedBlock(fb,'El enlace de acceso a la campaña no es válido.');
    return;
  }

  if(!runtimeCampaignModeValid){
    traceEvent('bootstrap-runtime:blocked',{mode:runtimeCampaignMode,phase:'mode',code:'INVALID_RUNTIME_CAMPAIGN_MODE',result:'blocked'});
    neutralPublishedBlock(fb,'El modo solicitado no está disponible.');
    return;
  }

  let recoveredSession=false;
  if(runtimeCampaignMode==='published'){
    const existingSession=sessionData;
    const existingIdentity=existingSession&&existingSession.nombre===realName&&existingSession.personaje===characterName&&existingSession.grupo===groupName;
    const existingCampaignId=existingSession&&existingSession.campana&&(existingSession.campana.campaignId||existingSession.campana.id);
    const recoverPinned=Boolean(existingIdentity&&existingSession.campana&&existingSession.campana.sourceMode==='published'&&existingCampaignId===campanaActivaId);
    const prepared=await preparePublishedForIdentity(realName,characterName,groupName,recoverPinned);
    if(!prepared.success){
      neutralPublishedBlock(fb);
      return;
    }
    applyPreparedPublishedCampaign(prepared.campaign);
    recoveredSession=Boolean(recoverPinned&&existingSession&&existingSession.campana&&existingSession.campana.publicationId===prepared.campaign.data.campaign.publicationId&&existingSession.campana.contentHash===prepared.campaign.data.campaign.contentHash);
    if(!recoveredSession) sessionData=null;
  }

  sessionStorage.setItem(STORAGE.realName, realName);
  sessionStorage.setItem(STORAGE.groupName, groupName);
  setCharacterName(characterName);
  if(!recoveredSession) startSession(realName,characterName,groupName);
  else{
    progress={...(progresosCampanas[activeProgressKey()]||{})};
    rebuildDomainStateForActiveCampaign();
  }
  sendSessionUpdate(false);

  audioCtx=audioCtx||new (window.AudioContext||window.webkitAudioContext)();
  if(audioCtx.state==='suspended') audioCtx.resume();
  if(!ambientStarted) startAmbientAudio();
  successSound();

  fb.className='feedback';
  document.getElementById('missionLogin').classList.add('hidden');
  const confirmedGroup=document.getElementById('confirmedGroup');
  if(confirmedGroup) confirmedGroup.textContent=groupName;
  ensureMissionData();
  setupMissionUI();
  actualizarCabeceraCampana();
  configureCampaignEntry();
  updateMap();
  traceEvent('bootstrap-runtime:completed',{mode:runtimeCampaignMode,campaignId:campanaActiva.id,publicationId:sessionData&&sessionData.campana&&sessionData.campana.publicationId||null,result:'completed'});
  document.getElementById('missionWelcome').classList.remove('hidden');
}


function progresoDeCampana(campana) {
  const guardado = campana.id === campanaActiva.id ? progress : (progresosCampanas[campana.id] || {});
  const completadas = campana.misiones.filter((id) => Boolean(guardado[id])).length;
  return {
    completadas,
    total: campana.misiones.length,
    porcentaje: campana.misiones.length ? Math.round(completadas * 100 / campana.misiones.length) : 0
  };
}

function actualizarCabeceraCampana() {
  if (!campanaActiva) return;
  const etiquetas = obtenerEtiquetaTaxonomia(campanaActiva.clasificacion);
  const titulo = document.getElementById('mapCampaignTitle');
  const clasificacion = document.getElementById('mapCampaignClass');
  if (titulo) titulo.textContent = campanaActiva.titulo;
  if (clasificacion) clasificacion.textContent = `${etiquetas.materia} · ${etiquetas.tema} · ${etiquetas.subtema}`;
}

function configureCampaignEntry(){
  const prompt=document.getElementById('campaignEntryPrompt');
  const button=document.getElementById('campaignEntryButton');
  if(runtimeCampaignMode==='published'){
    if(prompt) prompt.textContent='La campaña publicada está preparada para continuar.';
    if(button) button.textContent='Continuar campaña';
    return;
  }
  if(prompt) prompt.textContent='Seleccioná el recorrido operativo que querés iniciar.';
  if(button) button.textContent='Seleccionar campaña';
}

function detalleCampana(id) {
  const campana = obtenerCampanaPorId(id);
  const panel = document.getElementById('campaignDetail');
  if (!campana || !panel) return;
  const etiquetas = obtenerEtiquetaTaxonomia(campana.clasificacion);
  const estado = progresoDeCampana(campana);
  const publicada = campana.estado === 'publicada';
  panel.innerHTML = `
    <div class="brand">INFORMACIÓN DEL RECORRIDO</div>
    <h2>${campana.titulo}</h2>
    <p class="subtitle">${campana.descripcion}</p>
    <div class="detail-grid">
      <div class="detail-row"><span>Materia</span>${etiquetas.materia}</div>
      <div class="detail-row"><span>Tema</span>${etiquetas.tema}</div>
      <div class="detail-row"><span>Contenido</span>${etiquetas.subtema}</div>
      <div class="detail-row"><span>Misiones</span>${campana.misiones.length}</div>
      <div class="detail-row"><span>Progreso guardado</span>${estado.completadas}/${estado.total} · ${estado.porcentaje} %</div>
    </div>
    <div class="actions">
      <button class="btn" ${publicada ? '' : 'disabled'} onclick="seleccionarCampana('${campana.id}')">
        ${campana.id === campanaActiva.id ? 'Continuar campaña' : 'Iniciar campaña'}
      </button>
    </div>`;
  document.querySelectorAll('.campaign-card').forEach((card) => card.classList.toggle('selected', card.dataset.campaignId === id));
}

function renderCampaignSelector() {
  const lista = document.getElementById('campaignList');
  const contador = document.getElementById('campaignCount');
  if (!lista) return;
  const campanas = listarCampanas();
  if (contador) contador.textContent = `${campanas.length} ${campanas.length === 1 ? 'campaña' : 'campañas'}`;
  lista.innerHTML = campanas.map((campana) => {
    const etiquetas = obtenerEtiquetaTaxonomia(campana.clasificacion);
    const estado = progresoDeCampana(campana);
    const bloqueada = campana.estado !== 'publicada';
    return `<button type="button" class="campaign-card ${campana.id === campanaActiva.id ? 'selected' : ''} ${bloqueada ? 'locked' : ''}"
      data-campaign-id="${campana.id}" onclick="detalleCampana('${campana.id}')" ${bloqueada ? 'disabled' : ''}>
      <div class="campaign-card-head"><div><h3>${campana.titulo}</h3><p>${campana.descripcion}</p></div><span class="campaign-tag">${bloqueada ? 'Próximamente' : 'Disponible'}</span></div>
      <div class="campaign-meta"><span class="campaign-tag">${etiquetas.materia}</span><span class="campaign-tag">${etiquetas.tema}</span><span class="campaign-tag">${campana.misiones.length} misiones</span></div>
      <div class="campaign-progress">Progreso: ${estado.completadas}/${estado.total}
        <div class="campaign-progress-track"><div class="campaign-progress-fill" style="transform:scaleX(${estado.porcentaje/100})"></div></div>
      </div>
    </button>`;
  }).join('');
  detalleCampana(campanaActiva.id);
}

function abrirSelectorCampanas() {
  if(runtimeCampaignMode==='published'){
    actualizarCabeceraCampana();
    updateMap();
    go('map');
    return;
  }
  renderCampaignSelector();
  go('campanas');
}

function seleccionarCampana(id) {
  const campana = obtenerCampanaPorId(id);
  if (!campana || campana.estado !== 'publicada') return;
  establecerCampanaActiva(id, { navegar: true });
}

async function toggleFullscreen(event){
  if(event) event.stopPropagation();
  try{
    if(!document.fullscreenElement){
      await document.documentElement.requestFullscreen();
    }else{
      await document.exitFullscreen();
    }
  }catch(e){}
  setTimeout(fitCriosToViewport,120);
  updateFullscreenButton();
}
function updateFullscreenButton(){
  const btn=document.getElementById('fullscreenControl');
  if(btn) btn.textContent=document.fullscreenElement?'SALIR DE PANTALLA COMPLETA':'PANTALLA COMPLETA';
}
document.addEventListener('fullscreenchange',()=>{
  updateFullscreenButton();
  setTimeout(fitCriosToViewport,120);
});
let suspenseTimer=null;
let suspenseMaster=null;
let suspenseRunning=false;
let suspenseStep=0;

function createSuspenseVoice(freq,start,duration,gain,type='sine',detune=0){
  if(!audioCtx||!suspenseMaster) return;
  const osc=audioCtx.createOscillator();
  const env=audioCtx.createGain();
  const filter=audioCtx.createBiquadFilter();
  osc.type=type;
  osc.frequency.setValueAtTime(freq,start);
  osc.detune.setValueAtTime(detune,start);
  filter.type='lowpass';
  filter.frequency.setValueAtTime(900,start);
  filter.Q.value=1.2;
  env.gain.setValueAtTime(.0001,start);
  env.gain.exponentialRampToValueAtTime(gain,start+.08);
  env.gain.exponentialRampToValueAtTime(.0001,start+duration);
  osc.connect(filter);filter.connect(env);env.connect(suspenseMaster);
  osc.start(start);osc.stop(start+duration+.05);
}

function scheduleSuspensePhrase(){
  if(!suspenseRunning||!audioCtx) return;
  const now=audioCtx.currentTime+.03;
  const roots=[55,55,58.27,51.91]; // A1, A1, Bb1, G#1
  const root=roots[suspenseStep%roots.length];
  createSuspenseVoice(root,now,3.8,.055,'sawtooth',-5);
  createSuspenseVoice(root*1.5,now+.05,3.5,.025,'triangle',4);
  createSuspenseVoice(root*2,now+.12,3.2,.018,'sine',0);
  const pulse=[root*2,root*2.2449,root*2.3784,root*2.2449];
  pulse.forEach((f,i)=>createSuspenseVoice(f,now+.55+i*.62,.5,.026,i%2?'triangle':'sine'));
  suspenseStep++;
}

function startAmbientAudio(){
  audioCtx=audioCtx||new (window.AudioContext||window.webkitAudioContext)();
  if(audioCtx.state==='suspended') audioCtx.resume();
  if(suspenseRunning) return;
  suspenseMaster=audioCtx.createGain();
  const compressor=audioCtx.createDynamicsCompressor();
  suspenseMaster.gain.value=.72;
  suspenseMaster.connect(compressor);compressor.connect(audioCtx.destination);
  suspenseRunning=true;
  ambientStarted=true;
  scheduleSuspensePhrase();
  suspenseTimer=setInterval(scheduleSuspensePhrase,3600);
  updateAudioButton();
}

function stopSuspenseMusic(){
  suspenseRunning=false;
  ambientStarted=false;
  if(suspenseTimer){clearInterval(suspenseTimer);suspenseTimer=null;}
  if(suspenseMaster){
    try{suspenseMaster.gain.exponentialRampToValueAtTime(.0001,audioCtx.currentTime+.25);}catch(e){}
    setTimeout(()=>{try{suspenseMaster.disconnect()}catch(e){} suspenseMaster=null;},320);
  }
  updateAudioButton();
}

function updateAudioButton(){
  const btn=document.getElementById('audioControl');
  if(!btn) return;
  btn.textContent=suspenseRunning?'SILENCIAR MÚSICA':'ACTIVAR MÚSICA';
  btn.classList.toggle('muted',!suspenseRunning);
}

async function toggleAmbientAudio(event){
  if(event) event.stopPropagation();
  if(suspenseRunning) stopSuspenseMusic();
  else startAmbientAudio();
}

function uiClick(){
  if(!soundOn||!audioCtx) return;
  beep(520,.045,.035);
}

function beep(freq=440,dur=.08,volume=.05){
  if(!soundOn||!audioCtx)return;
  const o=audioCtx.createOscillator(),g=audioCtx.createGain();
  o.frequency.value=freq;o.type='sine';g.gain.setValueAtTime(volume,audioCtx.currentTime);
  g.gain.exponentialRampToValueAtTime(.001,audioCtx.currentTime+dur);
  o.connect(g);g.connect(audioCtx.destination);o.start();o.stop(audioCtx.currentTime+dur);
}
function successSound(){[440,660,880].forEach((f,i)=>setTimeout(()=>beep(f,.11),i*100))}
const VARIANT_COUNT = CRIOS_CONFIG.variantCount;
function hashString(str){let h=2166136261;const s=String(str||'operador').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'');for(let i=0;i<s.length;i++){h^=s.charCodeAt(i);h=Math.imul(h,16777619)}return h>>>0}
function seeded(seed){let x=seed>>>0;return function(){x+=0x6D2B79F5;let t=x;t=Math.imul(t^(t>>>15),t|1);t^=t+Math.imul(t^(t>>>7),t|61);return ((t^(t>>>14))>>>0)/4294967296}}
function pick(arr,r){return arr[Math.floor(r()*arr.length)]}
function variantIdFor(name){return (hashString(name)%VARIANT_COUNT)+1}
function generateMissionData(name){
  if(runtimeCampaignMode==='published'){
    if(!preparedRuntimeCampaign) throw new Error('La campaña publicada no fue preparada.');
    const generated={variant:variantIdFor(name)};
    missionIds.forEach(id=>{generated[id]=obtenerMision(id).generar();});
    generated.adjustMinus=preparedRuntimeCampaign.bridge.finalEvaluation.adjustMinus;
    generated.adjustPlus=preparedRuntimeCampaign.bridge.finalEvaluation.adjustPlus;
    return generated;
  }
  const seed=hashString(name),r=seeded(seed),variant=variantIdFor(name);
  const generated={variant};
  missionIds.forEach(id=>{generated[id]=obtenerMision(id).generar(r,variant);});
  generated.adjustMinus=pick([24,28,30,32,35],r);
  generated.adjustPlus=pick([6,8,10,12],r);
  return generated;
}
function ensureMissionData(){missionData=generateMissionData(sessionStorage.getItem(STORAGE.realName)||'operador')}
function renderMission(id){
  ensureMissionData();
  const definition=obtenerMision(id),data=missionData[id];
  if(!definition||!data) return;
  const content=definition.contenido(data);
  document.getElementById('variant-'+id).textContent='CONFIGURACIÓN INDIVIDUAL · VARIANTE '+String(data.variant).padStart(2,'0');
  document.getElementById('missionText-'+id).innerHTML=content.text;
  document.getElementById('question-'+id).textContent=content.question;
  document.getElementById('blueprint-'+id).innerHTML=content.svg;
  document.getElementById('hintText-'+id).innerHTML='<p>'+data.hint+'</p>';
}
function missionScreenTemplate(id,definition){
  return `<section id="mission-${id}" class="screen mission">
    <div class="mission-wrap">
      <div class="mission-head"><div><div class="brand">MISIÓN ${definition.numero}</div><h2>${definition.titulo}</h2><div class="mission-code" id="variant-${id}">VARIANTE —</div></div><button class="btn secondary" onclick="go('map')">Cerrar módulo</button></div>
      <div class="mission-grid"><div class="blueprint panel" id="blueprint-${id}"></div><div class="mission-info panel">
        <div class="brief"><strong>A.R.I.A.:</strong> ${definition.mensajeAria}</div>
        <div id="context-${id}"><p id="missionText-${id}"></p><p><strong id="question-${id}"></strong></p></div>
        <div class="procedure-box"><label for="procedure-${id}">REGISTRO DE PROCEDIMIENTO</label><p class="small">Escribí una única expresión con las operaciones que representan tu razonamiento.</p>
          <div class="procedure-row"><input id="procedure-${id}" autocomplete="off" spellcheck="false" placeholder="${definition.ejemploProcedimiento}"><button class="btn" onclick="validateProcedure('${id}')">Verificar procedimiento</button></div>
          <div id="procedureFeedback-${id}" class="feedback"></div><div id="resultStep-${id}" class="result-step locked"><label for="answer-${id}">RESULTADO FINAL</label><div class="answer"><input id="answer-${id}" inputmode="decimal" placeholder="Resultado en m²"><button class="btn" onclick="validateMissionResult('${id}')">Ejecutar reparación</button></div><div id="feedback-${id}" class="feedback"></div></div>
        </div><details id="hint-${id}" onclick="registerHint('${id}')"><summary>Solicitar asistencia de A.R.I.A.</summary><div id="hintText-${id}"></div></details>
      </div></div>
    </div></section>`;
}
function setupMissionUI(){
  const screens=document.getElementById('missionScreens');
  const modules=document.getElementById('missionMapModules');
  const statusList=document.getElementById('missionStatusList');
  if(screens) screens.innerHTML=missionIds.map(id=>missionScreenTemplate(id,obtenerMision(id))).join('');
  if(modules) modules.innerHTML=missionIds.map(id=>{const m=obtenerMision(id);return `<button class="module ${m.mapa.clase}" id="card-${id}" onclick="openMission('${id}')"><span class="dot"></span><strong>${m.mapa.titulo||m.titulo}</strong><br><span class="small">${m.mapa.subtitulo}</span></button>`;}).join('');
  if(statusList) statusList.innerHTML=missionIds.map(id=>`<div class="mini" id="mini-${id}">● ${obtenerMision(id).nombreCorto}: sin respuesta</div>`).join('');
  const count=document.getElementById('doneCount');
  if(count) count.textContent='0/'+missionIds.length;
}
function sanitizeExpression(raw){let s=String(raw||'').trim().toLowerCase();s=s.replace(/,/g,'.').replace(/π/g,'3').replace(/\bpi\b/g,'3').replace(/[×x·]/g,'*').replace(/[÷:]/g,'/').replace(/\^/g,'**');if(!/^[0-9+\-*/().\s]+$/.test(s))throw new Error();return s}
function safeEvaluate(raw){const s=sanitizeExpression(raw);if(!s||s.length>180)throw new Error();const value=Function('"use strict";return ('+s+')')();if(!Number.isFinite(value))throw new Error();return value}
function extractNumbers(raw){const s=String(raw||'').replace(/,/g,'.').replace(/π/gi,'3').replace(/\bpi\b/gi,'3');return (s.match(/\d+(?:\.\d+)?/g)||[]).map(Number)}
function containsRequiredNumbers(raw,required){const nums=extractNumbers(raw);return required.every(req=>nums.some(n=>Math.abs(n-req)<1e-9))}
function procedureUsesEssentialData(id,raw){const d=missionData[id];if(containsRequiredNumbers(raw,d.required))return true;return Array.isArray(d.alternatives)&&d.alternatives.some(set=>containsRequiredNumbers(raw,set))}
function validateProcedure(id){
  ensureMissionData();const input=document.getElementById('procedure-'+id),fb=document.getElementById('procedureFeedback-'+id),d=missionData[id];
  sessionStats[id]=sessionStats[id]||{attempts:0,hints:0,procedureAttempts:0};sessionStats[id].procedureAttempts++;
  const rec=missionRecord(id);if(rec){rec.procedure=input.value;rec.procedureAttempts=sessionStats[id].procedureAttempts;rec.expected=d.expected;}
  persistStats();
  try{
    const value=safeEvaluate(input.value),usesData=procedureUsesEssentialData(id,input.value),equivalent=Math.abs(value-d.expected)<1e-9;
    if(rec) rec.procedureCorrect=equivalent&&usesData;
    persistSession();
    if(equivalent&&usesData){fb.className='feedback show ok';fb.textContent='Procedimiento compatible. A.R.I.A. habilitó el ingreso del resultado final.';document.getElementById('resultStep-'+id).classList.remove('locked');if(soundOn)successSound()}
    else if(equivalent){fb.className='feedback show bad';fb.textContent='La expresión llega al valor esperado, pero no registra los datos esenciales del plano.'}
    else{fb.className='feedback show bad';fb.textContent='La expresión no representa todavía la superficie solicitada. Revisá signos, paréntesis y orden de operaciones.'}
  }catch(e){if(rec) rec.procedureCorrect=false;persistSession();fb.className='feedback show bad';fb.textContent='No pude interpretar la expresión. Usá números, +, −, *, / y paréntesis.'}
  queueSessionUpdate();
}
function validateMissionResult(id){
  ensureMissionData();const input=document.getElementById('answer-'+id),value=normalize(input.value),fb=document.getElementById('feedback-'+id),expected=missionData[id].expected;
  traceEvent('evaluation:submit:before', {
    scope: 'mission',
    missionId: id,
    expected: expected,
    answerRaw: input.value
  });
  sessionStats[id]=sessionStats[id]||{attempts:0,hints:0,procedureAttempts:0};sessionStats[id].attempts++;
  const rec=missionRecord(id);if(rec){rec.answer=input.value;rec.answerAttempts=sessionStats[id].attempts;rec.expected=expected;}
  persistStats();
  const isCorrect=Math.abs(value-expected)<1e-9;
  const gameFlowResult=applyDomainEvaluationForMission(id,isCorrect);
  if(isCorrect&&gameFlowResult&&gameFlowResult.status==='FLOW_COMPLETED'&&gameFlowResult.action==='RETURN_TO_MAP'&&gameFlowResult.target==='map'){
    fb.className='feedback show ok';fb.textContent='Resultado compatible. Módulo recuperado. Regresando al mapa…';
    persistStats();save();if(soundOn)successSound();
    traceAsyncScheduled('validateMissionResult', 'setTimeout-map', {
      delayMs: CRIOS_CONFIG.missionReturnDelayMs,
      missionId: id
    });
    setTimeout(() => go('map'), CRIOS_CONFIG.missionReturnDelayMs)
  }else if(!isCorrect&&gameFlowResult&&gameFlowResult.status==='FLOW_COMPLETED'&&gameFlowResult.action==='RETRY_MISSION'&&gameFlowResult.target===null){
    persistSession();fb.className='feedback show bad';fb.textContent='El resultado no coincide con la simulación. Revisá el procedimiento antes de volver a intentarlo.'
  }else if(gameFlowResult&&gameFlowResult.status==='GAME_OVER'){
    if(rec) rec.answerCorrect=false;
    persistSession();fb.className='feedback show bad';fb.textContent='El resultado no coincide con la simulación. Revisá el procedimiento antes de volver a intentarlo.'
  }else{
    fb.className='feedback show bad';fb.textContent='No fue posible actualizar el estado de la misión. Solicitá asistencia docente.';
    traceEvent('error:caught', {
      scope: 'applyDomainEvaluationForMission',
      status: gameFlowResult ? gameFlowResult.status : null,
      stage: gameFlowResult ? gameFlowResult.stage : null,
      error: gameFlowResult ? gameFlowResult.error : 'Game Flow no disponible.'
    });
  }
  traceEvent('evaluation:submit:after', {
    scope: 'mission',
    missionId: id,
    isCorrect: isCorrect,
    status: gameFlowResult ? gameFlowResult.status : null
  });
  queueSessionUpdate();
}
function registerHint(id){if(hintRegistered[id])return;hintRegistered[id]=true;sessionStats[id]=sessionStats[id]||{attempts:0,hints:0,procedureAttempts:0};sessionStats[id].hints++;const rec=missionRecord(id);if(rec) rec.hintUsed=true;persistStats();persistSession();queueSessionUpdate()}
function persistStats(){writeJson(sessionStorage, STORAGE.sessionStats, sessionStats);persistSession()}
function getFinalExpected(){ensureMissionData();return missionIds.reduce((sum,id)=>sum+missionData[id].expected,0)-missionData.adjustMinus+missionData.adjustPlus}
function renderFinal(){
  ensureMissionData();
  document.getElementById('finalSystems').innerHTML=missionIds.map(id=>obtenerMision(id).nombreCorto.toUpperCase()+' = '+missionData[id].expected+' m²').join('<br>')+`<br>AJUSTES = −${missionData.adjustMinus} m² + ${missionData.adjustPlus} m²`;
  document.getElementById('finalInstruction').innerHTML=`Sumen las ${missionIds.length} superficies recuperadas. Luego resten <strong>${missionData.adjustMinus} m²</strong> de corredores aislados y agreguen <strong>${missionData.adjustPlus} m²</strong> de reserva térmica.`;
}
function validateFinalProcedure(){
  ensureMissionData();const raw=document.getElementById('finalProcedure').value,fb=document.getElementById('finalProcedureFeedback'),expected=getFinalExpected(),required=[...missionIds.map(id=>missionData[id].expected),missionData.adjustMinus,missionData.adjustPlus];
  if(sessionData){sessionData.final=sessionData.final||{};sessionData.final.procedureAttempts=(sessionData.final.procedureAttempts||0)+1;sessionData.final.procedure=raw;sessionData.final.expected=expected;}
  try{
    const value=safeEvaluate(raw),ok=Math.abs(value-expected)<1e-9&&containsRequiredNumbers(raw,required);
    if(sessionData) sessionData.final.procedureCorrect=ok;persistSession();
    if(ok){fb.className='feedback show ok';fb.textContent='Procedimiento final compatible. Secuencia de estabilización habilitada.';document.getElementById('finalResultStep').classList.remove('locked');if(soundOn)successSound()}
    else if(Math.abs(value-expected)<1e-9){fb.className='feedback show bad';fb.textContent='El valor coincide, pero faltan datos esenciales de los módulos o de los ajustes.'}
    else{fb.className='feedback show bad';fb.textContent='La expresión final no coincide con la red de superficies recuperadas.'}
  }catch(e){if(sessionData) sessionData.final.procedureCorrect=false;persistSession();fb.className='feedback show bad';fb.textContent='No pude interpretar la expresión final.'}
  queueSessionUpdate();
}


let introActivated=false;
let introReady=false;

async function activateIntro(){
  if(!introReady||introActivated) return;
  introActivated=true;

  const intro=document.getElementById('intro');
  intro.classList.remove('intro-ready');
  intro.classList.add('connection-started');
  const prompt=document.getElementById('tapPrompt');
  if(prompt) prompt.textContent='SEÑAL RECIBIDA';

  audioCtx=audioCtx||new (window.AudioContext||window.webkitAudioContext)();
  if(audioCtx.state==='suspended'){
    try{ await audioCtx.resume(); }catch(e){}
  }

  startAmbientAudio();

  // Secuencia audible de arranque
  beep(180,.18,.08);
  setTimeout(()=>beep(360,.12,.07),220);
  setTimeout(()=>beep(540,.12,.065),430);
  setTimeout(()=>successSound(),650);

  setTimeout(()=>{
      intro.classList.add('connection-fading');
    },1750);
    setTimeout(()=>go('aria'),2850);
}

const bootStart=performance.now();
const bootDuration=4100;
const bootFill=document.getElementById('bootProgressFill');
const bootBox=bootFill?bootFill.parentElement:null;
function animateBootProgress(now){
  const pct=Math.min(100,Math.max(0,((now-bootStart)/bootDuration)*100));
  if(bootFill) bootFill.style.transform='scaleX('+(pct/100)+')';
  if(bootBox) bootBox.setAttribute('aria-valuenow',String(Math.round(pct)));
  if(pct<100){
    requestAnimationFrame(animateBootProgress);
  }else{
    introReady=true;
    const intro=document.getElementById('intro');
    intro.classList.add('intro-ready');
    const prompt=document.getElementById('tapPrompt');
    if(prompt) prompt.textContent='TOCÁ CUALQUIER PUNTO PARA ESTABLECER LA CONEXIÓN';
  }
}
requestAnimationFrame(animateBootProgress);

document.getElementById('intro').addEventListener('pointerdown',activateIntro);
document.getElementById('intro').addEventListener('keydown',(event)=>{
  if(event.key==='Enter'||event.key===' '){
    event.preventDefault();
    activateIntro();
  }
});
document.getElementById('intro').setAttribute('tabindex','0');
document.getElementById('intro').setAttribute('role','button');
document.getElementById('intro').setAttribute('aria-label','Tocar para establecer la conexión');

Promise.all([
  ensureDomainModulesLoaded(),
  ensureGameFlowLegacyAdapterLoaded(),
  ensureEvaluationModelLoaded(),
  ensureProgressModelLoaded(),
  ensureMissionNavigationModelLoaded()
])
  .then(() => {
    domainReady = true;
    rebuildDomainStateForActiveCampaign();
  })
  .catch((error) => {
    console.warn('[CRIOS] Módulos de dominio no disponibles:', error);
  });

setupMissionUI();
actualizarCabeceraCampana();
renderCampaignSelector();
updateMap();
loadUserName();
loadGroups();
retryPendingResult();
window.addEventListener('online',()=>{
  traceAsyncScheduled('online-listener', 'retry-pending-result', {
    online: Boolean(navigator.onLine)
  });
  retryPendingResult()
    .then(() => {
      traceAsyncResolved('online-listener', 'retry-pending-result', null);
    })
    .catch((error) => {
      traceAsyncRejected('online-listener', 'retry-pending-result', error);
      traceEvent('error:caught', {
        scope: 'online-listener',
        error: traceErrorData(error)
      });
    });
});
window.addEventListener('pagehide',sendExitSnapshot);
document.addEventListener('visibilitychange',()=>{
  if(document.visibilityState==='hidden') sendExitSnapshot();
});



function fitCriosToViewport(){
  const app=document.querySelector('.app');
  if(!app) return;
  const { width: designW, height: designH } = CRIOS_CONFIG.designViewport;
  const scale=Math.min(window.innerWidth/designW,window.innerHeight/designH);
  const left=(window.innerWidth-designW*scale)/2;
  const top=(window.innerHeight-designH*scale)/2;
  app.style.transform=`scale(${scale})`;
  app.style.left=`${left}px`;
  app.style.top=`${top}px`;
}
window.addEventListener('resize',fitCriosToViewport);
window.addEventListener('orientationchange',()=>setTimeout(fitCriosToViewport,120));
fitCriosToViewport();
updateAudioButton();
updateFullscreenButton();

const publicApi = Object.freeze({
  go,
  openMission,
  validateProcedure,
  validateMissionResult,
  registerHint,
  validateFinalProcedure,
  validateFinal,
  resetProgress,
  identifyUser,
  loadGroups,
  toggleFullscreen,
  toggleAmbientAudio,
  abrirSelectorCampanas,
  seleccionarCampana,
  detalleCampana
});

Object.assign(window, publicApi);
window.CRIOS = Object.freeze({
  version: CRIOS_VERSION,
  runtimeCampaignMode: runtimeLaunchState.sourceMode,
  runtimeLaunch: runtimeLaunchState,
  obtenerCampanaActiva: () => campanaActiva,
  obtenerMisionesActivas: () => Object.freeze([...missionIds]),
  listarCampanas: () => Object.freeze([...listarCampanas()]),
  api: publicApi
});

})();
