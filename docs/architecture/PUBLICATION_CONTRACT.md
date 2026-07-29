## 1. Proposito

Definir el contrato arquitectonico ejecutable para la frontera Studio -> Publicacion -> Runtime -> Seguimiento en CRIOS, sin implementar aun el nucleo de publicacion.

## 2. Alcance

- Este documento describe contratos de datos, invariantes, validaciones, operaciones y transaccion de publicacion.
- Este documento no implementa codigo.
- Este documento separa claramente:
  - comportamiento ACTUAL demostrado en repositorio;
  - decisiones PROPUESTO para A2-002;
  - RESTRICCION obligatoria de integridad;
  - temas PENDIENTE_RUNTIME.

## 3. Evidencia del sistema actual

| ID | Estado | Archivo | Funcion o bloque | Lineas | Evidencia | Consecuencia contractual |
| --- | --- | --- | --- | --- | --- | --- |
| PUB-EV-001 | ACTUAL | js/studio/modelo/campaign-draft.js | defaultDraft | 5-13 | El borrador existe como estado mutable con id, nombre, descripcion, escenario, estado, version, misiones. | CampaignDraft existe y es mutable en Studio. |
| PUB-EV-002 | ACTUAL | js/studio/modelo/campaign-draft.js | obtenerCampana/agregarMision/moverMision/quitarMision | 37, 83, 99, 113 | Studio devuelve copia del draft y aplica mutaciones controladas de misiones. | Runtime no debe consumir este objeto mutable directamente. |
| PUB-EV-003 | ACTUAL | js/studio/acciones/campaign-actions.js | agregarMision/moverMision/quitarMision | 5-26 | Las acciones de Studio delegan al API de draft mutable. | La frontera Studio contiene logica de autoria, no publicacion inmutable. |
| PUB-EV-004 | ACTUAL | js/release/release-factory.js | createCampaignRelease | 5-42 | Se crea release desde snapshot de draft; valida estructura y congela objeto. | Publicacion debe nacer desde copia y terminar inmutable. |
| PUB-EV-005 | ACTUAL | js/release/release-validator.js | validateReleaseStructure | 5-37 | Se exige id, title, scenario, missions y metadata con shape exacto. | La publicacion requiere contrato estructural estricto. |
| PUB-EV-006 | ACTUAL | js/release/release-model.js | calculateReleaseMetadata | 44-61 | Se calcula metadata determinista (missionCount, estimatedDuration, averageDifficulty, schemaVersion, createdAt). | Publicacion necesita normalizacion y metadatos derivados. |
| PUB-EV-007 | ACTUAL | js/publish/publish-service.js | publishCampaign | 5-18 | Publicar toma Draft API, obtiene snapshot y delega a releaseFactory. | La operacion de publicacion debe separar input mutable de output inmutable. |
| PUB-EV-008 | ACTUAL | js/session/session-factory.js | createStudentSession | 5-43 | La sesion se crea desde release valido y captura releaseId. | Session debe guardar identidad de publicacion consumida. |
| PUB-EV-009 | ACTUAL | js/session/session-validator.js | validateStudentSession | 5-92 | Session exige shape cerrado y campos obligatorios con status permitido. | Seguimiento y Runtime dependen de contrato de sesion estable. |
| PUB-EV-010 | ACTUAL | js/runtime/runtime-core.js | createRuntime/validateRuntime | 121-183 | Runtime valida release + session y exige coherencia mission index/id. | Runtime consume artefacto publicado y no draft visual. |
| PUB-EV-011 | ACTUAL | js/navigation/navigation-core.js | createNavigation/validateNavigation | 47-209 | Navigation depende de runtime + release coherentes; valida shape cerrado. | Publicacion debe conservar orden e ids de misiones navegables. |
| PUB-EV-012 | ACTUAL | js/studio/studio.js | DOMAIN_SCRIPT_PATHS + getDomainContract | 9-23, 181-193 | Studio carga release/publish/share/session/runtime/navigation por composicion de contratos. | El contrato de publicacion debe ser consumible por esta composicion sin acople visual. |
| PUB-EV-013 | ACTUAL | js/studio/studio.js | publishCampaign wrapper | 199-205, 467-468 | Studio expone publishCampaign en window.CRIOS_STUDIO. | Publicacion y activacion deben ser operaciones explicitas y separables. |
| PUB-EV-014 | ACTUAL | js/share/share-model.js | createSharePayloadFromRelease | 5-23 | Share construye payload desde release, no desde draft mutable. | Seguimiento/compartido debe referenciar identidad de publicacion. |
| PUB-EV-015 | ACTUAL | js/share/share-validator.js | validateReleaseForShare | 5-33 | Share valida release estructural antes de derivar modelo de compartido. | Publicacion valida es prerrequisito para integraciones posteriores. |
| PUB-EV-016 | ACTUAL | js/datos/campanas.js | CAMPANAS_CRIOS | 7-22 | Catalogo actual define campanas publicadas con ids y orden de misiones. | campaignId existe como identidad logica estable. |
| PUB-EV-017 | ACTUAL | js/nucleo/registro-misiones.js | registrar/obtener/listar | 31-43 | Misiones se registran en catalogo con ids unicos y shape obligatorio. | Publicacion debe preservar integridad referencial campana-misiones. |
| PUB-EV-018 | ACTUAL | js/session/session-model.js | STUDENT_SESSION_STATUSES | 5 | Estados de sesion running/finished/gameOver son contrato activo. | Seguimiento debe desacoplarse de borrador y usar identidad de release en sesion. |
| PUB-EV-019 | RESTRICCION | js/config.js | CRIOS_CONFIG storage keys | 16-24 | Persistencia de sesion/progreso existe separada del contenido de campana. | Publicacion no debe incluir estado de sesion, progreso ni datos personales. |
| PUB-EV-020 | PENDIENTE_RUNTIME | docs/architecture/RUNTIME_EXPERIMENT_CONTRACT.md | Casos RT pendientes | Seccion 7 | Experimentos runtime no ejecutados en este sprint. | Garantias globales de ejecucion quedan fuera; solo contrato estatico aqui. |

