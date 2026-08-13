# A4-001D — LiveRoom browser infrastructure

## Purpose

A4-001D composes the already validated LiveRoom model, remote contract and remote client in both browser surfaces without starting or joining any room automatically.

## Browser surfaces

Both Runtime (`index.html`) and Studio (`studio/index.html`) load, in order:

1. `js/config.js`
2. `js/live-room/live-room-model.js`
3. `js/live-room/remote/live-room-contract.js`
4. `js/live-room/remote/live-room-client.js`
5. `js/live-room/remote/live-room-browser-bootstrap.js`

The bootstrap publishes `window.CRIOS_LIVE_ROOM_BROWSER`, an immutable selection containing the model and a configured remote client when all dependencies are available.

## Endpoint ownership

LiveRoom currently shares the same deployed Apps Script service as immutable publication. The browser bootstrap therefore derives its endpoint and timeout from the existing `CRIOS_CONFIG.publicationEndpoint` and `CRIOS_CONFIG.publicationTimeoutMs` values. No second endpoint constant is introduced, avoiding configuration drift while both APIs share one deployment.

## Side-effect boundary

Composition performs no network request, does not create a room, does not join a participant, does not start a heartbeat and does not write a capability. Those effects require an explicit future host/player controller action.

## Security boundary

No teacher key, room capability or other secret appears in HTML or global configuration. Participant capabilities remain generated only when create/join is explicitly requested and continue to be stored by the client in `sessionStorage` for that browser session.

## Failure behavior

Missing or invalid configuration and missing/invalid LiveRoom modules fail closed through an immutable bootstrap error. Existing Runtime and Studio behavior remains independent until dedicated LiveRoom controllers are added.

## Non-goals

A4-001D does not add:

- host UI;
- player join UI;
- room identifiers to URLs;
- automatic heartbeat scheduling;
- session expiration UI;
- synchronization of game progress;
- any backend change.

The next tranche may introduce explicit host/player controllers on top of this composed browser boundary.
