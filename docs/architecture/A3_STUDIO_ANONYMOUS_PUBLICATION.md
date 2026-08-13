# A3-003B7D2 — Studio anonymous publication client

## Purpose

B7D2 removes the teacher-key prompt and credential transport from the normal CRIOS Studio publication path after the B7D1 create-only backend was deployed and validated by a live remote smoke.

## Product flow

The normal teacher flow is now:

1. create or edit a campaign in Studio;
2. publish;
3. receive the immutable publication link;
4. share that link.

No activation step and no teacher publication key are required.

## Client boundary

The remote publication client sends publish requests as:

`{ request }`

It does not read, request, store or transmit `writeToken` or `writeTokenProvider`.

The deployment bridge configures Runtime and Studio with only:

- `endpoint`
- `timeoutMs`

`studio-write-auth.js` is removed and Studio no longer loads it.

The Studio bootstrap rejects stale authorization configuration (`writeToken` or `writeTokenProvider`) instead of silently restoring the old credential model.

## Server boundary

This client change depends on the already deployed B7D1 backend.

The backend remains responsible for:

- accepting only supported create/read operations;
- server-generated publication identity;
- immutable publication storage;
- publication validation and SHA-256 verification;
- 524288-byte content limit;
- anonymous new-write rate limit of 30 per 60 seconds;
- storage ceiling of 5000 publications;
- idempotent replay handling;
- rejecting retired mutable operations.

The client does not treat anonymity as permission to mutate an existing publication.

## Compatibility

The B7D1 backend temporarily accepts the former `{ request, writeToken }` envelope so deployment could happen before B7D2. After B7D2 the current client emits `{ request }` only.

The wire error vocabulary may temporarily retain `WRITE_UNAUTHORIZED` so a mismatched older backend response remains parseable. The current B7D1/B7D2 path does not require or emit teacher authorization for normal publication.

## Files removed

- `js/studio/publication/studio-write-auth.js`
- `tests/studio-write-auth-node.test.js`

## Validation

B7D2 must prove:

- Studio loads no teacher authorization module;
- deployed Studio configuration contains no credential provider;
- bootstrap forwards no credential fields to the client;
- anonymous publish sends exactly `{ request }`;
- stale credential configuration is rejected;
- direct immutable GET remains unchanged;
- all Node suites and browserless regression remain green.

## Rollback

Before commit, restore the B7D2 file-level rollback package. This returns Studio/client credential behavior while leaving the already deployed B7D1 backend compatible with both envelope shapes.

After commit, revert B7D2 as one unit if necessary. No publication data migration is required.
