# CRIOS Runtime Mission Materialization

## 1. Propósito

Este documento registra la implementación de A2-006B: el contrato serializable de una misión publicable, su resolución por handler versionado y su materialización como misión ejecutable de Runtime. La implementación aplica el contrato vinculante de `PUBLISHABLE_MISSION_CONTRACT.md` sin integrar todavía publicaciones activas al arranque de Runtime.

## 2. Alcance

El alcance incluye modelos, validación, AST numérico seguro, registro de handlers, un handler declarativo de áreas, materializador, API pública aislada, cuatro fixtures y pruebas de navegador. No incluye A2-006C, integración con Studio, persistencia adicional, resolución de publicaciones activas ni cambios en `index.html` o `studio/index.html`.

## 3. Arquitectura

El flujo es `PublishedMissionSpec -> validación estructural -> resolución exacta handlerId@handlerVersion -> validación del payload -> materialización -> MaterializedRuntimeMission`. Los datos pedagógicos permanecen en el payload serializable. El código ejecutable pertenece al handler versionado y no se recupera del registro legado.

Los módulos internos comparten temporalmente `window.__CRIOS_RUNTIME_MISSION_INTERNAL__` durante la carga. La API final elimina ese nombre y expone un único global permanente: `window.CRIOS_RUNTIME_MISSION_HANDLERS`.

## 4. Archivos

| Archivo | Responsabilidad |
| --- | --- |
| `js/runtime/missions/published-mission-spec.js` | Modelo, clonación estricta, congelación y códigos contractuales |
| `js/runtime/missions/safe-expression.js` | Evaluación del AST numérico cerrado |
| `js/runtime/missions/mission-handler-registry.js` | Registro exacto, aislado y sellable |
| `js/runtime/missions/declarative-area-handler.js` | Validación y ejecución declarativa de misiones de áreas |
| `js/runtime/missions/mission-materializer.js` | Resolución y materialización controlada |
| `js/runtime/missions/mission-handlers-api.js` | API pública y registro predeterminado sellado |
| `tests/fixtures/publishable-mission-spec-fixtures.js` | Cuatro especificaciones independientes |
| `tests/runtime-mission-materialization.test.html` | Harness aislado de navegador |
| `tests/runtime-mission-materialization.test.js` | Suite de 128 pruebas |
| `docs/architecture/RUNTIME_MISSION_MATERIALIZATION.md` | Evidencia de arquitectura, pruebas, smoke e integridad del cierre |

## 5. PublishedMissionSpec

La raíz admite exactamente `missionId`, `handlerId`, `handlerVersion` y `payload`. La fábrica devuelve una copia defensiva profundamente congelada. La validación rechaza funciones, `undefined`, `bigint`, símbolos, números no finitos, ciclos, nodos DOM, prototipos personalizados, accessors, claves peligrosas y claves raíz desconocidas. Las versiones de handler usan SemVer numérico estricto.

## 6. Payload declarativo

El handler predeterminado exige cuatro secciones cerradas: `metadata`, `generation`, `presentation` y `assessment`. Metadatos, clasificación, narrativa, actividad, textos, accesibilidad, valores numéricos, fórmula, ayudas y escena quedan dentro del payload serializable y, por lo tanto, dentro del contenido publicable y hasheable.

## 7. AST seguro

Los nodos admitidos son `number`, `variable`, `add`, `subtract`, `multiply` y `divide`. Los nombres de variables son identificadores simples; no existe acceso a propiedades ni invocación de funciones. Los límites son profundidad máxima 32 y 256 nodos. Se rechazan variables ausentes, división por cero, resultados no finitos, nodos inválidos y operaciones no soportadas.

## 8. Registro de handlers

`createRuntimeMissionHandlerRegistry()` crea un registro privado vacío. `register`, `has` y `get` operan por identidad exacta `handlerId@handlerVersion`; no hay fallback de versión. `list` devuelve datos defensivos congelados. Un registro puede sellarse de forma idempotente y, una vez sellado, no admite altas ni reemplazos. Duplicar el mismo objeto y reemplazarlo por otro objeto producen errores diferenciados.

