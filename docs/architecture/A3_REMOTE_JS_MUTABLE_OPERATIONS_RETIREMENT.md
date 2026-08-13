# A3-003B7C3B — Remote JS mutable-operation retirement

## Purpose

Complete the client-side retirement of the legacy mutable activation path after B7C3A made the backend operations unreachable.

## Decision

The public remote publication JavaScript contract exposes only:

- `publishPublication`
- `getPublication`

`activatePublication` and `deactivatePublication` are no longer valid remote contract operations and the remote client no longer exposes methods for them.

## Scope

Production changes:

- `js/publication/remote/remote-publication-contract.js`
- `js/publication/remote/remote-publication-client.js`

Regression changes:

- `tests/remote-publication-backend-node.test.js`
- `tests/remote-publication-client-node.test.js`
- `tests/remote-publication-contract.test.js`
- `tests/studio-remote-activation-service-node.test.js`
- `tests/studio-remote-activation-wiring-node.test.js`

## Guarantees

- the remote JS contract rejects raw activate/deactivate requests as `UNSUPPORTED_OPERATION`;
- no activate/deactivate request builders are exported;
- the remote client exposes only publish and exact immutable read operations;
- direct immutable `campaignId + publicationId` reads remain supported;
- teacher write authorization remains attached only to the still-supported publish write path;
- the retired backend path remains unreachable before authorization, locking or activation storage;
- the legacy Studio activation implementation may remain on disk temporarily but cannot be reached through the normal Studio composition or the real remote client.

## Transitional compatibility

Protocol `1.0` still returns the legacy `activeReference` field on `getPublication`. After B7B this is a compatibility projection derived from the immutable publication, not mutable active state. Removing or renaming that field is intentionally outside B7C3B.

## Non-goals

B7C3B does not yet:

- delete the legacy activation implementation files;
- remove activation persistence schemas;
- remove teacher authorization from publishing;
- enable anonymous publication creation;
- change the remote protocol version;
- implement multiplayer session presence or the 10-minute session TTL.

## Rollback

Before commit, restore the B7C3B file-level backups and remove this document. B7C1, B7C2 and B7C3A remain untouched by that rollback.

After commit, revert the B7C3B commit or the combined B7C checkpoint as appropriate.
