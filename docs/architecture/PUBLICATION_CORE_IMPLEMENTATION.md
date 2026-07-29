## 1. Propósito

Implementar el núcleo aislado y determinista de Publicación definido por el contrato, sin integrar todavía Studio, Runtime ni Seguimiento.

## 2. Alcance

Se implementó exclusivamente:
- modelos de publicación;
- normalización pura;
- validación por niveles;
- canonicalización determinista;
- hash SHA-256;
- store en memoria atómico;
- servicio async de publicación;
- API pública congelada;
- pruebas deterministas de navegador.

Quedó fuera de alcance:
- UI de publicación;
- almacenamiento persistente;
- activación persistente y rollback operativo;
- integración Studio/Runtime/Seguimiento.

## 3. Arquitectura

Se creó el namespace único `window.CRIOS_PUBLICATION_CORE` (IIFE, strict mode, sin módulos ES). El flujo interno es:
1. `normalizeDraft`
2. `validateDraft`
3. `buildPublicationCandidate`
4. `buildCanonicalContent`
5. `calculateContentHash`
6. `createPublicationService().publishCampaign`
7. `store.commit` atómico

`index.html` carga los ocho módulos del núcleo inmediatamente antes de `js/crios.js`, preservando el orden previo del resto de scripts.

## 4. Archivos creados

- js/publication/publication-model.js
- js/publication/publication-normalizer.js
- js/publication/publication-validator.js
- js/publication/publication-canonicalizer.js
- js/publication/publication-hash.js
- js/publication/publication-memory-store.js
- js/publication/publication-service.js
- js/publication/publication-api.js
- tests/publication-core.test.html
- tests/publication-core.test.js
- docs/architecture/PUBLICATION_CORE_IMPLEMENTATION.md

Archivo modificado:
- index.html

## 5. API pública

La API expuesta es exactamente:
- version
- constants
- createValidationIssue
- normalizeDraft
- validateDraft
- buildPublicationCandidate
- buildCanonicalContent
- calculateContentHash
- createInMemoryPublicationStore
- createPublicationService
- isPublishedCampaign
- isPublicationResult

`version` = `1.0.0`.
API y constantes congeladas con `Object.freeze`.

## 6. Modelos

Se implementaron fábricas puras internas para:
- ValidationIssue
- PublicationCandidate
- PublishedCampaign
- PublicationRecord
- PublicationResult

Los modelos resultantes se devuelven congelados y con clonación defensiva.

## 7. Normalización

`normalizeDraft(draft, options)`:
- clona entrada;
- resuelve `campaignId`;
- resuelve `draftRevision`;
- asigna `schemaVersion`;
- aplica trim a strings;
- elimina estado transitorio y metadatos de sobre en `content` (`campaignId`, `draftRevision`, `version`, `schemaVersion`);
- preserva orden de arrays semánticos.

No modifica el draft original.

## 8. Validación

`validateDraft(draft, options)` produce:
- `valid`, `issues`, `errors`, `warnings`, `info`, `levels`, `normalized`.

Niveles implementados:
- structural
- referential
- semantic
- runtimeCompatibility
- publishability

Integración legacy segura:
- adaptación opcional a `window.CRIOS_CAMPAIGN_VALIDATOR.validarCampaignDraft`;
- excepciones legacy convertidas en incidencias estructuradas.

Cobertura de códigos de error declarados:
- alcanzables con prueba: `INVALID_DRAFT`, `VALIDATION_FAILED`, `DRAFT_REVISION_CONFLICT`, `CAMPAIGN_ID_MISSING`, `DUPLICATE_ID`, `MISSING_REFERENCE`, `RUNTIME_INCOMPATIBLE`, `SERIALIZATION_FAILED`, `CANONICALIZATION_FAILED`, `HASH_FAILED`, `PUBLICATION_PERSISTENCE_FAILED`, `RECORD_PERSISTENCE_FAILED`, `SCHEMA_VERSION_UNSUPPORTED`.
- reservados en esta implementación: ninguno.

## 9. Contenido canónico

`buildCanonicalContent(candidate)`:
- canoniza `{ schemaVersion, content }`;
- ordena claves de objetos en forma recursiva;
- preserva orden de arrays;
- rechaza circulares y valores no soportados.

Se excluyen metadatos operativos y de record/publicación del contenido canónico.

## 10. Hash

`calculateContentHash(canonicalContent, options)`:
- exige cadena;
- usa SHA-256 (`crypto.subtle.digest` por defecto);
- permite `options.digest` inyectable para tests;
- devuelve hex minúsculo de 64 caracteres;
- falla de forma controlada cuando no hay soporte criptográfico.

## 11. Store en memoria