## 4. Terminologia

- CampaignDraft: representacion mutable de autoria en Studio.
- PublicationCandidate: copia normalizada y validada previa a publicar.
- PublishedCampaign: snapshot inmutable consumible por Runtime.
- PublicationRecord: registro append-only de cada publicacion.
- ActivePublicationReference: referencia mutable a publicacion activa por campaignId.
- ValidationIssue: resultado estructurado de validacion (ERROR/WARNING/INFO).
- PublicationResult: salida estructurada de operaciones de publicacion.
- campaignId: identidad logica de campana.
- draftRevision: revision mutable del draft.
- publicationId: identidad unica de publicacion.
- version: secuencia de publicacion por campaignId.
- schemaVersion: version del contrato de datos.
- contentHash: hash de contenido canonico.

## 5. Fronteras de responsabilidad

| Dato o responsabilidad | Studio | Publicacion | Runtime | Seguimiento | Regla |
| --- | --- | --- | --- | --- | --- |
| borrador | Propietario mutable | Solo recibe copia | No consume | No consume | Un solo propietario mutable: Studio |
| draftRevision | Mantiene y cambia | Verifica expectedDraftRevision | No cambia | No cambia | Conflicto => DRAFT_REVISION_CONFLICT |
| validacion | Puede solicitar | Ejecuta validacion contractual | Solo valida consumo runtime | Solo valida referencia | Validacion de publicabilidad vive en Publicacion |
| normalizacion | No obligatoria | Obligatoria previa a publicar | No normaliza contenido fuente | No normaliza | Contenido canonico se define en Publicacion |
| publicacion | Solicita | Crea PublishedCampaign | Consume | Referencia | Crear != activar |
| activacion | Solicita opcion | Cambia ActivePublicationReference | Lee referencia activa o id explicito | Registra id usado | Activacion no reescribe artefacto |
| artefacto publicado | No muta | Crea inmutable | Consume inmutable | Referencia inmutable | Runtime nunca consume draft |
| historial | No reescribe | Append-only PublicationRecord | Solo lectura | Solo lectura | Rollback no borra historial |
| rollback | Puede solicitar | Reapunta referencia activa | Consume nueva referencia | Traza cambio | No crea version falsa |
| sesion | No gestiona runtime session | Solo provee identidad de publicacion | Propietario de session lifecycle | Referencia session-publication | Session conserva publicationId/version/hash |
| progreso | No gestiona runtime progreso | Fuera de alcance | Propietario runtime state | Referencia analitica | Progreso no forma parte de publicacion |
| trazas | No gobierna runtime tracing | Fuera de alcance A2-001 | Puede emitir trazas runtime | Puede consumir trazas | Trazas no alteran publicacion |

