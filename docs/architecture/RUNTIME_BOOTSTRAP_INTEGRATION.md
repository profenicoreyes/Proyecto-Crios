# CRIOS Runtime Bootstrap Integration

## 1. Propósito
Documentar la integración controlada del bootstrap principal con publicaciones ejecutables en los modos explícitos `legacy` y `published`.

## 2. Alcance
A2-006E incorpora composición, resolución, adaptación, fijación de sesión, progreso particionado, recuperación y telemetría. No elimina el Runtime legacy, no modifica Studio y no ejecuta RT-001 a RT-008.

## 3. Estado previo
A2-006B, A2-006C y A2-006D estaban completos. La API `CRIOS_RUNTIME_EXECUTABLE_PUBLICATION` 1.0.0 resolvía publicaciones de forma aislada y las siete suites previas sumaban 595 pruebas.

## 4. Arquitectura
`crios.js` fija el modo una vez al cargar. Legacy conserva el camino anterior. Published espera identidad válida, obtiene el adaptador desde `CRIOS_DOMAIN`, resuelve y adapta antes de crear sesión, progreso, navegación o transmisión. Un fallo devuelve un error plano y bloquea atómicamente.

## 5. Archivos
Nuevos: `js/runtime/bootstrap/runtime-bootstrap-adapter.js`, `tests/runtime-bootstrap-integration.test.html`, `tests/runtime-bootstrap-integration.test.js` y este documento. Modificados: `index.html`, `js/config.js` y `js/crios.js`. No se modificaron módulos de publicación, Runtime Missions, Studio ni suites anteriores.

## 6. Orden de carga
`index.html` carga Persistence, luego PublishedMissionSpec, AST segura, registro, handler declarativo, materializador y API de handlers. Después carga modelo, validador, resolver y API Runtime Publication. `crios.js` permanece al final. El adaptador es el último elemento de `DOMAIN_SCRIPT_PATHS`.

## 7. Configuración de modo
`CRIOS_CONFIG.runtimeCampaignMode` admite exactamente `legacy` o `published`. El valor predeterminado es `legacy`. Un valor desconocido se bloquea y nunca se interpreta como legacy.

## 8. Adaptador de bootstrap
El contrato interno `CRIOS_DOMAIN.runtimeBootstrapAdapter` tiene versión 1.0.0 y expone exactamente `prepareLegacyCampaign`, `preparePublishedCampaign`, `recoverPublishedCampaign` e `isPreparedRuntimeCampaign`. No existe `window.CRIOS_RUNTIME_BOOTSTRAP_ADAPTER`. Los datos estructurales son copias defensivas profundamente congeladas; los puentes UI quedan separados en `bridge`.

## 9. Dependencias
Published recibe por inyección Runtime Publication, Publication Core, Runtime Mission Handlers, Publication Persistence y telemetría. No copia PublishedMissionSpec, AST, handlers, materializador, canonicalización, SHA-256 ni PersistenceCoordinator.

## 10. Lectores persistentes
El adaptador crea el coordinador mediante `createPersistenceCoordinator` y usa solamente `activationStore.getActiveReference(campaignId)` y `publicationStore.getPublication(publicationId)`. No depende de `CRIOS_STUDIO` ni ejecuta operaciones administrativas.

## 11. Resolución de publicación
La resolución comienza después de validar la identidad y antes de `startSession`, progreso o transmisión. La API existente valida referencia, identidad, hash, contrato, manifiesto, handlers, specs, orden y materialización de forma atómica.

## 12. RNG determinista
Cada misión recibe un stream independiente derivado de identidad estable, campaignId, publicationId, publicationVersion, contentHash, missionId e índice. FinalEvaluation usa otro stream con identidad `finalEvaluation`. No hay cursor compartido, consumo previo oculto ni `Math.random` en el adaptador.

## 13. Adaptación de campaña
Las cuatro misiones `energy`, `greenhouse`, `ice` y `hangar` conservan el orden publicado. Identidad y metadata proceden de `materialization.mission`; datos de `generatedState`; contenido de `materialization.content`; handler y spec de la trazabilidad resuelta. Published no consulta `REGISTRO_MISIONES` para completar datos.

## 14. Evaluación final
Solo se acepta la forma cerrada con exactamente una operación `add` y una `subtract`, sin claves adicionales y con operandos finitos. Ambos valores se materializan con el stream final independiente y se presentan al puente como `adjustPlus` y `adjustMinus`. Una forma incompatible bloquea.

