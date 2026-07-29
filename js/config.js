/*
 * CRIOS OS — Configuración central
 * Cambios de versión, conexión y claves de almacenamiento se realizan aquí.
 */
'use strict';

const CRIOS_CONFIG = Object.freeze({
  version: '1.25',
  runtimeCampaignMode: 'legacy',
  resultsEndpoint: 'https://script.google.com/macros/s/AKfycbwnoHvlD8xAtDHhcymZxfrt9TlKSx86F-sAECTfj1Y8mAOYDbtnFCLfKPeUVxzr8bwEyA/exec',
  variantCount: 36,
  progressSendDelayMs: 250,
  missionReturnDelayMs: 1400,
  finalTransitionDelayMs: 1700,
  designViewport: Object.freeze({ width: 1366, height: 768 }),
  storage: Object.freeze({
    progress: 'crios-progress-v2',
    complete: 'crios-complete-v2',
    realName: 'crios-user-name',
    characterName: 'crios-character-name',
    groupName: 'crios-group-name',
    sessionStats: 'crios-session-stats',
    sessionData: 'crios-session-data',
    pendingResult: 'crios-pending-result',
    campaignId: 'crios-campana-activa',
    campaignProgress: 'crios-progreso-campanas-v1'
  })
});
