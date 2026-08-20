'use strict';

const fs = require('fs');
const path = require('path');

const root = process.argv[2] || path.resolve(__dirname, '..');
const crios = fs.readFileSync(path.join(root, 'js/crios.js'), 'utf8');
const player = fs.readFileSync(path.join(root, 'js/runtime/live-room/runtime-live-room-player.js'), 'utf8');
const index = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const studio = fs.readFileSync(path.join(root, 'studio/index.html'), 'utf8');
const host = fs.readFileSync(path.join(root, 'host/index.html'), 'utf8');
let total = 0;
let failed = 0;

function ok(condition, label) {
  total += 1;
  if (!condition) {
    failed += 1;
    console.error('FAIL ' + label);
  }
}

function before(source, left, right, label) {
  const leftIndex = source.indexOf(left);
  const rightIndex = source.indexOf(right);
  ok(leftIndex >= 0 && rightIndex >= 0 && leftIndex < rightIndex, label);
}

const scripts = [
  'js/live-room/live-room-model.js',
  'js/live-room/live-room-game-state-model.js',
  'js/live-room/live-room-game-state-outbox.js',
  'js/live-room/live-room-game-state-reconciliation.js',
  'js/live-room/remote/live-room-contract.js',
  'js/live-room/remote/live-room-game-state-contract.js',
  'js/live-room/remote/live-room-client.js',
  'js/live-room/remote/live-room-game-state-client.js',
  'js/live-room/remote/live-room-browser-bootstrap.js',
  'js/live-room/realtime/live-room-realtime-transport.js',
  'js/live-room/realtime/firebase-live-room-realtime-provider.js',
  'js/crios.js',
  'js/runtime/live-room/runtime-live-room-game-state-coordinator.js',
  'js/runtime/live-room/runtime-live-room-player.js?v=20260819game-state'
];

scripts.forEach((script) => {
  ok(index.includes('<script src="' + script + '"></script>'), 'Runtime loads ' + script);
  ok((index.match(new RegExp(script.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g')) || []).length === 1,
    'Runtime loads once ' + script);
});
for (let position = 1; position < scripts.length; position += 1) {
  before(index, scripts[position - 1], scripts[position], 'Runtime script order ' + position);
}

ok(studio.includes('live-room-game-state-model.js'), 'Studio loads the pure game-state model for public mission-order validation');
[
  'live-room-game-state-outbox.js',
  'live-room-game-state-reconciliation.js',
  'live-room-game-state-contract.js',
  'live-room-game-state-client.js',
  'runtime-live-room-game-state-coordinator.js'
].forEach((name) => {
  ok(!studio.includes(name), 'Studio does not load game-state runtime integration ' + name);
});
[
  'live-room-game-state-model.js',
  'live-room-game-state-reconciliation.js',
  'live-room-game-state-contract.js',
  'live-room-game-state-client.js'
].forEach((name) => {
  ok(host.includes(name), 'host console loads read-only game-state dependency ' + name);
});
[
  'live-room-game-state-outbox.js',
  'runtime-live-room-game-state-coordinator.js'
].forEach((name) => {
  ok(!host.includes(name), 'host console does not load game-state write integration ' + name);
});

ok(crios.includes('let liveRoomSharedCompletedMissionIds = Object.freeze([]);'), 'shared progress has separate memory owner');
ok(crios.includes("model.validateGameState(gameState,missionIds)"), 'shared snapshot validated by pure model');
ok(crios.includes('gameState.campaignId!==requestedPublishedCampaignId'), 'shared campaign identity checked');
ok(crios.includes('gameState.publicationId!==requestedPublishedPublicationId'), 'shared publication identity checked');
ok(crios.includes('liveRoomSharedCompletedMissionIds=Object.freeze(gameState.completedMissionIds.slice());'), 'shared completed ids copied immutably');
ok(crios.includes('return Boolean(progress[missionId])||liveRoomSharedCompletedMissionIds.includes(missionId);'), 'effective projection is exact union');
ok(crios.includes('const isDone=isMissionEffectivelyCompleted(id);'), 'map uses effective projection');
ok(crios.includes('if(finalBtn) finalBtn.disabled=done<total;'), 'final protocol unlock follows effective count');
ok(crios.includes('applyLiveRoomSharedGameState,'), 'projection adapter exposed through frozen Runtime API');
ok(!crios.includes('writeJson(sessionStorage, STORAGE.progress, liveRoomSharedCompletedMissionIds)'), 'shared progress not persisted as local progress');
ok(!crios.includes('progresosCampanas[activeProgressKey()]={...liveRoomSharedCompletedMissionIds}'), 'shared progress not copied into campaign progress');
ok(!crios.includes('sessionData.liveRoomShared'), 'shared progress not copied into local session object');

const correctStart = crios.indexOf("if(isCorrect&&gameFlowResult&&gameFlowResult.status==='FLOW_COMPLETED'");
const incorrectStart = crios.indexOf("}else if(!isCorrect&&gameFlowResult", correctStart);
const correctBranch = crios.slice(correctStart, incorrectStart);
before(correctBranch, 'const statsPersisted=persistStats();', 'const progressPersisted=save();', 'personal stats persist before progress save');
before(correctBranch, 'const progressPersisted=save();', 'if(statsPersisted&&progressPersisted) recordCommittedLiveRoomMission(id);', 'remote event waits for both local writes');
before(correctBranch, 'recordCommittedLiveRoomMission(id);', "setTimeout(() => go('map')", 'remote event scheduled before navigation timer');
ok(crios.includes('return campaignSaved&&progressSaved&&sessionSaved;'), 'progress save reports every required local write');
ok(crios.includes('return statsSaved&&sessionSaved;'), 'stats save reports every required local write');
ok((crios.match(/recordCommittedLiveRoomMission\(id\);/g) || []).length === 1, 'one production post-commit hook');
ok(!crios.slice(incorrectStart, crios.indexOf("traceEvent('evaluation:submit:after'", incorrectStart)).includes('recordCommittedLiveRoomMission'), 'incorrect and game-over branches never enqueue completion');
before(crios, 'missionIds=prepared.data.missionOrder.slice();', 'synchronizeLiveRoomGameState();', 'mission order prepared before coordinator synchronization');

ok(player.includes("if (!Array.isArray(missionOrder) || !missionOrder.length) return null;"), 'player defers coordinator until mission order exists');
ok(player.includes('client.createGameStateClient(coordinatorContext)'), 'player obtains credential-bound sibling client');
ok(player.includes('gameStateCoordinatorFactory.createCoordinator({'), 'player composes dedicated coordinator');
ok(player.includes('recordCommittedMission:recordCommittedMission'), 'player exposes narrow post-commit port');
ok(player.includes('destroyGameStateCoordinator(true);'), 'terminal player context discards matching state context');
ok(player.includes('destroyGameStateCoordinator(false);'), 'normal teardown preserves reload outbox');
ok(!player.includes('capabilityToken'), 'player integration never handles capability token');

console.log('RUNTIME_LIVE_ROOM_GAME_STATE_PROJECTION_TEST_STATUS=' + (failed === 0 ? 'PASS' : 'FAIL'));
console.log('RUNTIME_LIVE_ROOM_GAME_STATE_PROJECTION_TEST_TOTAL=' + total);
console.log('RUNTIME_LIVE_ROOM_GAME_STATE_PROJECTION_TEST_FAILED=' + failed);
process.exit(failed === 0 ? 0 : 1);
