/* CRIOS Domain — navigation core */
(function(){
  'use strict';

  const registerDomainModule = window.__CRIOS_REGISTER_DOMAIN_MODULE__;
  if (typeof registerDomainModule !== 'function') {
    throw new Error('No se pudo registrar NavigationCore: registrador de composición no disponible.');
  }

  function getReleaseValidator() {
    const domain = window.CRIOS_DOMAIN || {};
    const releaseValidator = domain.releaseValidator;
    if (!releaseValidator || typeof releaseValidator.validateReleaseStructure !== 'function') {
      throw new Error('Navigation inválida: ReleaseValidator no disponible.');
    }
    return releaseValidator.validateReleaseStructure;
  }

  function getRuntimeValidator() {
    const domain = window.CRIOS_DOMAIN || {};
    const runtimeCore = domain.runtimeCore;
    if (!runtimeCore || typeof runtimeCore.validateRuntime !== 'function') {
      throw new Error('Navigation inválida: RuntimeCore no disponible.');
    }
    return runtimeCore.validateRuntime;
  }

  function getReleaseModel() {
    const domain = window.CRIOS_DOMAIN || {};
    const releaseModel = domain.releaseModel;
    if (!releaseModel || typeof releaseModel.deepFreeze !== 'function') {
      throw new Error('Navigation inválida: ReleaseModel no disponible.');
    }
    return releaseModel;
  }

  function assertMissionId(id, contextMessage) {
    if (typeof id !== 'string' || id.trim() === '') {
      throw new Error(contextMessage);
    }
  }

  function findMissionById(missions, id) {
    return missions.find(mission => mission && mission.id === id) || null;
  }

  function createNavigation(runtime, release) {
    const validateRuntime = getRuntimeValidator();
    const validateReleaseStructure = getReleaseValidator();
    const releaseModel = getReleaseModel();

    validateRuntime(runtime);
    validateReleaseStructure(release);

    if (runtime.session.releaseId !== release.id) {
      throw new Error('No se puede crear Navigation: Runtime no pertenece al Campaign Release recibido.');
    }

    const missions = Array.isArray(release.missions) ? release.missions : [];
    if (missions.length === 0) {
      throw new Error('No se puede crear Navigation: el Campaign Release no contiene misiones.');
    }

    const currentMissionIndex = runtime.session.currentMissionIndex;
    if (!Number.isInteger(currentMissionIndex) || currentMissionIndex < 0) {
      throw new Error('No se puede crear Navigation: currentMissionIndex debe ser un entero no negativo.');
    }

    if (currentMissionIndex >= missions.length) {
      throw new Error('No se puede crear Navigation: currentMissionIndex está fuera de rango.');
    }

    const missionByIndex = missions[currentMissionIndex];
    if (!missionByIndex || typeof missionByIndex !== 'object' || Array.isArray(missionByIndex)) {
      throw new Error('No se puede crear Navigation: la misión actual del índice no es válida.');
    }

    assertMissionId(
      missionByIndex.id,
      'No se puede crear Navigation: la misión actual del índice no tiene id válido.'
    );

    const runtimeMissionId = runtime && runtime.mission ? runtime.mission.id : null;
    assertMissionId(
      runtimeMissionId,
      'No se puede crear Navigation: Runtime no contiene mission.id válido.'
    );

    const sessionMissionId = runtime && runtime.session && runtime.session.progress
      ? runtime.session.progress.currentMissionId
      : null;
    assertMissionId(
      sessionMissionId,
      'No se puede crear Navigation: Runtime no contiene progress.currentMissionId válido.'
    );

    const missionBySessionId = findMissionById(missions, sessionMissionId);
    if (!missionBySessionId || typeof missionBySessionId !== 'object' || Array.isArray(missionBySessionId)) {
      throw new Error('No se puede crear Navigation: currentMissionId no existe en el Campaign Release.');
    }

    if (runtimeMissionId !== sessionMissionId || missionByIndex.id !== runtimeMissionId || missionByIndex.id !== missionBySessionId.id) {
      throw new Error('No se puede crear Navigation: Runtime y Campaign Release no son coherentes en la misión actual.');
    }

    const previousMission = currentMissionIndex > 0 ? missions[currentMissionIndex - 1] : null;
    const nextMission = currentMissionIndex < (missions.length - 1) ? missions[currentMissionIndex + 1] : null;

    if (previousMission) {
      assertMissionId(
        previousMission.id,
        'No se puede crear Navigation: la misión anterior no tiene id válido.'
      );
    }

    if (nextMission) {
      assertMissionId(
        nextMission.id,
        'No se puede crear Navigation: la misión siguiente no tiene id válido.'
      );
    }

    const navigation = {
      currentMissionId: runtimeMissionId,
      currentMissionIndex,
      previousMissionId: previousMission ? previousMission.id : null,
      nextMissionId: nextMission ? nextMission.id : null,
      hasPrevious: previousMission !== null,
      hasNext: nextMission !== null,
      isFinished: nextMission === null
    };

    validateNavigation(navigation);
    return releaseModel.deepFreeze(navigation);
  }

  function validateNavigation(navigation) {
    const expectedRootKeys = [
      'currentMissionId',
      'currentMissionIndex',
      'previousMissionId',
      'nextMissionId',
      'hasPrevious',
      'hasNext',
      'isFinished'
    ];

    if (!navigation || typeof navigation !== 'object' || Array.isArray(navigation)) {
      throw new Error('Navigation inválida: debe ser un objeto.');
    }

    const keys = Object.keys(navigation);
    const missingKeys = expectedRootKeys.filter(key => !Object.prototype.hasOwnProperty.call(navigation, key));
    if (missingKeys.length > 0) {
      throw new Error('Navigation inválida: falta(n) campo(s) obligatorio(s): ' + missingKeys.join(', ') + '.');
    }

    const extraKeys = keys.filter(key => !expectedRootKeys.includes(key));
    if (extraKeys.length > 0) {
      throw new Error('Navigation inválida: contiene campo(s) no permitido(s): ' + extraKeys.join(', ') + '.');
    }

    assertMissionId(
      navigation.currentMissionId,
      'Navigation inválida: currentMissionId debe ser una cadena no vacía.'
    );

    if (!Number.isInteger(navigation.currentMissionIndex) || navigation.currentMissionIndex < 0) {
      throw new Error('Navigation inválida: currentMissionIndex debe ser un entero no negativo.');
    }

    if (navigation.previousMissionId !== null) {
      assertMissionId(
        navigation.previousMissionId,
        'Navigation inválida: previousMissionId debe ser null o una cadena no vacía.'
      );
    }

    if (navigation.nextMissionId !== null) {
      assertMissionId(
        navigation.nextMissionId,
        'Navigation inválida: nextMissionId debe ser null o una cadena no vacía.'
      );
    }

    if (typeof navigation.hasPrevious !== 'boolean') {
      throw new Error('Navigation inválida: hasPrevious debe ser booleano.');
    }

    if (typeof navigation.hasNext !== 'boolean') {
      throw new Error('Navigation inválida: hasNext debe ser booleano.');
    }

    if (typeof navigation.isFinished !== 'boolean') {
      throw new Error('Navigation inválida: isFinished debe ser booleano.');
    }

    if (navigation.hasPrevious !== (navigation.previousMissionId !== null)) {
      throw new Error('Navigation inválida: incoherencia entre previousMissionId y hasPrevious.');
    }

    if (navigation.hasNext !== (navigation.nextMissionId !== null)) {
      throw new Error('Navigation inválida: incoherencia entre nextMissionId y hasNext.');
    }

    if (navigation.isFinished !== !navigation.hasNext) {
      throw new Error('Navigation inválida: incoherencia entre hasNext e isFinished.');
    }
  }

  function getCurrentMission(runtime, release) {
    const navigation = createNavigation(runtime, release);
    const mission = release.missions[navigation.currentMissionIndex] || null;
    return mission;
  }

  function hasNextMission(runtime, release) {
    const navigation = createNavigation(runtime, release);
    return navigation.hasNext;
  }

  function getNextMission(runtime, release) {
    const navigation = createNavigation(runtime, release);
    if (navigation.nextMissionId === null) return null;

    const missions = Array.isArray(release && release.missions) ? release.missions : [];
    const mission = findMissionById(missions, navigation.nextMissionId);
    if (!mission || typeof mission !== 'object' || Array.isArray(mission)) {
      throw new Error('Navigation inválida: la misión siguiente no existe en el Campaign Release.');
    }
    return mission;
  }

  function isFinished(runtime, release) {
    const navigation = createNavigation(runtime, release);
    return navigation.isFinished;
  }

  registerDomainModule('navigationCore', {
    createNavigation,
    validateNavigation,
    getCurrentMission,
    hasNextMission,
    getNextMission,
    isFinished
  });
})();
