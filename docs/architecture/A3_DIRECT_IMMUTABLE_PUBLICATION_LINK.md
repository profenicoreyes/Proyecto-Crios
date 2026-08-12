# A3-003B7B — Direct immutable publication links

## Purpose

This document records the architecture and rollback boundary for A3-003B7B.
It is permanent project documentation. Temporary runners, transport ZIPs and validation outputs are disposable.

## Product decision

A shared CRIOS link identifies one exact immutable publication by:

- `campaignId`
- `publicationId`

Opening that link must not depend on mutable "active publication" state.

Publishing a later version, activating another version, or deactivating the legacy active reference must not invalidate an already shared immutable link.

## Scope of B7B

B7B changes the remote read boundary only.

The legacy activation/deactivation write model remains temporarily available for compatibility and will be removed from the normal Studio flow in a later tranche.

The Apps Script `getPublication` path now:

1. resolves the requested `publicationId` directly;
2. verifies stored content integrity;
3. verifies that the stored publication belongs to the requested `campaignId`;
4. returns that exact immutable publication independently of `CRIOS_PUBLICACION_ACTIVAS`.

Protocol `1.0` is intentionally preserved in this tranche.

The response temporarily retains `activeReference` for compatibility with the deployed Runtime/client contract, but after B7B that field is only a projection derived from the requested immutable publication. It is not evidence that the publication is currently active.

## Files touched

Production:

- `backend/google-apps-script/PublicationBackend.gs`
- `js/runtime/publication/runtime-remote-publication-readers.js`

Regression:

- `tests/remote-publication-backend-node.test.js`

Permanent documentation:

- `docs/architecture/A3_DIRECT_IMMUTABLE_PUBLICATION_LINK.md`

## Guarantees added

- an immutable publication can be read before activation;
- activating another publication does not invalidate an older shared link;
- deactivating legacy active state does not invalidate the immutable link;
- an unknown publication remains unavailable;
- campaign/publication mismatch remains unavailable;
- corrupt stored content remains unavailable;
- public GET remains secret-free and read-only.

## Explicit non-goals

B7B does not yet:

- remove activation/deactivation endpoints;
- remove activation UI from Studio;
- remove teacher write authorization;
- enable anonymous publishing;
- introduce multiplayer presence;
- introduce the 10-minute session TTL;
- remove legacy `activeReference` naming from the protocol.

## Rollback

Before commit, restore the three pre-B7B files stored in the external rollback folder and remove this document.

After commit, revert the B7B commit as one unit.

No publication data migration is required because B7B modifies read semantics only.

The currently verified external recovery bundle predates the uncommitted B6/B7 work and must remain until the combined tranche is committed and a replacement verified bundle exists.

## Commit and bundle

At document creation time:

- commit: pending;
- replacement bundle: pending.
