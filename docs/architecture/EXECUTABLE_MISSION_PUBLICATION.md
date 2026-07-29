# CRIOS A2-006C - Publicación de especificaciones ejecutables

## 1. Propósito

A2-006C permite que Studio produzca y persista un `PublishedCampaign` autocontenido para resolución posterior por Runtime. La publicación incluye especificaciones declarativas completas, identidad y versión de handlers, orden y cantidad de misiones, versión del contrato de Runtime y evaluación final. Todo ese contenido forma parte del `contentHash`.

## 2. Alcance

El sprint integra el contrato ejecutable de A2-006B con el flujo existente de autoría, publicación y persistencia de Studio. No conecta el arranque principal de Runtime, no materializa campañas durante la publicación, no implementa A2-006D y no modifica los módulos protegidos de Runtime ni el flujo principal del juego.

## 3. Arquitectura

El flujo implementado es:

`CampaignDraft -> StudioMissionSpecAdapter -> Publication Core -> PersistentPublicationStore`

`CampaignDraft` conserva los datos de autoría. El catálogo aporta la migración inicial de las cuatro misiones geométricas. El adaptador valida las specs contra `CRIOS_RUNTIME_MISSION_HANDLERS`, construye el manifiesto y entrega un snapshot serializable. El controlador de publicación inyecta ese snapshot en el núcleo existente, que normaliza, canonicaliza, calcula SHA-256 y persiste sin activar.

## 4. Archivos

Archivos nuevos de producción:

- `js/studio/missions/geometry-area-spec-catalog.js`
- `js/studio/missions/studio-mission-spec-adapter.js`
- `js/studio/missions/studio-mission-spec-controller.js`

Archivos de producción modificados:

- `js/studio/modelo/campaign-draft.js`
- `js/studio/publication/studio-publication-controller.js`
- `js/studio/render/studio-renderer.js`
- `js/studio/studio.js`
- `studio/index.html`

Pruebas nuevas:

- `tests/studio-executable-mission-publication.test.html`
- `tests/studio-executable-mission-publication.test.js`

Este documento es el undécimo artefacto del sprint. No hubo archivos eliminados.

## 5. Catálogo de migración

`geometry-area-spec-catalog.js` define specs declarativas de producción para `energy`, `greenhouse`, `ice` y `hangar`. No depende de fixtures de prueba, no consulta `REGISTRO_MISIONES` y devuelve copias defensivas congeladas. Su API pública temporal contiene únicamente `version`, `get` y `list`; Studio la inyecta en el draft y elimina el namespace temporal al terminar el bootstrap.

## 6. CampaignDraft

El draft es propietario de `missionSpec` y `finalEvaluation`. Al agregar una misión conocida, incorpora su spec desde el catálogo privado. Expone operaciones para establecer y obtener specs y evaluación final mediante copias defensivas. Esos datos participan en la revisión significativa del borrador: cambios de payload, handler, orden o evaluación alteran la firma; estado transitorio de interfaz no forma parte del contenido publicable.

## 7. PublishedMissionSpec

Cada spec publicada conserva la raíz contractual exacta:

- `missionId`
- `handlerId`
- `handlerVersion`
- `payload`

Las cuatro specs usan `crios.geometry.declarative-area@1.0.0`. El payload contiene los rangos, variables, AST de respuesta, presentación, escena y contenido pedagógico necesarios. Las publicaciones no contienen funciones ni referencias a implementaciones legacy.

## 8. Manifiesto

`runtimeExecutionManifest` contiene exactamente:

- `runtimeContractVersion: "1.0.0"`
- `requiredHandlers`
- `missionCount`
- `missionOrder`

Para la campaña migrada se verificó un handler requerido, cuatro misiones y el orden `energy`, `greenhouse`, `ice`, `hangar`. El adaptador rechaza duplicados, incoherencias entre misión y spec y cualquier handler o versión no disponible.

## 9. Evaluación final

`finalEvaluation` permanece en el draft, se valida como contenido estructurado y se copia completa al snapshot publicable. La validación exige una instrucción, unidad, fórmula, ajustes y tolerancia válidos. La evaluación persiste junto con la campaña y cualquier cambio significativo modifica el contenido canónico y su hash.

## 10. Validación

La validación ejecutable comprueba estructura, identidad de misión, disponibilidad exacta del handler, payload, unicidad, orden y evaluación final antes de construir el manifiesto. Las incidencias tienen forma estructurada con `code`, `message`, `path` y `severity`. Un fallo no produce manifiesto, no consume versión y no persiste una publicación parcial.

## 11. Publicación

