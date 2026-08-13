# A4-001A — Live Room boundary and lifecycle contract

## Purpose

CRIOS needs a remote, ephemeral multiplayer room without reusing or mutating the existing local `StudentSession`.

This tranche defines the naming boundary and the pure lifecycle rules only. It does not add network traffic, shared persistence, UI, heartbeat timers or multiplayer progress synchronization.

## Audit finding

The current code already uses the word session for several different things:

1. `js/session/*` defines `StudentSession`, the per-player domain state used by Runtime and PlayerState. It owns `sessionId`, `releaseId`, lives, current mission, progress and answers.
2. `js/crios.js` keeps legacy local gameplay/session structures such as `sessionData`, `sessionStats` and sessionStorage-backed progress.
3. `backend/google-apps-script/Code.gs` receives `idSesion` to create/update result rows sent by a learner.

None of those structures represents a shared host/player room. No current audited path defines remote room membership, host/player presence, heartbeat or the 10-minute room-expiry rule.

Therefore the multiplayer feature must use a distinct concept and namespace: **LiveRoom**.

## Vocabulary

### Publication

Persistent immutable content identified by:

- `campaignId`
- `publicationId`

A publication does not expire when a room expires.

### StudentSession

Existing per-player gameplay/domain state.

It remains responsible for lives, mission position, answers and local player progress. A LiveRoom must not absorb or rename this object.

### Legacy result session (`idSesion`)

Existing identifier used by the result-submission backend. It remains separate from LiveRoom identity.

### LiveRoom

New remote ephemeral container associated with exactly one immutable publication.

The first canonical room record is:

- `roomId`
- `campaignId`
- `publicationId`
- `createdAt`
- `lastActivityAt`
- `expiresAt`
- `status`

`status` is `active` or `expired`.

The room snapshot contains no teacher key, host capability, player capability or other secret.

### LiveRoomPresence

Presence is a separate record:

- `roomId`
- `participantId`
- `role`
- `joinedAt`
- `lastSeenAt`

Allowed roles are exactly:

- `host`
- `player`

This separation prevents host/player presence from being confused with StudentSession gameplay state.

## Lifecycle rule

The inactivity timeout is exactly:

`600000 ms`

A room remains logically active at exactly ten minutes since `lastActivityAt` and is expired once server time is **more than** ten minutes past that activity.

Every accepted host/player presence activity may advance `lastActivityAt`. Time must never move backwards.

An expired room cannot be reactivated. Starting again from the same publication requires creating a new room.

The user-facing expired-room message is:

`Esta sesión finalizó por inactividad.`

## Logical expiry vs physical cleanup

User-visible expiry and physical storage deletion are different concerns.

The future backend must enforce logical expiry synchronously on every room operation using server time. Therefore an expired room is inaccessible immediately even if its stored rows have not yet been physically removed.

A later scheduled cleanup may delete expired rows. Cleanup latency must never extend the logical lifetime of a room.

This distinction allows Apps Script scheduling to be eventual without weakening the ten-minute product rule.

## Future remote storage boundary

The recommended normalized storage is separate from publication tables:

### `CRIOS_LIVE_ROOMS`

Room lifecycle and immutable publication reference.

### `CRIOS_LIVE_PRESENCE`

Host/player presence and `lastSeenAt`.

### `CRIOS_LIVE_STATE`

Future shared ephemeral gameplay state, revisioned independently from local StudentSession.

Capability material, if required, must not be exposed in public room snapshots and should be stored only as server-verifiable hashes or equivalent protected data.

## Future operation boundary

The next backend tranche may introduce only room-scoped operations such as:

- create room from `campaignId + publicationId`;
- join room;
- heartbeat/presence refresh;
- read room state;
- leave room.

Any operation must reject an expired room before mutation.

Room operations must not:

- mutate a publication;
- delete a publication;
- reuse publication activation;
- overwrite StudentSession;
- reuse legacy `idSesion` as `roomId`.

## Progress boundary

Shared multiplayer progress is intentionally not implemented in A4-001A.

When introduced, it belongs to a room-scoped, revisioned ephemeral state. It must not silently replace the current StudentSession or legacy local progress until an explicit integration contract is validated.

## Security boundary

Because CRIOS does not require user accounts for the normal publication flow, room authorization must be capability-based or otherwise server-verifiable when host/player privileges are introduced.

The public `roomId` alone must not become an authority to perform host-only mutations.

The exact token/capability design is deferred to the backend tranche so it can be validated against the real transport and Apps Script storage model.

## A4-001A implementation

Production-independent pure model:

- `js/live-room/live-room-model.js`

Focal regression:

- `tests/live-room-model-node.test.js`

The model establishes:

- strict separation from StudentSession;
- exact 10-minute idle timeout;
- immutable value records;
- canonical ISO timestamps;
- monotonic activity clocks;
- host/player presence roles;
- no reactivation after expiry;
- no secrets in the canonical room shape.

## Non-goals

A4-001A does not:

- load the model from Runtime or Studio;
- create a room remotely;
- add UI;
- add heartbeat timers;
- deploy Apps Script changes;
- synchronize multiplayer progress;
- delete existing legacy session or result code;
- physically clean expired data.

## Next tranche

`A4-001B` should implement the remote LiveRoom backend contract and storage, including server-generated identities, participant capabilities, presence updates and logically exact expiry before any UI wiring.