Conflictos de ownership detectados actualmente:
- No se evidencia un segundo propietario mutable del draft fuera de Studio.
- Existen representaciones derivadas de release/session/runtime, pero no reemplazan al owner de borrador.

## 6. Entidades

- CampaignDraft
  - Estado: ACTUAL (modelo mutable en Studio).
  - Rol: autoria y edicion.
- PublicationCandidate
  - Estado: PROPUESTO.
  - Rol: snapshot normalizado previo a persistir.
- PublishedCampaign
  - Estado: ACTUAL/PROPUESTO.
  - ACTUAL: release inmutable ya existente.
  - PROPUESTO: formalizacion final con publicationId/version/contentHash.
- PublicationRecord
  - Estado: PROPUESTO.
  - Rol: historial append-only de operaciones.
- ActivePublicationReference
  - Estado: PROPUESTO.
  - Rol: activacion desacoplada de creacion.
- ValidationIssue
  - Estado: PROPUESTO.
  - Rol: salida uniforme de validacion.
- PublicationResult
  - Estado: PROPUESTO.
  - Rol: resultado estructurado para operaciones.

## 7. Identidades y versionado

Identidades contractuales:
- campaignId: identidad logica estable de campana.
- draftRevision: revision mutable del draft.
- publicationId: identidad unica de una publicacion inmutable.
- version: secuencia de publicacion por campaignId.
- schemaVersion: version del contrato de datos.
- contentHash: huella de contenido canonico.

Reglas:
- ACTUAL: session conserva releaseId (equivalente funcional actual de publicationId) al crearse.
- RESTRICCION: dos contenidos diferentes no comparten publicationId.
- RESTRICCION: una version publicada no cambia contenido.
- RESTRICCION: publicationId siempre cambia por publicacion nueva.
- RESTRICCION: contentHash se calcula sobre contenido canonico y excluye estado de sesion/progreso/estado visual.
- PROPUESTO: version no integra contenido canonico; dos publicaciones distintas pueden compartir contentHash si el contenido canonico es identico.

## 8. Invariantes

- PUB-INV-001: Runtime nunca consume un borrador mutable.
- PUB-INV-002: Una publicacion es inmutable una vez creada.
- PUB-INV-003: Una version no cambia de contenido.
- PUB-INV-004: Un publicationId identifica una unica publicacion.
- PUB-INV-005: El contentHash corresponde al contenido canonico.
- PUB-INV-006: La publicacion es atomica (todo o nada).
- PUB-INV-007: ActivePublicationReference siempre apunta a publicacion existente y valida.
- PUB-INV-008: Una sesion conserva publicationId/version/contentHash de inicio.
- PUB-INV-009: Rollback no reescribe ni borra historial.
- PUB-INV-010: Seguimiento referencia publicacion concreta, no "ultimo draft".
- PUB-INV-011: Errores bloqueantes no dejan artefactos parciales.
- PUB-INV-012: Publicacion y activacion son operaciones distintas.
- PUB-INV-013: Session/progreso/trazas no forman parte de PublishedCampaign.
- PUB-INV-014: Ninguna operacion de activacion modifica el contenido del artefacto ya publicado.

## 9. Contrato de CampaignDraft

| Campo | Tipo conceptual | Obligatorio | Origen actual | Destino | Mutabilidad | Validacion | Estado |
| --- | --- | --- | --- | --- | --- | --- | --- |
| id | string or null | No | js/studio/modelo/campaign-draft.js | PublicationCandidate | Mutable | string/null valido | ACTUAL |
| nombre | string | Si para publicar | js/studio/modelo/campaign-draft.js | title canonico | Mutable | trim no vacio para publicar | ACTUAL |
| descripcion | string | No | js/studio/modelo/campaign-draft.js | description | Mutable | string | ACTUAL |
| escenario | string | Si para publicar | js/studio/modelo/campaign-draft.js | scenario | Mutable | id de escenario valido | ACTUAL |
| estado | string | No | js/studio/modelo/campaign-draft.js | PublicationRecord.state | Mutable | enum de studio | ACTUAL |
| version | integer | No | js/studio/modelo/campaign-draft.js | draftRevision candidato | Mutable | integer positivo | ACTUAL |
| misiones | array<object> | Si | js/studio/modelo/campaign-draft.js | missions publicadas | Mutable | >=1, ids validos, sin duplicados | ACTUAL |
| draftRevision | string | Si (futuro) | No explicito | control de concurrencia | Mutable | monotonia por update | PROPUESTO |