`createInMemoryPublicationStore()` implementa:
- `commit`, `getPublication`, `getRecord`, `listPublications`, `listRecords`, `getNextVersion`, `snapshot`.

Propiedades:
- cierre privado;
- validación previa integral;
- commit atómico publication+record;
- sin estado parcial ante error;
- lecturas con copias defensivas congeladas.

## 12. Servicio de publicación

`createPublicationService(options)` expone:
- `publishCampaign`
- `getPublication`
- `getRecord`
- `listPublications`
- `listRecords`
- `snapshot`

`publishCampaign` implementa verificación inicial y tardía de `expectedDraftRevision`, candidate, canonicalización, hash, versionado, generación de `publicationId`, creación de `PublishedCampaign` y `PublicationRecord`, y commit único atómico.

## 13. Atomicidad

Demostrada por implementación y pruebas:
- no hay inserciones parciales;
- conflictos o fallas no consumen versión ni dejan `publication`/`record` incompletos;
- `publication` y `record` se incorporan juntos o no se incorpora ninguno.

## 14. Inmutabilidad

Demostrada por implementación y pruebas:
- modelos y resultados finales congelados;
- modificar el draft posterior a publicar no altera artefactos;
- modificar lecturas del store no altera el estado interno.

## 15. Compatibilidad legacy

Estado:
- `CampaignDraft` actual (id/nombre/descripcion/escenario/estado/version/misiones) mapeable al núcleo.
- `releaseFactory` legacy exige `id/title/scenario/missions/metadata`.
- `runtimeCore` legacy consume release con `id` y `missions` + sesión coherente.

Compatibilidad observada:
- el núcleo conserva contenido de campaña y misiones serializable;
- `contentHash` estable para contenido lógico idéntico;
- no se modificaron módulos legacy (`release`, `publish`, `share`, `runtime`, `studio`).

Pendiente para A2-003:
- adaptador explícito PublishedCampaign.content -> release legacy consumible por runtime/createRuntime cuando se active la integración.

Resultado:
- COMPATIBILIDAD_PARCIAL (sin cambios en legacy por restricción de sprint).

## 16. Pruebas deterministas

Suite en `tests/publication-core.test.js` con ejecución automática y resultado en `window.CRIOS_PUBLICATION_TEST_RESULTS`.

Resultados:
- total: 50
- passed: 50
- failed: 0
- status: PASS

Cobertura mínima obligatoria cumplida:
- API exacta y congelada;
- `constants` profundamente congelado;
- global único público del núcleo y namespace interno no expuesto;
- formas exactas de `ValidationIssue`, `PublishedCampaign`, `PublicationRecord`, `PublicationResult`;
- canonicalización determinista y hash independiente de `draftRevision`;
- stores independientes, atomicidad y lecturas defensivas;
- conflictos iniciales/tardíos y versionado consecutivo;
- todos los códigos de error alcanzables con prueba;
- códigos reservados explícitos (ninguno);
- ausencia de storage/red/timers/DOM en el núcleo.

## 17. Pruebas de navegador

Validación sintáctica (sin Node):
- marcador: NODE_NO_DISPONIBLE
- compilación alternativa `new Function(source)` sobre 9 JS nuevos
- 9/9 OK

Pruebas core en HTTP:
- sin pageerror
- sin console.error del núcleo
- sin console.warn del núcleo
- `status` PASS con `failed=0` y `passed=total`
- globals CRIOS observados: `CRIOS_PUBLICATION_CORE`, `CRIOS_PUBLICATION_TEST_RESULTS`, `CRIOS_PUBLICATION_TEST_TELEMETRY`
- globals inesperados del núcleo: ninguno
- sin requests de red generadas por el núcleo

Smoke CRIOS por HTTP:
- `window.CRIOS` presente
- `window.CRIOS.api` presente
- `window.CRIOS_TRACE` presente
- `window.CRIOS_PUBLICATION_CORE` presente y congelado
- API pública del núcleo exacta
- sin pageerror ni errores nuevos de consola

## 18. Limitaciones

No implementado en este sprint:
- activación/desactivación/rollback persistente;
- persistencia fuera de memoria;
- integración operativa con Studio;
- integración operativa con Runtime;
- Seguimiento.

## 19. Integridad

Ámbito de cambios observado:
- nuevos: ninguno;
- modificados en cierre A2-002B: `tests/publication-core.test.js`, `docs/architecture/PUBLICATION_CORE_IMPLEMENTATION.md`;
- sin eliminaciones.

No se modificaron:
- módulos legacy release/publish/share;
- módulos runtime/studio/sesión/navegación;
- campañas, misiones, CSS, contrato previo.

## 20. Veredicto

PUBLICATION_CORE_READY_FOR_INTEGRATION