## 9. Handler declarativo

El handler incluido es `crios.geometry.declarative-area@1.0.0`. No contiene bifurcaciones por `missionId` ni datos particulares de una misión. Valida un vocabulario cerrado y materializa exclusivamente desde el spec recibido.

Las primitivas de escena admitidas son `rect`, `circle`, `polygon`, `line` y `text`; los roles fijos son `primary`, `accent`, `danger`, `label` y `muted`. No se admiten HTML o SVG arbitrarios, scripts, eventos, CSS libre, clases, URL, imágenes, paths, filtros, máscaras ni animaciones.

## 10. Generación determinista

La política declarada es `SEEDED_SEQUENCE_V1`. `generar(random, variant)` consume el RNG inyectado una vez por variable y en el orden publicado. Luego incorpora constantes y calcula derivados y respuesta mediante el AST seguro. No usa `Math.random`, timers ni estado ambiental. Igual secuencia y variante producen igual estado generado.

## 11. Plantillas y escenas

Las plantillas son texto plano con placeholders `{name}` previamente validados. Los valores se escapan antes de producir texto o markup de escena. El renderer emite un subconjunto SVG de estructura controlada usando solo primitivas, atributos y estilos definidos por el handler. La descripción de escena procede íntegramente del payload.

## 12. Materializador

`createMissionMaterializer({ registry })` permite inyectar un registro; la fábrica pública usa el registro predeterminado cuando no se provee uno. `materialize(spec, context)` valida el spec, resuelve exactamente el handler, valida su payload, materializa, comprueba que el spec no cambió y valida el contrato Runtime resultante. Los resultados de éxito y error se congelan profundamente.

## 13. MaterializedRuntimeMission

La forma exacta contiene `id`, `numero`, `titulo`, `nombreCorto`, `mapa`, `clasificacion`, `narrativa`, `tipoActividad`, `duracionEstimadaMinutos`, `etiquetas`, `mensajeAria`, `ejemploProcedimiento`, `handlerId`, `handlerVersion`, `generar` y `contenido`. La misión queda profundamente congelada y conserva la identidad del spec y del handler resuelto.

## 14. Misiones verificadas

Se materializaron cuatro specs independientes y sin imports del legado:

| missionId | Modelo declarativo |
| --- | --- |
| `energy` | Rectángulo menos zona dañada |
| `greenhouse` | Rectángulo menos triángulo y pérdida, más recuperación |
| `ice` | Cuadrado menos círculo, más recuperación y menos sellado |
| `hangar` | Área exterior menos recortes y bloqueo, más recuperación |

Las cuatro misiones validaron, materializaron, generaron estado determinista y produjeron contenido desde sus respectivos payloads.

## 15. API

`window.CRIOS_RUNTIME_MISSION_HANDLERS` tiene versión `1.0.0` y expone exactamente: `version`, `constants`, `createPublishedMissionSpec`, `validatePublishedMissionSpec`, `isPublishedMissionSpec`, `createRuntimeMissionHandlerRegistry`, `createMissionMaterializer`, `evaluateExpression`, `isMaterializedRuntimeMission`, `has`, `get` y `list`. La API, sus constantes y el handler predeterminado están congelados. El registro predeterminado no expone mutación pública.

## 16. Errores

El modelo define errores estructurados para spec inválido, identidad o versión ausente, handler inexistente, versión no soportada, duplicado, reemplazo prohibido, payload inválido o incompleto, fallo de materialización, misión materializada inválida, generación no determinista no declarada y mezcla con contenido legado. El AST añade errores para entorno o nodo inválido, variable ausente, operación no soportada, división por cero, resultado no finito y límites de profundidad o cantidad de nodos.

## 17. Pruebas

| Validación | Resultado |
| --- | --- |
| Suite A2-006B aislada | 128/128, PASS |
| Compilación externa de los ocho JS | 8/8, PASS |
| Publication Core | 50/50, PASS |
| Studio Publication Integration | 44/44, PASS |
| Publication Activation | 63/63, PASS |
| Publication Persistence | 89/89, PASS |
| Total de las cinco suites | 374/374, PASS |

