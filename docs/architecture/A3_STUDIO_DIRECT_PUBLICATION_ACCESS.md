# A3-003B7C1 — Studio direct immutable publication access

## Purpose

Studio must expose the exact immutable publication link immediately after a successful publication. Access to Runtime must not depend on activation state or local activation persistence.

## Product rule

The latest publication known to the current Studio campaign is the default publication offered by the main **Abrir campaña en CRIOS** action.

The link is built exclusively from:

- `campaignId`
- `publicationId`

Activation, deactivation and local `activeReference` state do not participate in link generation.

## Scope

This tranche changes only the Studio launch boundary:

- `js/studio/publication/studio-runtime-launch.js`
- `js/studio/studio.js`
- `js/studio/render/studio-renderer.js`
- `tests/published-launch-identity-node.test.js`
- `tests/studio-runtime-launch.test.js`

Activation services and UI remain temporarily present so their removal can be performed and validated independently in B7C2.

## Guarantees

- a valid publication produces a Runtime link without activation;
- local persistence availability does not gate the immutable remote link;
- activation busy state does not gate the immutable remote link;
- invalid campaign/publication identifiers still fail closed through the Runtime launch contract;
- publishing a later version causes Studio's main action to point to that newer publication, while older links remain valid by B7B.

## Rollback

Before commit, restore the five pre-B7C1 code/test files and remove this document.

After commit, revert the B7C1 commit as one unit.

No remote publication data migration is required.
