# A3-003B7C3A — Remote mutable activation retirement

## Purpose

This tranche removes mutable activation and deactivation from the remote backend path used by CRIOS while preserving direct immutable publication reads.

## Product rule

A shared CRIOS publication is addressed by `campaignId + publicationId` and remains readable independently of mutable active-state history.

Remote publication operations enabled after this tranche are:

- `publishPublication`
- `getPublication`

Legacy `activatePublication` and `deactivatePublication` requests are rejected with `UNSUPPORTED_OPERATION` before write authorization, locking, spreadsheet creation, or mutation.

## Transitional compatibility

The protocol constants and legacy activation implementation remain in source temporarily so that the retirement can be staged safely and reversibly. They are no longer reachable from the normal backend dispatcher.

The remote JavaScript contract/client still expose the legacy methods in this tranche. Their removal is the next sub-tranche after the server boundary is proven closed.

The `activeReference` field returned by `getPublication` remains a protocol-1.0 compatibility projection derived from the exact immutable publication. It does not represent mutable active state.

## Files changed

- `backend/google-apps-script/PublicationBackend.gs`
- `tests/remote-publication-backend-node.test.js`
- `docs/architecture/A3_REMOTE_MUTABLE_ACTIVATION_RETIREMENT.md`

## Guarantees

- remote activate is rejected;
- remote deactivate is rejected;
- retired mutable operations acquire no write lock;
- retired mutable operations create no activation sheets;
- direct immutable GET remains available for every exact publication;
- publish remains authorized and immutable;
- legacy results and groups endpoints remain unchanged.

## Non-goals

This tranche does not yet:

- remove legacy activation methods from the remote JS contract/client;
- delete legacy activation service/controller source files;
- remove the teacher write key from publishing;
- enable anonymous create-only publishing;
- change multiplayer/session lifetime behavior.

## Rollback

Before commit, restore the two changed tracked files from the external B7C3A rollback folder and remove this document.

After commit, revert the B7C3A commit as one unit.