Node no estuvo disponible en el entorno y se registró `NODE_NO_DISPONIBLE`. La validación sintáctica alternativa obtuvo los ocho archivos por HTTP y los compiló individualmente con `new Function(source)` como comprobación externa, sin autorizar ni introducir el constructor `Function` en producción: 8/8 PASS, sin errores.

Las cinco suites se ejecutaron por HTTP en páginas nuevas. El resultado agregado fue 374/374 PASS, con cero tests fallidos, cero `pageerror`, cero errores de consola y cero warnings relevantes. La suite aislada demostró las cuatro specs válidas y materializables, determinismo, orden y cantidad de llamadas RNG, textos y números desde payload, respuesta desde AST, escena desde descriptor, escape de texto y ausencia de mezcla legacy, DOM, storage, red, timers, `eval` y constructor `Function` en producción.

El smoke de la aplicación principal confirmó `CRIOS`, `CRIOS.api` y `CRIOS_TRACE`, cuatro misiones legacy, pantalla inicial operativa y ausencia de `CRIOS_RUNTIME_MISSION_HANDLERS`. El smoke de Studio confirmó `CRIOS_STUDIO`, las APIs exactas y congeladas de publicación, activación y persistencia, el panel operativo con cuatro misiones y ausencia de la API nueva. El harness aislado confirmó la API exacta, el registro predeterminado sellado, el handler `crios.geometry.declarative-area@1.0.0`, las cuatro fixtures materializables y cero globals inesperados. Los tres smoke finalizaron con cero `pageerror`, cero errores de consola y cero warnings relevantes.

## 18. Limitaciones

El único handler implementado cubre el vocabulario declarativo de geometría de áreas. Nuevas familias pedagógicas requieren handlers y versiones explícitos. La generación depende de un RNG determinista inyectado por el futuro consumidor. Este sprint no selecciona publicaciones activas, no migra datos persistidos y no conecta el materializador al arranque de Runtime ni a Studio.

## 19. Integridad

No se encontró fuera del repositorio una pareja válida `crios-a2-006b-baseline-*.json` y `crios-a2-006b-pointer-*.json` perteneciente a la ejecución que creó A2-006B. Por lo tanto, no se afirma una comparación retroactiva y se registra `INTEGRIDAD_HISTORICA_A2_006B_NO_RECONSTRUIBLE`.

La integridad actual se verificó mediante un baseline de cierre externo al repositorio con 143 archivos iniciales, escritos y releídos; cero rutas nulas, vacías, duplicadas, absolutas, con barras inversas o iniciadas por `/`; `.git/HEAD`, `index.html` y cada uno de los diez artefactos presentes exactamente una vez; y hash del baseline coincidente con su puntero. Los seis documentos protegidos conservaron exactamente sus tamaños y SHA-256 esperados, incluido `PUBLISHABLE_MISSION_CONTRACT.md` con 39209 bytes y SHA-256 `6AB4001E66F76054E4F693BF2DAA0D836A20B8E298FD148474848B293EAD2AB2`.

Durante este cierre no se modificaron `index.html`, `studio/index.html`, `js/crios.js`, las misiones legacy ni `.git`. La única corrección documental permitida fue este informe. La comparación final contra el baseline de cierre debe registrar como única diferencia `docs/architecture/RUNTIME_MISSION_MATERIALIZATION.md`. La API de handlers no se carga en la aplicación principal ni en Studio; ambas conservan cuatro misiones legacy y sus entradas operativas.

## 20. Veredicto

`RUNTIME_MISSION_MATERIALIZATION_READY_FOR_PUBLICATION_INTEGRATION`

La frontera serializable/ejecutable definida en A2-006A quedó implementada y comprobada de forma aislada. El siguiente paso es el Sprint A2-006C — Publicación de especificaciones ejecutables, que puede integrar esta capacidad sin recuperar funciones desde `REGISTRO_MISIONES` y sin mezclar contenido fuera de la publicación.