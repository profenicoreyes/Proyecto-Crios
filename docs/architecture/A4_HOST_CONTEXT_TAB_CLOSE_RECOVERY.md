# A4 — Recuperación del anfitrión tras cerrar la pestaña

## Problema observado
La consola guardaba el contexto del anfitrión y su capability únicamente en `sessionStorage`. Al cerrar completamente la pestaña esos datos desaparecían. Volver a abrir `/host/` mostraba `Sin contexto` y deshabilitaba `Compartir`.

## Decisión
El anfitrión debe poder cerrar y reabrir la consola en el mismo navegador mientras la LiveRoom siga válida, sin poner secretos en la URL.

- El contexto del host se persiste en `localStorage` y se refleja en `sessionStorage`.
- La capability creada por `createLiveRoom` se persiste en `localStorage` y se refleja en `sessionStorage`.
- Las capabilities de jugadores creadas por `joinLiveRoom` siguen siendo exclusivamente de sesión.
- Una pestaña nueva puede recuperar el contexto y la capability del host desde `localStorage`.
- Al expirar la sala o producirse un error fatal de autorización se limpian ambas copias.
- `roomId`, `campaignId` y `publicationId` pueden estar en la URL; `participantId` y capability nunca.

## Límite
Una capability que ya se perdió antes de aplicar este cambio no se puede reconstruir: el backend conserva únicamente su hash. Para validar este cambio hay que crear una sala nueva una vez.

## Sin cambios
No cambia el backend, la regla de expiración de 10 minutos, el enlace del estudiante, el modal Compartir ni el polling transitorio.