## 15. Sesión
La sesión published se crea solo después de resolución y conserva sourceMode, campaignId, id, publicationId, publicationVersion, contentHash, runtimeContractVersion, título y clasificación. Cada registro de misión conserva missionId, posición, handlerId, handlerVersion, publicationId y contentHash.

## 16. Trazabilidad
La relación inversa queda preservada desde la misión visible al puente, materialización, PublishedMissionSpec, ResolvedRuntimeCampaign, publicación y su campaignId/publicationId/contentHash. La telemetría no guarda specs, generatedState, respuestas ni operandos pedagógicos.

## 17. Progreso
Legacy conserva las claves anteriores. Published usa `campaignId@publicationId@contentHash`, por lo que dos publicaciones de la misma campaña no comparten progreso ni sobrescriben una versión anterior.

## 18. Recuperación
Una sesión published recupera la publicación exacta fijada sin consultar la referencia activa. Se valida nuevamente identidad, integridad y contrato, y se reconstruye con la misma derivación RNG. Publicación ausente, alterada o incompatible bloquea; nunca se salta a una versión nueva.

## 19. Política de fallo
Published bloquea referencia ausente, publicación ausente, identidad incoherente, hash inválido, contrato o manifiesto incompatibles, handler o versión ausentes, spec u orden inválidos, evaluación final incompatible, RNG inválida, materialización fallida y recuperación incoherente. No existe fallback silencioso a legacy.

## 20. Telemetría
El prefijo es `bootstrap-runtime:`. Se emiten mode-selected, resolution-started, active-reference-read, publication-read, publication-resolved, campaign-adapted, session-pinned, recovery-started, recovery-completed, blocked y completed según el camino recorrido. Solo se admiten modo, fase, IDs técnicos, versión, hash, código y resultado.

## 21. Seguridad
El adaptador no usa DOM, red, timers, eval, constructor Function, Math.random, storage directo ni CRIOS_STUDIO. Los lectores se reciben por el coordinador. No incluye datos personales ni payload pedagógico en telemetría. La UI legacy conserva su evaluador preexistente fuera del adaptador.

## 22. Compatibilidad legacy
El modo predeterminado sigue siendo legacy. Conserva cuatro misiones, registro, sesión, progreso, UI, evaluación, navegación y transmisión existentes. La aplicación principal cargó por HTTP con CRIOS, CRIOS.api y CRIOS_TRACE disponibles y sin crear una sesión real.

## 23. Pruebas
La nueva suite aislada ejecutó 152/152 PASS con storage falso, cero pageerrors, errores de consola o warnings. Las siete regresiones ejecutaron 595/595 PASS: Publication Core 50, Studio Publication 44, Activation 63, Persistence 89, Runtime Mission Materialization 128, Studio Executable Publication 100 y Runtime Executable Publication Resolution 121. Total real: 747/747 PASS.

## 24. Smoke
La aplicación principal en legacy mostró cuatro misiones y APIs operativas sin sesión real. Studio mostró cuatro misiones, APIs anteriores y panel operativo sin cargar el módulo de bootstrap. Los smoke aislados legacy y published pasaron mediante el harness con storage falso; published verificó resolución, orden, adaptación, evaluación final, pinning, recuperación, progreso separado, cero fallback y cero REGISTRO_MISIONES.

## 25. Integridad
El baseline autenticado externo contiene 121 entradas: 120 archivos iniciales y `.git/HEAD`. La comparación final admite exclusivamente cuatro archivos nuevos y tres modificados. El documento protegido A2-006D conserva 11474 bytes y SHA-256 `31109EAE1FEB3004D6BC9ECDCE7FEDA9BAE6604DFF1C542DBEF7E211CA368F2B`.

## 26. Rollback
Cambiar explícitamente `runtimeCampaignMode` a `legacy` desactiva el camino published sin borrar publicaciones, activaciones, sesiones o progreso. No hay rollback automático ni mutación administrativa.

## 27. Limitaciones
El puente mantiene la UI imperativa actual y no rediseña el modelo cerrado de Session. No migra progreso legacy, no elimina misiones legacy, no implementa seguimiento pedagógico adicional y no valida aún un despliegue publicado con datos administrativos reales.

## 28. Veredicto
RUNTIME_BOOTSTRAP_INTEGRATION_READY_FOR_CONTROLLED_RUNTIME_VALIDATION

## 29. Siguiente paso
Planificar la validación controlada del Runtime publicado sin iniciarla en este sprint.