`studio-publication-controller.js` acepta el adaptador de specs como dependencia opcional. Con la dependencia presente publica el snapshot ejecutable; sin ella conserva el comportamiento histórico. El resultado contiene `missionSpecs`, `runtimeExecutionManifest` y `finalEvaluation`, además de los metadatos normales de `PublishedCampaign`. Publicar no activa la campaña.

## 12. Hash

El normalizador existente conserva los campos publicables nuevos y elimina estado transitorio. El canonicalizador existente incorpora todo el contenido normalizado. Se verificó recalculando SHA-256 que el `contentHash` publicado cubre specs, manifiesto y evaluación final. Cambios de payload, versión de handler, orden o evaluación producen contenido canónico y hashes diferentes.

## 13. Persistencia

La persistencia existente almacena y recupera sin pérdida las specs, el manifiesto, la evaluación final y el `contentHash`. En el smoke, una publicación v1 se recuperó después de recargar Studio; un cambio significativo produjo v2 y un hash distinto. El contador de versión continuó en 2 y ambas publicaciones permanecieron inactivas. Al finalizar se borraron los datos de prueba y el storage volvió a `EMPTY`, con cero publicaciones y sin claves locales.

## 14. Integración con Studio

`studio.js` coordina catálogo, adaptador, controlador de specs y publicación. La API congelada `CRIOS_STUDIO.missionSpecs` expone `version`, `getCurrentSpec`, `listCurrentSpecs`, `validateCurrentDraft`, `getExecutionManifest` y `getState`. Las APIs preexistentes de `CRIOS_STUDIO.publication`, `activation` y `persistence` conservan su forma. Los globals temporales de las fábricas nuevas se eliminan después de la inyección.

## 15. Interfaz

El panel de publicación muestra una sección de compatibilidad de ejecución con estado, cantidad de misiones, specs válidas e inválidas, versión contractual, handlers requeridos, manifiesto y evaluación final. El renderer usa nodos explícitos y `textContent`; no muestra el payload completo ni AST o respuestas en la interfaz.

## 16. Seguridad

El contenido publicable es datos serializables: no contiene funciones, `eval`, constructor `Function`, HTML crudo, SVG crudo, URLs de ejecución ni referencias legacy. Catálogo y adaptador no realizan red ni crean timers periódicos. Las lecturas públicas son defensivas y los resultados se congelan profundamente. Solo queda como global permanente la API agregada bajo `CRIOS_STUDIO.missionSpecs`; las fábricas auxiliares no quedan expuestas.

## 17. Pruebas

Resultado final en páginas nuevas:

| Suite | Resultado |
| --- | ---: |
| Publication Core | 50/50 PASS |
| Studio Publication Integration | 44/44 PASS |
| Publication Activation | 63/63 PASS |
| Publication Persistence | 89/89 PASS |
| Runtime Mission Materialization | 128/128 PASS |
| Studio Executable Mission Publication | 100/100 PASS |
| Total | 474/474 PASS |

La suite nueva terminó sin `pageerrors`, errores de consola ni warnings. Node no está disponible en el entorno; como comprobación sintáctica externa se descargaron por HTTP y compilaron con `new Function` los ocho JS nuevos o modificados relevantes, con resultado 8/8 PASS. El smoke de la aplicación principal terminó con documento completo, cero errores, cero rechazos, cero errores de consola y cero recursos fallidos.

## 18. Limitaciones

Este sprint publica el contrato ejecutable, pero no lo resuelve en el arranque principal de Runtime. Runtime todavía no selecciona una publicación activa ni materializa automáticamente sus specs; esa conexión corresponde a A2-006D. El catálogo cubre únicamente las cuatro misiones geométricas migradas. La persistencia continúa siendo local al navegador y no sincroniza con servicios remotos.

## 19. Integridad

El baseline autenticado previo al sprint contiene 143 archivos. Antes de crear este informe, la comparación mostró 5 archivos agregados, 5 modificados y 0 eliminados; ninguna ruta ajena al alcance cambió. El baseline no se regeneró. Los documentos arquitectónicos protegidos y los módulos de Runtime de A2-006B permanecen sin cambios. La puerta Git se comprueba nuevamente al cierre y no se crea ningún commit.

## 20. Veredicto

`EXECUTABLE_MISSION_PUBLICATION_READY_FOR_RUNTIME_RESOLUTION`

Studio produce, versiona, hashea y persiste publicaciones autocontenidas con las cuatro especificaciones ejecutables, su manifiesto contractual y la evaluación final, sin activar automáticamente ni conectar todavía el arranque principal de Runtime.