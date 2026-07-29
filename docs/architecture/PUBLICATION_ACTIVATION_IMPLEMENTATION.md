# CRIOS Publication Activation Implementation

## 1. Propósito

Implementar una capa determinista que seleccione, desactive, revierta y resuelva publicaciones sin modificar el núcleo de publicación ni conectar Runtime. La activación selecciona una `PublishedCampaign` existente; nunca publica contenido nuevo.

## 2. Alcance

El alcance comprende una API global independiente, modelos inmutables, store privado en memoria, servicio verificable por hash, integración anidada con Studio, panel de control y pruebas de navegador. Publicaciones, referencias activas e historial desaparecen al recargar.

## 3. Arquitectura

`CRIOS_PUBLICATION_CORE` conserva publicaciones y records. `CRIOS_PUBLICATION_ACTIVATION` conserva referencias e historial en stores creados por fábrica. `CRIOS_STUDIO.publication` valida y publica; `CRIOS_STUDIO.activation` controla una instancia de activación por sesión. Runtime no consume ninguna de estas referencias.

## 4. Archivos

El subsistema usa cuatro módulos bajo `js/publication/activation/`, un controlador bajo `js/studio/publication/`, una suite HTML/JS y este informe. La integración modifica únicamente las páginas reales, el bootstrap, el renderer y el CSS autorizado.

## 5. Modelos

`ActivePublicationReference` contiene exactamente `campaignId`, `publicationId`, `version`, `contentHash` y `activatedAt`. `ActivationRecord` contiene exactamente `activationId`, `action`, `campaignId`, `previousPublicationId`, `nextPublicationId` y `occurredAt`. `ActivationResult` contiene exactamente `success`, `changed`, `reference`, `publication`, `record` y `error`. Todos son copias profundamente congeladas.

## 6. API de activación

`window.CRIOS_PUBLICATION_ACTIVATION`, versión `1.0.0`, expone exactamente `version`, `constants`, `createInMemoryActivationStore`, `createActivationService`, `isActivePublicationReference` e `isActivationResult`. La API y sus constantes están profundamente congeladas y el namespace temporal se elimina al terminar la carga.

## 7. Store en memoria

Cada llamada a `createInMemoryActivationStore()` crea cierres y colecciones independientes. El estado privado guarda una referencia por campaña, historial append-only e identificadores utilizados. Las lecturas y snapshots son copias congeladas. No existe singleton ni persistencia.

## 8. Servicio

El servicio recibe lectores públicos de publicación, canonicalizador, calculador SHA-256 y dependencias opcionales de store, reloj e identificadores. Expone activar, desactivar, rollback, consulta, resolución, historial y snapshot sin exponer el store.

## 9. Activación

La activación valida identificadores, localiza la publicación existente, comprueba campaña y versión, reconstruye contenido canónico, recalcula el hash, aplica control optimista y ejecuta un único commit. Repetir la publicación activa es idempotente y no agrega historial. Publicar no activa automáticamente.

## 10. Desactivación

La desactivación elimina solo la referencia activa mediante un record `DEACTIVATE`; conserva publicaciones e historial. Sin referencia activa devuelve éxito idempotente. También respeta `expectedActivePublicationId`.

## 11. Rollback

El rollback exige referencia activa, objetivo más antiguo, misma campaña, hash válido y una activación anterior demostrable en el historial. Agrega un record `ROLLBACK`, no elimina records posteriores y no modifica publicaciones.

## 12. Resolución

La resolución parte de la referencia activa, vuelve a obtener `PublishedCampaign`, compara campaña, versión y `contentHash`, reconstruye contenido canónico y recalcula SHA-256. Devuelve la publicación dentro de un resultado congelado y no depende de Studio ni del DOM.

## 13. Integración con Studio

El controlador crea una única instancia del servicio por carga de Studio. Usa exclusivamente `CRIOS_STUDIO.publication.getPublication()`, `CRIOS_STUDIO.publication.listPublications()`, `CRIOS_PUBLICATION_CORE.buildCanonicalContent()` y `CRIOS_PUBLICATION_CORE.calculateContentHash()`. `CRIOS_STUDIO.publication` conserva sus ocho miembros exactos y `CRIOS_STUDIO.activation` agrega ocho miembros propios congelados.

## 14. Interfaz

El panel único de Publicación muestra estado, referencia activa, versión, identificador, hash abreviado, historial y aviso de memoria. Cada versión ofrece `Activar` cuando corresponde, badge `Activa` para la seleccionada y `Volver a esta versión` solo cuando el rollback es válido. `Desactivar` aparece únicamente con referencia activa. El renderer usa `textContent`, reemplaza handlers en cada render y delega toda decisión al controlador.

## 15. Atomicidad

Antes de mutar, `commit()` valida referencia final, record, campaña, estado anterior, identificador único y expectativa optimista. Prepara referencia e historial y los incorpora juntos. Cualquier fallo deja ambos sin cambios; la suite demuestra conflictos, identificadores duplicados y formas inválidas sin estado parcial.

## 16. No interferencia con Runtime

No se modificó ningún archivo bajo `js/runtime/`, `js/release/`, `js/publish/` o `js/share/`. Runtime no importa ni resuelve publicaciones activas. Las operaciones no invocan el publish legacy, no sustituyen campañas o misiones, no crean publicaciones y no inician sesiones ni transmisión.

## 17. Pruebas

Resultados reales por HTTP: núcleo 50/50 PASS, integración Studio 44/44 PASS y activación 63/63 PASS; total 157/157, 0 fallos. La validación sintáctica alternativa compiló 8/8 archivos con `new Function(source)` porque Node no estaba disponible. El smoke verificó aplicación principal, Studio, flujo v1/v2, activación, rollback, desactivación y recarga. Pageerrors, errores de consola, warnings, red operativa, storage y timers periódicos: 0.

## 18. Limitaciones

Toda la información es volátil. Al recargar se pierden publicaciones, referencia activa e historial. No existe persistencia, sincronización entre pestañas, red, integración con Runtime ni recuperación después de cerrar la página.

## 19. Integridad

La implementación se limita a los ocho archivos nuevos autorizados y a los archivos de integración permitidos que realmente cambiaron. Los tres documentos protegidos conservaron sus tamaños y SHA-256 iniciales; el núcleo de publicación, sus suites anteriores, Runtime, release, publish, share, campañas, misiones y `.git` permanecieron fuera del alcance de escritura. La comparación final se realiza contra el baseline externo único de 114 archivos.

## 20. Veredicto

PUBLICATION_ACTIVATION_READY_FOR_PERSISTENCE