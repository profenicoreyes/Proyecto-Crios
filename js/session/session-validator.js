/* CRIOS Domain — session validator */
(function(){
  'use strict';

  function validateStudentSession(session) {
    const domain = window.CRIOS_DOMAIN || {};
    const sessionModel = domain.sessionModel;

    if (!sessionModel) {
      throw new Error('Student Session inválida: SessionModel no disponible.');
    }

    const expectedRootKeys = [
      'sessionId',
      'releaseId',
      'startedAt',
      'status',
      'currentMissionIndex',
      'lives',
      'progress',
      'answers'
    ];

    if (!session || typeof session !== 'object' || Array.isArray(session)) {
      throw new Error('Student Session inválida: debe ser un objeto.');
    }

    const sessionKeys = Object.keys(session);
    const missingRootKeys = expectedRootKeys.filter(key => !Object.prototype.hasOwnProperty.call(session, key));
    if (missingRootKeys.length > 0) {
      throw new Error('Student Session inválida: falta(n) campo(s) obligatorio(s): ' + missingRootKeys.join(', ') + '.');
    }

    const extraRootKeys = sessionKeys.filter(key => !expectedRootKeys.includes(key));
    if (extraRootKeys.length > 0) {
      throw new Error('Student Session inválida: contiene campo(s) no permitido(s): ' + extraRootKeys.join(', ') + '.');
    }

    if (session.sessionId === null || session.sessionId === undefined || String(session.sessionId).trim() === '') {
      throw new Error('Student Session inválida: sessionId es obligatorio.');
    }

    if (session.releaseId === null || session.releaseId === undefined || String(session.releaseId).trim() === '') {
      throw new Error('Student Session inválida: releaseId es obligatorio.');
    }

    const startedAt = String(session.startedAt || '').trim();
    if (startedAt === '' || Number.isNaN(Date.parse(startedAt))) {
      throw new Error('Student Session inválida: startedAt debe ser una fecha ISO válida.');
    }
    if (new Date(startedAt).toISOString() !== startedAt) {
      throw new Error('Student Session inválida: startedAt debe estar en formato ISO canónico.');
    }

    if (!sessionModel.isAllowedStatus(session.status)) {
      throw new Error('Student Session inválida: status no permitido. Valores válidos: running, finished, gameOver.');
    }

    if (!Number.isInteger(session.currentMissionIndex) || session.currentMissionIndex < 0) {
      throw new Error('Student Session inválida: currentMissionIndex debe ser entero no negativo.');
    }

    if (!Number.isInteger(session.lives) || session.lives < 0) {
      throw new Error('Student Session inválida: lives debe ser entero no negativo.');
    }

    if (!session.progress || typeof session.progress !== 'object' || Array.isArray(session.progress)) {
      throw new Error('Student Session inválida: progress debe ser un objeto.');
    }

    const expectedProgressKeys = ['completedMissionIds', 'currentMissionId'];
    const progressKeys = Object.keys(session.progress);
    const missingProgressKeys = expectedProgressKeys.filter(key => !Object.prototype.hasOwnProperty.call(session.progress, key));
    if (missingProgressKeys.length > 0) {
      throw new Error('Student Session inválida: progress falta(n) campo(s) obligatorio(s): ' + missingProgressKeys.join(', ') + '.');
    }

    const extraProgressKeys = progressKeys.filter(key => !expectedProgressKeys.includes(key));
    if (extraProgressKeys.length > 0) {
      throw new Error('Student Session inválida: progress contiene campo(s) no permitido(s): ' + extraProgressKeys.join(', ') + '.');
    }

    if (!Array.isArray(session.progress.completedMissionIds)) {
      throw new Error('Student Session inválida: progress.completedMissionIds debe ser un arreglo.');
    }

    if (session.progress.currentMissionId === null || session.progress.currentMissionId === undefined || String(session.progress.currentMissionId).trim() === '') {
      throw new Error('Student Session inválida: progress.currentMissionId es obligatorio.');
    }

    if (!Array.isArray(session.answers)) {
      throw new Error('Student Session inválida: answers debe ser un arreglo.');
    }
  }

  window.CRIOS_DOMAIN = window.CRIOS_DOMAIN || {};
  window.CRIOS_DOMAIN.sessionValidator = {
    validateStudentSession
  };
})();
