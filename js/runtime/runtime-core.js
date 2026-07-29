/* CRIOS Domain — runtime core */
(function(){
  'use strict';

  const registerDomainModule = window.__CRIOS_REGISTER_DOMAIN_MODULE__;
  if (typeof registerDomainModule !== 'function') {
    throw new Error('No se pudo registrar RuntimeCore: registrador de composición no disponible.');
  }

  const RUNTIME_STATE_STATUSES = ['initialized', 'ready', 'error'];

  function getReleaseValidator() {
    const domain = window.CRIOS_DOMAIN || {};
    const releaseValidator = domain.releaseValidator;
    if (!releaseValidator || typeof releaseValidator.validateReleaseStructure !== 'function') {
      throw new Error('Runtime inválido: ReleaseValidator no disponible.');
    }
    return releaseValidator.validateReleaseStructure;
  }

  function getSessionValidator() {
    const domain = window.CRIOS_DOMAIN || {};
    const sessionValidator = domain.sessionValidator;
    if (!sessionValidator || typeof sessionValidator.validateStudentSession !== 'function') {
      throw new Error('Runtime inválido: SessionValidator no disponible.');
    }
    return sessionValidator.validateStudentSession;
  }

  function getSessionModel() {
    const domain = window.CRIOS_DOMAIN || {};
    const sessionModel = domain.sessionModel;
    if (!sessionModel || typeof sessionModel.isAllowedStatus !== 'function') {
      throw new Error('Runtime inválido: SessionModel no disponible.');
    }
    return sessionModel;
  }

  function getReleaseModel() {
    const domain = window.CRIOS_DOMAIN || {};
    const releaseModel = domain.releaseModel;
    if (!releaseModel || typeof releaseModel.safeClone !== 'function') {
      throw new Error('Runtime inválido: ReleaseModel no disponible.');
    }
    return releaseModel;
  }

  function createRuntimeSessionSnapshot(session) {
    return getReleaseModel().safeClone(session);
  }

  function resolveMissionFromReleaseAndSession(release, session) {
    const missions = Array.isArray(release && release.missions) ? release.missions : [];
    if (missions.length === 0) {
      throw new Error('No se puede crear Runtime: el Release no contiene misiones.');
    }

    const missionIndex = session ? session.currentMissionIndex : null;
    if (!Number.isInteger(missionIndex) || missionIndex < 0) {
      throw new Error('No se puede crear Runtime: currentMissionIndex debe ser un entero no negativo.');
    }

    if (missionIndex >= missions.length) {
      throw new Error('No se puede crear Runtime: currentMissionIndex está fuera de rango.');
    }

    const missionByIndex = missions[missionIndex];
    if (!missionByIndex || typeof missionByIndex !== 'object' || Array.isArray(missionByIndex)) {
      throw new Error('No se puede crear Runtime: la misión indicada por currentMissionIndex no es válida.');
    }

    const missionByIndexId = missionByIndex.id;
    if (missionByIndexId === null || missionByIndexId === undefined || String(missionByIndexId).trim() === '') {
      throw new Error('No se puede crear Runtime: la misión indicada por currentMissionIndex no tiene id.');
    }

    const missionId = session && session.progress ? session.progress.currentMissionId : null;
    if (missionId === null || missionId === undefined || String(missionId).trim() === '') {
      throw new Error('No se puede crear Runtime: la Session no define currentMissionId.');
    }

    const missionById = missions.find(item => item && item.id === missionId);
    if (!missionById || typeof missionById !== 'object' || Array.isArray(missionById)) {
      throw new Error('No se puede crear Runtime: currentMissionId no existe en el Release.');
    }

    if (missionByIndexId !== missionById.id) {
      throw new Error('No se puede crear Runtime: currentMissionIndex y currentMissionId no apuntan a la misma misión.');
    }

    return getReleaseModel().safeClone(missionByIndex);
  }

  function validateRuntimeState(state) {
    const expectedStateKeys = ['status', 'errors'];

    if (!state || typeof state !== 'object' || Array.isArray(state)) {
      throw new Error('Runtime inválido: state debe ser un objeto.');
    }

    const stateKeys = Object.keys(state);
    const missingStateKeys = expectedStateKeys.filter(key => !Object.prototype.hasOwnProperty.call(state, key));
    if (missingStateKeys.length > 0) {
      throw new Error('Runtime inválido: state falta(n) campo(s) obligatorio(s): ' + missingStateKeys.join(', ') + '.');
    }

    const extraStateKeys = stateKeys.filter(key => !expectedStateKeys.includes(key));
    if (extraStateKeys.length > 0) {
      throw new Error('Runtime inválido: state contiene campo(s) no permitido(s): ' + extraStateKeys.join(', ') + '.');
    }

    if (typeof state.status !== 'string' || !RUNTIME_STATE_STATUSES.includes(state.status)) {
      throw new Error('Runtime inválido: state.status no permitido. Valores válidos: initialized, ready, error.');
    }

    if (!Array.isArray(state.errors)) {
      throw new Error('Runtime inválido: state.errors debe ser un arreglo.');
    }
  }

  function validateRuntime(runtime) {
    const validateStudentSession = getSessionValidator();
    const expectedRootKeys = ['session', 'mission', 'state'];

    if (!runtime || typeof runtime !== 'object' || Array.isArray(runtime)) {
      throw new Error('Runtime inválido: debe ser un objeto.');
    }

    const runtimeKeys = Object.keys(runtime);
    const missingRootKeys = expectedRootKeys.filter(key => !Object.prototype.hasOwnProperty.call(runtime, key));
    if (missingRootKeys.length > 0) {
      throw new Error('Runtime inválido: falta(n) campo(s) obligatorio(s): ' + missingRootKeys.join(', ') + '.');
    }

    const extraRootKeys = runtimeKeys.filter(key => !expectedRootKeys.includes(key));
    if (extraRootKeys.length > 0) {
      throw new Error('Runtime inválido: contiene campo(s) no permitido(s): ' + extraRootKeys.join(', ') + '.');
    }

    validateStudentSession(runtime.session);

    if (!runtime.mission || typeof runtime.mission !== 'object' || Array.isArray(runtime.mission)) {
      throw new Error('Runtime inválido: mission debe ser un objeto válido.');
    }

    if (runtime.mission.id === null || runtime.mission.id === undefined || String(runtime.mission.id).trim() === '') {
      throw new Error('Runtime inválido: mission.id es obligatorio.');
    }

    validateRuntimeState(runtime.state);
  }

  function createRuntime(release, session) {
    const validateReleaseStructure = getReleaseValidator();
    const validateStudentSession = getSessionValidator();

    validateReleaseStructure(release);
    validateStudentSession(session);

    if (session.releaseId !== release.id) {
      throw new Error('No se puede crear Runtime: session.releaseId no coincide con release.id.');
    }

    const mission = resolveMissionFromReleaseAndSession(release, session);
    const sessionSnapshot = createRuntimeSessionSnapshot(session);
    const state = {
      status: 'initialized',
      errors: []
    };

    const runtime = {
      session: sessionSnapshot,
      mission,
      state
    };

    validateRuntime(runtime);
    return runtime;
  }

  registerDomainModule('runtimeCore', {
    createRuntime,
    validateRuntime
  });
})();