## 10. Contrato de PublicationCandidate

| Campo | Tipo conceptual | Obligatorio | Origen actual | Destino | Mutabilidad | Validacion | Estado |
| --- | --- | --- | --- | --- | --- | --- | --- |
| campaignId | string | Si | CAMPANAS_CRIOS.id o draft mapping | PublishedCampaign | Inmutable en candidato | no vacio | PROPUESTO |
| draftRevision | string | Si | CampaignDraft.version/revision | PublicationRecord | Inmutable en candidato | coincide expectedDraftRevision | PROPUESTO |
| title | string | Si | draft.nombre | PublishedCampaign.title | Inmutable en candidato | trim no vacio | ACTUAL |
| description | string | No | draft.descripcion | PublishedCampaign.description | Inmutable en candidato | string | ACTUAL |
| scenario | string | Si | draft.escenario | PublishedCampaign.scenario | Inmutable en candidato | escenario existente | ACTUAL |
| missions | array<object> | Si | draft.misiones normalizado | PublishedCampaign.missions | Inmutable en candidato | ids unicos y referenciales | ACTUAL |
| metadata | object | Si | calculateReleaseMetadata | PublishedCampaign.metadata | Inmutable en candidato | shape exacto | ACTUAL |
| canonicalContent | object serializable | Si | normalizacion pura | hash input | Inmutable en candidato | serializable determinista | PROPUESTO |

## 11. Contrato de PublishedCampaign

| Campo | Tipo conceptual | Obligatorio | Origen actual | Destino | Mutabilidad | Validacion | Estado |
| --- | --- | --- | --- | --- | --- | --- | --- |
| publicationId | string | Si | release.id actual / asignacion futura | Runtime + Tracking | Inmutable | unico, no vacio | PROPUESTO |
| campaignId | string | Si | catalogo campanas/draft | Runtime + Tracking | Inmutable | no vacio | PROPUESTO |
| version | integer | Si | secuencia por campaignId | Runtime + Tracking | Inmutable | >0 | PROPUESTO |
| schemaVersion | string | Si | metadata.schemaVersion | Runtime + Tracking | Inmutable | soportado | ACTUAL |
| contentHash | string | Si | hash de canonicalContent | Runtime + Tracking | Inmutable | hash valido | PROPUESTO |
| title | string | Si | draft.nombre | Runtime UI | Inmutable | no vacio | ACTUAL |
| description | string | No | draft.descripcion | Runtime UI | Inmutable | string | ACTUAL |
| scenario | string | Si | draft.escenario | Runtime | Inmutable | no vacio | ACTUAL |
| missions | array<object> | Si | draft.misiones normalizadas | Runtime + Navigation | Inmutable | ids unicos y orden coherente | ACTUAL |
| metadata | object | Si | release model | Runtime + Share | Inmutable | shape exacto | ACTUAL |

## 12. PublicationRecord y activacion

PublicationRecord

| Campo | Tipo conceptual | Obligatorio | Origen actual | Destino | Mutabilidad | Validacion | Estado |
| --- | --- | --- | --- | --- | --- | --- | --- |
| recordId | string | Si | asignacion transaccional | Historial | Append-only | unico | PROPUESTO |
| campaignId | string | Si | candidate | Historial | Append-only | no vacio | PROPUESTO |
| publicationId | string | Si | published artifact | Historial | Append-only | existe artefacto | PROPUESTO |
| version | integer | Si | secuencia | Historial | Append-only | >0 | PROPUESTO |
| draftRevision | string | Si | candidate | Historial | Append-only | coincide precondicion | PROPUESTO |
| contentHash | string | Si | canonical hash | Historial | Append-only | consistente | PROPUESTO |
| createdAt | ISO datetime | Si | reloj de transaccion | Historial | Append-only | ISO canonico | PROPUESTO |
| status | enum | Si | resultado publicacion | Historial | Append-only | VALIDATING/REJECTED/READY/PUBLISHING/PUBLISHED/FAILED | PROPUESTO |

ActivePublicationReference

