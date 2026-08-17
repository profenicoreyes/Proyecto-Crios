# A4 — LiveRoom presence synchronization backend

## Goal

Introduce the first shared state observed between host and players without turning local gameplay state into remote authority.

A4-003A synchronizes **presence only**. It deliberately does not synchronize `sessionData`, `sessionStats`, mission progress, lives, answers, navigation or the existing `StudentSession`.

## Why presence is first

The current Runtime has several local representations of gameplay/session progress. Publishing any of those as a second writable source of truth would increase inconsistency risk. Presence is already owned by `LiveRoom`, so it can be exposed safely before gameplay synchronization.

## Remote operation

`getLiveRoomRoster`

Payload:

- `roomId`
- `participantId`
- `capabilityToken`

The caller must be the registered `host` for that room and must prove the host capability. A player receives `HOST_REQUIRED`.

The existing public `getLiveRoom` operation remains unchanged and does not expose the roster.

## Snapshot

The host-only response contains:

- room snapshot;
- server `generatedAt`;
- registered participant count;
- active participant count;
- active player count;
- whether the host is currently connected;
- participant snapshots with internal `participantId`, role, join time, last-seen time and `connected` flag.

No capability token or capability hash is returned.

## Presence semantics

A participant is connected when the server clock is **at or before** `lastSeenAt + 600000 ms`.

- exactly 10 minutes: connected;
- more than 10 minutes: disconnected.

Room expiration remains separate and unchanged: the room expires when more than 10 minutes pass without valid activity from any host/player.

## Read-only rule

Reading the roster:

- does not update participant `lastSeenAt`;
- does not update room `lastActivityAt`;
- does not extend `expiresAt`;
- does not create idempotency/request records;
- cannot reactivate an expired room.

Only create, join and valid heartbeat remain liveness activity.

## Security boundary

Roster access is host-only. The public room preflight stays minimal. Internal participant IDs are correlation identifiers, not user credentials and are not displayed as student identity by this backend contract.

## Deferred

A4-003A does not add:

- Studio polling/UI;
- player-visible roster;
- student names/groups;
- mission/progress reporting;
- host control of student gameplay;
- shared navigation or shared answers.

The next slice wires the authenticated roster client into Studio and displays live participant counts without changing Runtime gameplay ownership.
