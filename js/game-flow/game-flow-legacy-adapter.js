import { executeGameFlow } from './game-flow-core.js';
import { createPlayerStateResult } from '../player-state/player-state-result-model.js';
import { createRuntimeResult } from '../runtime/runtime-result-model.js';

function isObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function validateDependencies(dependencies) {
  const required = [
    'applyPlayerEvaluation',
    'updateProgress',
    'rebuildRuntime',
    'resolveNavigation'
  ];

  if (!isObject(dependencies)
    || !required.every(name => typeof dependencies[name] === 'function')) {
    throw new TypeError('Legacy Game Flow dependencies are invalid.');
  }
}

export function createLegacyGameFlowAdapter(dependencies) {
  validateDependencies(dependencies);

  return Object.freeze({
    execute(command) {
      const ports = {
        playerState: {
          applyEvaluation(args) {
            const state = dependencies.applyPlayerEvaluation({
              evaluation: args.evaluation,
              session: args.session,
              mission: args.mission,
              campaign: args.campaign
            });

            return createPlayerStateResult(state);
          }
        },
        progress: {
          update(args) {
            const result = dependencies.updateProgress({
              evaluation: args.evaluation,
              playerState: args.playerState,
              session: args.session,
              mission: args.mission,
              campaign: args.campaign
            });

            return {
              status: 'PROGRESS_UPDATED',
              campaignCompleted: result.campaignCompleted,
              progress: result.progress
            };
          }
        },
        runtime: {
          rebuild(args) {
            const runtime = dependencies.rebuildRuntime({
              evaluation: args.evaluation,
              playerState: args.playerState,
              progress: args.progress,
              session: args.session,
              mission: args.mission,
              campaign: args.campaign
            });

            return createRuntimeResult(runtime);
          }
        },
        navigation: {
          resolve(args) {
            const navigation = dependencies.resolveNavigation({
              evaluation: args.evaluation,
              playerState: args.playerState,
              progress: args.progress,
              runtime: args.runtime,
              session: args.session,
              mission: args.mission,
              campaign: args.campaign
            });

            return {
              status: 'NAVIGATION_RESOLVED',
              action: navigation.action,
              target: navigation.target
            };
          }
        }
      };

      return executeGameFlow(command, ports);
    }
  });
}