| Campo | Tipo conceptual | Obligatorio | Origen actual | Destino | Mutabilidad | Validacion | Estado |
| --- | --- | --- | --- | --- | --- | --- | --- |
| campaignId | string | Si | seleccion campana | Runtime resolver | Mutable | campana existente | PROPUESTO |
| publicationId | string or null | Si | activacion/rollback/deactivate | Runtime resolver | Mutable | null o artefacto existente | PROPUESTO |
| version | integer or null | Si | activacion/rollback | Runtime resolver | Mutable | null o version existente | PROPUESTO |
| updatedAt | ISO datetime | Si | operacion de referencia | Auditoria | Mutable | ISO canonico | PROPUESTO |
| reason | enum | No | activate/deactivate/rollback | Auditoria | Mutable | valor permitido | PROPUESTO |

ValidationIssue

| Campo | Tipo conceptual | Obligatorio | Origen actual | Destino | Mutabilidad | Validacion | Estado |
| --- | --- | --- | --- | --- | --- | --- | --- |
| code | string | Si | validadores | PublicationResult | Inmutable | codigo conocido | PROPUESTO |
| severity | enum | Si | validadores | PublicationResult | Inmutable | ERROR/WARNING/INFO | PROPUESTO |
| message | string | Si | validadores | PublicationResult | Inmutable | no vacio | PROPUESTO |
| path | string | No | validadores | PublicationResult | Inmutable | ruta de campo | PROPUESTO |
| evidenceId | string | No | mapping documental | PublicationResult | Inmutable | PUB-EV-* valido | PROPUESTO |

PublicationResult

| Campo | Tipo conceptual | Obligatorio | Origen actual | Destino | Mutabilidad | Validacion | Estado |
| --- | --- | --- | --- | --- | --- | --- | --- |
| ok | boolean | Si | operacion | caller | Inmutable | booleano | PROPUESTO |
| status | enum | Si | operacion | caller | Inmutable | REJECTED/PUBLISHED/FAILED | PROPUESTO |
| publicationId | string or null | Si | operacion | caller | Inmutable | null o id valido | PROPUESTO |
| version | integer or null | Si | operacion | caller | Inmutable | null o >0 | PROPUESTO |
| contentHash | string or null | Si | operacion | caller | Inmutable | null o hash valido | PROPUESTO |
| issues | array<ValidationIssue> | Si | validacion | caller | Inmutable | shape valido | PROPUESTO |
| activated | boolean | Si | opcion activate | caller | Inmutable | booleano | PROPUESTO |

## 13. Validaciones

Niveles:

1. Estructural
- tipos, campos obligatorios, arrays, forma de ids, schemaVersion, serializacion basica.

2. Referencial
- ids unicos, misiones existentes, referencias validas, sin duplicados, orden coherente, relacion campana-misiones.

3. Semantica
- contenido minimo, valores permitidos, estados compatibles con el modelo activo.

4. Compatibilidad Runtime
- campos requeridos por Runtime y Navigation, valores serializables, sin dependencias de Studio.

5. Publicabilidad
- sin ERROR bloqueantes, candidato normalizado, canonicalContent construible, hash calculable, draftRevision vigente.

Severidades:
- ERROR: bloquea publicacion.
- WARNING: no bloquea, requiere observacion.
- INFO: informativo.

Catalogo de errores contractuales:

| Codigo | Condicion | Bloqueante | Artefacto creado | Activacion modificada | Reintentable | Estado posterior |
| --- | --- | --- | --- | --- | --- | --- |
| INVALID_DRAFT | Draft ausente o shape invalido | Si | No | No | Si | REJECTED |
| VALIDATION_FAILED | Existen ERROR de validacion | Si | No | No | Si | REJECTED |
| DRAFT_REVISION_CONFLICT | expectedDraftRevision no coincide | Si | No | No | Si | REJECTED |
| CAMPAIGN_ID_MISSING | Falta campaignId en entrada | Si | No | No | Si | REJECTED |
| DUPLICATE_ID | IDs duplicados en contenido normalizado | Si | No | No | Si | REJECTED |
| MISSING_REFERENCE | Referencia a mision/escenario inexistente | Si | No | No | Si | REJECTED |
| RUNTIME_INCOMPATIBLE | Candidate no cumple consumo runtime | Si | No | No | Si | REJECTED |
| SERIALIZATION_FAILED | Fallo al serializar canonicalContent | Si | No | No | Si | FAILED |
| CANONICALIZATION_FAILED | Fallo al construir representacion canonica | Si | No | No | Si | FAILED |
| HASH_FAILED | Fallo al calcular contentHash | Si | No | No | Si | FAILED |
| PUBLICATION_PERSISTENCE_FAILED | Falla persistencia de artefacto | Si | No parcial permitido | No | Si | FAILED |
| RECORD_PERSISTENCE_FAILED | Falla persistencia de PublicationRecord | Si | No parcial permitido | No | Si | FAILED |
| ACTIVATION_FAILED | Falla al activar, desactivar o rollback | No | Si o No | No | Si | PUBLISHED o INACTIVE |
| PUBLICATION_NOT_FOUND | publicationId objetivo inexistente | Si | No | No | Si | REJECTED |
| VERSION_NOT_FOUND | version objetivo inexistente para rollback | Si | No | No | Si | REJECTED |
| SCHEMA_VERSION_UNSUPPORTED | schemaVersion no soportado | Si | No | No | Si | REJECTED |

