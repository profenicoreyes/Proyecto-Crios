# A4-002A — Studio LiveRoom host flow

## Scope

This slice adds the first visible LiveRoom interaction to CRIOS Studio without changing Runtime/player behavior.

## User flow

1. Studio keeps publication as the persistent source of truth.
2. When the latest immutable publication has a valid Runtime link, Studio shows **Iniciar partida**.
3. The button creates one ephemeral LiveRoom tied to the exact `campaignId + publicationId`.
4. The host identity is generated internally; the teacher does not type a key, password, token, or participant id.
5. The LiveRoom capability remains managed by the remote client in `sessionStorage`; the host UI context stores no capability or other secret.
6. Studio shows the generated room id and a student Runtime link containing the existing immutable publication identity plus `roomId`.
7. While the host Studio tab remains active, a heartbeat is sent every 2 minutes. Returning to a visible tab also sends a heartbeat.
8. Reloading the same Studio tab can restore the room because the non-secret room context and the client capability both live in `sessionStorage`.
9. A room that expires cannot be reactivated. Studio shows `Esta sesión finalizó por inactividad.` and a new game requires a new room.

## Deliberate non-goals

- No player join UI is added in this slice.
- Runtime does not yet consume `roomId`.
- No room stop/delete operation is introduced.
- Publication lifetime and immutable links remain unchanged.
- The existing `StudentSession` and legacy result `sessionId` remain separate concepts.
