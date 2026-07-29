## 1. Propósito

Integrar Publicación en CRIOS Studio usando el núcleo A2-002B sin modificarlo, manteniendo Studio como propietario del CampaignDraft mutable.

## 2. Alcance

Incluye:
- validación de borrador desde Studio;
- publicación inmutable en memoria;
- historial por campaignId en sesión actual;
- panel real de Publicación en la UI de Studio;
- API anidada en `CRIOS_STUDIO.publication`.

Excluye:
- activación en Runtime;
- persistencia;
- ActivePublicationReference;
- Seguimiento;
- RT-001 a RT-008.

## 3. Arquitectura

Patrón IIFE + strict mode + APIs congeladas.

Flujo integrado:
1. Studio obtiene snapshot defensivo del draft.
2. Adaptador calcula firma determinista y revisión lateral.
3. Controlador delega en `CRIOS_PUBLICATION_CORE.validateDraft` o `publishCampaign`.
4. Renderer refleja estado/incidencias/historial sin lógica de negocio.
5. API pública queda anidada en `window.CRIOS_STUDIO.publication`.

## 4. Archivos

Creados:
- `js/studio/publication/studio-publication-adapter.js`
- `js/studio/publication/studio-publication-controller.js`
- `css/studio-publication.css`
- `tests/studio-publication-integration.test.html`
- `tests/studio-publication-integration.test.js`
- `docs/architecture/STUDIO_PUBLICATION_INTEGRATION.md`

Modificados:
- `studio/index.html`
- `js/studio/studio.js`
- `js/studio/render/studio-renderer.js`

## 5. API de Studio

`window.CRIOS_STUDIO.publication` (congelada) expone exactamente:
- `version`
- `validateCurrentDraft`
- `publishCurrentDraft`
- `listPublications`
- `getPublication`
- `getRecord`
- `getLastResult`
- `getState`

`version = "1.0.0"`.

## 6. Adaptador de borrador

Responsabilidades implementadas:
- snapshot profundo seguro del draft actual;
- resolución de `campaignId` desde campos reales del borrador (`campaignId` o `id`);
- sin mutar CampaignDraft original;
- exclusión de campos transitorios/visuales en snapshot y firma;
- sin dependencia de DOM.

## 7. Revisión del borrador

Revisión lateral en memoria de sesión:
- inicializa en 1 al primer contenido observado;
- incrementa solo cuando cambia la firma relevante;
- no incrementa por renderizar, validar, consultar estado o publicar sin editar;
- firma canónica con claves ordenadas y arrays preservados;
- excluye `draftRevision`, estado visual y mensajes temporales.

## 8. Controlador

Crea una única instancia por sesión de:
- `createInMemoryPublicationStore()`;
- `createPublicationService(...)`.

Estado interno:
- `status`, `busy`, `lastValidation`, `lastResult`, `lastError`, `currentDraftRevision`, `currentCampaignId`.

Estados:
- `IDLE`, `VALIDATING`, `INVALID`, `READY`, `PUBLISHING`, `PUBLISHED`, `ERROR`.

`getState()` retorna copia congelada defensiva.

## 9. Validación

`validateCurrentDraft()`:
- bloquea operación concurrente;
- toma snapshot + campaignId + draftRevision;
- ejecuta núcleo;
- conserva incidencias completas;
- no publica ni altera store;
- no muta borrador;
- dispara actualización visual.

Errores controlados:
- `PUBLICATION_CORE_UNAVAILABLE`;
- `STUDIO_DRAFT_UNAVAILABLE`;
- `STUDIO_PUBLICATION_BUSY`.

## 10. Publicación

`publishCurrentDraft()`:
- bloquea doble ejecución;
- marca `PUBLISHING`;
- publica con `expectedDraftRevision`;
- detecta conflicto tardío mediante `readDraftRevision`;
- no llama publish legacy;
- no modifica Runtime;
- no modifica campañas globales.

En éxito: `campaignId`, `publicationId`, `version`, `schemaVersion`, `contentHash`, `createdAt`, `sourceDraftRevision`.

## 11. Interfaz

Panel real integrado en Studio:
- título, estado, revisión;
- botones Validar/Publicar;
- resumen por severidad;
- incidencias;
- último resultado;
- historial;
- aviso de memoria volátil.

Render seguro:
- nodos explícitos;
- `textContent` para contenido dinámico;
- sin `alert`, `confirm`, ni stack traces en UI.

## 12. Historial en memoria

Comportamiento confirmado:
- listado ascendente por versión;
- filtrado por `campaignId` actual;
- solo sesión activa;
- desaparece al recargar;
- lecturas defensivas (`getPublication`, `getRecord`).

## 13. Compatibilidad legacy

Clasificación: `COMPATIBILIDAD_PARCIAL`.

Motivo:
- se conserva publish/release legacy sin modificaciones;
- la integración usa exclusivamente `CRIOS_PUBLICATION_CORE`;
- adaptador en Studio permite convivencia sin migración total de Runtime.

## 14. No interferencia con Runtime

Verificado:
- sin activación automática de Runtime;
- sin cambios en módulos runtime/release/publish/share;
- sin cambio de campañas globales;
- sin persistencia;
- sin red disparada por integración;
- sin uso de storage.

## 15. Pruebas

Suite integración:
- `tests/studio-publication-integration.test.html`
- `tests/studio-publication-integration.test.js`

Resultado visible:
- total: 44
- passed: 44
- failed: 0
- status: PASS
- pageerrors: 0
- console.error: 0
- console.warn propios: 0
- globals inesperados: 0

Validación sintáctica:
- `NODE_NO_DISPONIBLE`
- fallback HTTP + `new Function(source)`
- 5/5 OK:
  - studio-publication-adapter.js
  - studio-publication-controller.js
  - studio-publication-integration.test.js
  - studio.js
  - studio-renderer.js

## 16. Limitaciones

No implementado en A2-003:
- activación de publicación en Runtime;
- referencia activa persistente;
- persistencia de historial;
- migración total de release pipeline legacy;
- Seguimiento.

## 17. Integridad

Cambios restringidos a archivos permitidos de integración Studio + pruebas + documentación.

Sin cambios en:
- núcleo de Publicación;
- contratos A2-001/A2-002B;
- runtime/release/publish/share;
- campañas/misiones;
- `.git`.

## 18. Veredicto

STUDIO_PUBLICATION_INTEGRATION_READY