## 14. Transaccion de publicacion

Flujo contractual:
1. Recibir CampaignDraft y opciones.
2. Capturar campaignId y expectedDraftRevision.
3. Clonar borrador.
4. Eliminar estado transitorio.
5. Normalizar estructura.
6. Validar estructural.
7. Validar referencial.
8. Validar semantica.
9. Validar compatibilidad runtime.
10. Revalidar draftRevision.
11. Construir PublicationCandidate.
12. Construir canonicalContent.
13. Calcular contentHash.
14. Asignar publicationId.
15. Asignar version.
16. Construir PublishedCampaign inmutable.
17. Persistir PublishedCampaign.
18. Persistir PublicationRecord.
19. Activar solo si fue solicitado.
20. Devolver PublicationResult.

Separacion obligatoria:
- funciones puras: normalizar, validar, canonicalizar, hashear.
- efectos persistentes: persistir artefacto/record/referencia activa.
- activacion: operacion separada de publicar.

Atomicidad contractual:
- o bien se crea publicacion + record coherentes,
- o no se crea nada nuevo.

## 15. Operaciones contractuales

| Operacion | Entrada | Salida | Precondiciones | Postcondiciones | Errores | Efectos permitidos |
| --- | --- | --- | --- | --- | --- | --- |
| validateDraft(draft) | CampaignDraft | ValidationIssue[] | draft presente | issues emitidos | INVALID_DRAFT, VALIDATION_FAILED | Ninguno |
| normalizeDraft(draft) | CampaignDraft | CampaignDraft normalizado | draft parseable | estructura normalizada | INVALID_DRAFT | Ninguno |
| buildPublicationCandidate(draft) | CampaignDraft | PublicationCandidate | draft normalizado | candidate listo | VALIDATION_FAILED | Ninguno |
| buildCanonicalContent(candidate) | PublicationCandidate | canonicalContent | candidate valido | contenido determinista | CANONICALIZATION_FAILED | Ninguno |
| calculateContentHash(canonicalContent) | object serializable | hash string | canonicalContent serializable | hash calculado | HASH_FAILED, SERIALIZATION_FAILED | Ninguno |
| publishCampaign(draft, options) | CampaignDraft + options | PublicationResult | expectedDraftRevision vigente | publicacion creada o rechazada atomicamente | DRAFT_REVISION_CONFLICT, PUBLICATION_PERSISTENCE_FAILED, RECORD_PERSISTENCE_FAILED, VALIDATION_FAILED | Crear artefacto y record |
| getPublication(publicationId) | publicationId | PublishedCampaign or null | id valido | lectura | PUBLICATION_NOT_FOUND | Lectura |
| listPublications(campaignId) | campaignId | PublicationRecord[] | id valido | historial ordenado | CAMPAIGN_ID_MISSING | Lectura |
| getActivePublication(campaignId) | campaignId | ActivePublicationReference | id valido | referencia activa consultada | CAMPAIGN_ID_MISSING | Lectura |
| activatePublication(campaignId, publicationId) | ids | PublicationResult | publicacion existe | referencia activa actualizada | PUBLICATION_NOT_FOUND, ACTIVATION_FAILED | Actualizar referencia |
| deactivatePublication(campaignId) | campaignId | PublicationResult | campaignId valido | referencia activa null | ACTIVATION_FAILED | Actualizar referencia |
| rollbackPublication(campaignId, publicationId) | ids | PublicationResult | version objetivo existe | referencia activa a version previa | VERSION_NOT_FOUND, ACTIVATION_FAILED | Actualizar referencia |

## 16. Estados y transiciones

Estados conceptuales:
- VALIDATING
- REJECTED
- READY
- PUBLISHING
- PUBLISHED
- ACTIVE
- INACTIVE
- FAILED

Notas:
- VALIDATING/REJECTED/READY/PUBLISHING/PUBLISHED/FAILED viven en PublicationRecord.
- ACTIVE/INACTIVE describen ActivePublicationReference.
- PublishedCampaign no cambia estado interno despues de creado.

| Estado inicial | Operacion | Estado final | Artefacto creado | Referencia activa modificada | Condicion |
| --- | --- | --- | --- | --- | --- |
| VALIDATING | validateDraft | REJECTED | No | No | Existe ERROR |
| VALIDATING | validateDraft | READY | No | No | Sin ERROR |
| READY | publishCampaign | PUBLISHING | No | No | Inicio de persistencia |
| PUBLISHING | publishCampaign | PUBLISHED | Si | No o Si | Persistencia artefacto+record exitosa |
| PUBLISHING | publishCampaign | FAILED | No parcial permitido | No | Falla de persistencia/hash/serializacion |
| PUBLISHED | activatePublication | ACTIVE | No nuevo | Si | publicationId objetivo valido |
| ACTIVE | deactivatePublication | INACTIVE | No | Si | desactivacion solicitada |
| ACTIVE | rollbackPublication | ACTIVE | No nuevo | Si | version previa valida |
| INACTIVE | activatePublication | ACTIVE | No nuevo | Si | activacion solicitada |

## 17. Consumo desde Runtime

Reglas de consumo:
- ACTUAL: Runtime crea sesion con releaseId y valida coherencia contra release (session-factory/runtime-core/navigation-core).
- RESTRICCION: Runtime debe resolver por identidad explicita (publicationId o equivalente releaseId), nunca por ultimo draft.
- RESTRICCION: Runtime no modifica contenido publicado.
- RESTRICCION: session conserva sessionId + campaignId + publicationId + version + contentHash (version/contentHash como extension A2-002).
- PROPUESTO: resolver ActivePublicationReference por campaignId para arranque por defecto.
- PENDIENTE_RUNTIME: validacion en ejecucion de casos de rollback/activacion concurrente.

## 18. Seguimiento y trazabilidad

Contrato de seguimiento:
- Debe vincular sessionId, campaignId, publicationId, version, schemaVersion, contentHash.
- No debe depender del ultimo draft ni de la publicacion activa actual para reconstruir historial.
- Debe tolerar que una campana tenga multiples publicaciones validas.

Recorrido inverso definido:
- Desde Session -> publicationId/version/contentHash -> PublishedCampaign -> PublicationRecord.
- Desde ActivePublicationReference -> publicationId -> PublishedCampaign + PublicationRecord.
- Desde PublishedCampaign -> PublicationRecord de creacion + campaignId + version + schemaVersion + contentHash.

Limites actuales:
- ACTUAL: session ya conserva releaseId.
- FUERA_DE_ALCANCE: persistencia formal de PublicationRecord y ActivePublicationReference aun no existe.
- PENDIENTE_RUNTIME: pruebas de integracion end-to-end con RT pendientes.

## 19. Estrategia de implementacion

Sprint A2-002 - Nucleo de Publicacion

Alcance incluido exactamente:
- modelos;
- validacion pura;
- normalizacion;
- representacion canonica;
- hash;
- publicacion en memoria;
- pruebas deterministas.

No incluido en A2-002:
- interfaz;
- servidor;
- red;
- almacenamiento definitivo;
- activacion persistente;
- migracion completa de Runtime;
- Seguimiento.

Plan incremental:
1. Introducir modelos puros contractuales.
2. Implementar validadores y normalizadores puros.
3. Implementar canonicalizacion y hash en memoria.
4. Implementar publishCampaign atomico en memoria.
5. Verificar compatibilidad con campanas/misiones actuales.
6. Agregar pruebas deterministas de conflicto draftRevision.

## 20. Veredicto

PUBLICATION_CONTRACT_READY_FOR_IMPLEMENTATION
