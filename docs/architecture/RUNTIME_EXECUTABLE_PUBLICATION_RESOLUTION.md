# CRIOS - Resolucion Runtime de publicaciones ejecutables

## 1. Proposito

Este documento registra la implementacion y la evidencia de A2-006D. El sprint incorpora una capa Runtime aislada capaz de resolver una referencia activa inyectada, recuperar la publicacion correspondiente, verificar su integridad y contrato ejecutable, materializar todas sus misiones y producir un `ResolvedRuntimeCampaign` autocontenido.

El veredicto de este documento habilita solamente la planificacion de una integracion posterior. No habilita ni realiza cambios en el arranque principal.

## 2. Alcance

El alcance se limita a cuatro modulos nuevos bajo `js/runtime/publication`, una suite aislada HTML/JavaScript y este documento. La implementacion no registra misiones en el Runtime existente, no cambia la seleccion legacy y no consulta directamente subsistemas de Studio, almacenamiento, red o interfaz.

Declaraciones expresas:

- no se conecto el arranque principal;
- no se modifico Studio;
- no se modifico Publicacion;
- no se modifico Activacion;
- no se modifico Persistencia;
- no se modificaron misiones legacy;
- no se ejecutaron RT-001 a RT-008;
- el siguiente paso sera la integracion controlada con el bootstrap de Runtime.

## 3. Arquitectura

La capa usa IIFE de navegador y separa cuatro responsabilidades:

1. modelo y primitivas de clonacion, congelacion, resultados y errores;
2. validacion de publicacion ejecutable;
3. resolucion atomica y materializacion;
4. exposicion de una unica API publica permanente.

Durante la carga existe un namespace interno temporal. La API final lo elimina y expone solamente `window.CRIOS_RUNTIME_EXECUTABLE_PUBLICATION`. Ningun modulo se conecta desde `index.html`, `crios.js` u otro bootstrap.

## 4. Archivos

- `js/runtime/publication/runtime-publication-model.js`: constantes, errores, clones, congelacion y reconocimiento del modelo resuelto.
- `js/runtime/publication/runtime-publication-validator.js`: hash, manifiesto, handlers, specs y evaluacion final.
- `js/runtime/publication/runtime-publication-resolver.js`: lectura inyectada, correspondencia de identidad, RNG y materializacion atomica.
- `js/runtime/publication/runtime-publication-api.js`: API publica exacta `1.0.0` y retiro del namespace temporal.
- `tests/runtime-executable-publication-resolution.test.html`: entorno aislado, orden de carga y telemetria temprana.
- `tests/runtime-executable-publication-resolution.test.js`: pruebas contractuales y de seguridad.
- `docs/architecture/RUNTIME_EXECUTABLE_PUBLICATION_RESOLUTION.md`: arquitectura, evidencia y veredicto.

## 5. Dependencias

`createRuntimePublicationResolver` exige inyeccion explicita de:

- `activeReferenceReader(campaignId)`;
- `publicationReader(publicationId, campaignId)`;
- `publicationCore` con `isPublishedCampaign`, `buildCanonicalContent` y `calculateContentHash`;
- `missionHandlersApi` con validacion, registro, disponibilidad y factory de materializador;
- `rngFactory`, al crear el resolver o al resolver una campana.

Las dependencias se capturan en el cierre del resolver. No existe importacion implicita desde Studio, Activacion, Persistencia ni globals de dominio alternativos.

## 6. Modelo

`ResolvedRuntimeCampaign` tiene exactamente:

- identidad: `campaignId`, `publicationId`, `publicationVersion`, `contentHash`;
- contrato: `runtimeContractVersion`, `requiredHandlers`, `missionOrder`;
- contenido ejecutable resuelto: `missions`, `finalEvaluation`;
- evidencia de resolucion: `resolutionMetadata`.

Cada mision conserva `missionId`, `handlerId`, `handlerVersion`, `missionIndex`, `publishedSpec` y `materialization`. Esta ultima contiene snapshots serializables de `mission`, `generatedState` y `content`. Las funciones `generar` y `contenido` se ejecutan durante la resolucion y no forman parte del resultado publico.

El modelo exige claves exactas, valores serializables, identidad coincidente entre spec, mision y materializacion, orden unico, handlers requeridos unicos y una relacion bidireccional entre handlers declarados y usados. La raiz y todos sus descendientes deben estar congelados.

## 7. Validacion

La validacion falla de forma cerrada. Primero comprueba las APIs inyectadas y el contrato `PublishedCampaign`. Luego valida integridad, manifiesto, specs, disponibilidad exacta de handlers y evaluacion final.

No se materializa ninguna mision mientras exista una incidencia de validacion. Los resultados de exito y error tienen forma exacta `{ success, campaign, error }`; los errores estables tienen `{ code, message, path, metadata }` y no exponen stack.

## 8. Integridad

El hash no se acepta por confianza. La capa reconstruye el contenido canonico con `schemaVersion` y `content`, calcula SHA-256 mediante Publication Core y compara el valor obtenido con `contentHash`.

Despues comprueba que la identidad completa de la publicacion coincide con la referencia activa: `campaignId`, `publicationId`, `version` y `contentHash`. Una diferencia evita toda materializacion.

## 9. Manifiesto

`runtimeExecutionManifest` debe tener exactamente:

- `runtimeContractVersion` igual a `1.0.0`;
- `requiredHandlers`;
- `missionCount`;
- `missionOrder`.

`missionCount` debe coincidir con la cantidad de specs. `missionOrder` debe coincidir por indice con cada `missionId`. Los IDs no pueden estar vacios ni repetidos. `requiredHandlers` debe derivar exactamente, en orden de primera aparicion, de las specs publicadas.

## 10. Handlers

La resolucion exige disponibilidad de la pareja exacta `handlerId@handlerVersion`. No existe downgrade, seleccion de ultima version ni fallback. El contrato validado en A2-006D usa `crios.geometry.declarative-area@1.0.0` para las cuatro misiones.

Se distinguen errores por handler inexistente y version inexistente. El modelo final vuelve a verificar que cada mision use un handler requerido y que cada handler requerido sea usado por al menos una mision.

## 11. Materializacion

El orden de materializacion es el orden publicado: `energy`, `greenhouse`, `ice`, `hangar`. Para cada spec, el materializador inyectado valida y crea una mision. El resolver ejecuta `generar(rng, index)` y despues `contenido(generatedState)`.

La operacion es atomica desde la perspectiva publica: las misiones se acumulan en una variable local y el `ResolvedRuntimeCampaign` solo se crea cuando todas finalizaron correctamente. Ante cualquier fallo, el resultado contiene `campaign: null`; no se entrega una campana parcial.

## 12. Determinismo

La politica publica es `INJECTED_PER_MISSION_V1`. La factory recibe `missionId`, indice y una copia profundamente congelada de la publicacion. Debe devolver una funcion RNG.

Cada mision obtiene su RNG de forma independiente. Con la misma publicacion y las mismas secuencias inyectadas, el resultado es reproducible. Produccion no usa `Math.random` y no comparte cursores RNG entre misiones.

## 13. Errores

Los codigos estables cubren identificador invalido, referencia ausente o incoherente, publicacion ausente o con identidad incoherente, hash alterado, contrato no soportado, manifiesto invalido, cantidades u orden incorrectos, IDs duplicados, specs invalidas, handlers o versiones ausentes, materializacion fallida, evaluacion final invalida, resultado resuelto invalido y error general de resolucion.

Las excepciones de dependencias se convierten en resultados fallidos. Los metadatos conservan solo informacion serializable y no incluyen objetos de excepcion, funciones ni stack.

## 14. Seguridad

Los cuatro modulos de produccion no acceden a Studio, `localStorage`, `sessionStorage`, IndexedDB, red, DOM ni timers. No usan `eval`, constructor `Function`, `Math.random` ni fallback legacy. La publicacion y los datos inyectados se clonan antes de exponerse.

La API publica, sus constantes, los resultados, los errores y la campana resuelta se congelan profundamente. El resultado no contiene funciones y puede serializarse sin perder su contrato publico.

## 15. API

La API publica exacta es `window.CRIOS_RUNTIME_EXECUTABLE_PUBLICATION`, version `1.0.0`, con:

- `constants`;
- `createRuntimePublicationResolver`;
- `isResolvedRuntimeCampaign`;
- `validateExecutablePublication`;
- `version`.

La factory devuelve un objeto congelado con un unico metodo: `resolveActiveCampaign`. El namespace interno temporal se elimina despues de construir la API.

## 16. Pruebas

La suite nueva ejecuta 121 pruebas reales. Cubre forma y congelacion de API, errores, referencia activa, identidad, hash, contrato, manifiesto, handlers, specs, orden, evaluacion final, materializacion de cuatro misiones, determinismo, aislamiento RNG, atomicidad, serializacion, congelacion profunda, verificacion inversa y limites de seguridad.

Resultado final de la suite: `121/121 PASS`, `0` fallos, `0` pageerrors, `0` errores de consola y `0` warnings.

Las seis regresiones anteriores totalizan `474/474 PASS`. El acumulado demostrado es `595/595 PASS`.

Node no esta disponible en el entorno. La sintaxis se valido externamente en navegador y la ejecucion real se demostro en Edge.

## 17. Smoke

La aplicacion principal carga sin pageerrors, rechazos ni errores de consola. Mantiene cuatro misiones legacy activas y una campana legacy de cuatro misiones. La API nueva no aparece porque el bootstrap principal no fue conectado.

Studio carga y mantiene sus APIs de Publicacion, Activacion, Persistencia y `missionSpecs`; el panel de compatibilidad sigue operativo y una publicacion ejecutable se puede recuperar. La API Runtime nueva tampoco aparece en Studio.

La pagina aislada expone la API exacta, resuelve cuatro misiones en orden, conserva evaluacion final y trazabilidad inversa, congela profundamente el resultado y no registra telemetria adversa.

## 18. Limitaciones

La capa aun requiere lectores y RNG inyectados por un consumidor. No decide como seleccionar campana al arrancar, no reemplaza el registro legacy, no administra sesiones y no persiste resultados. Tampoco conecta UI ni activa publicaciones.

La integracion con el bootstrap debera definir ownership y ciclo de vida de las dependencias sin debilitar la validacion, la atomicidad ni el aislamiento demostrado aqui.

## 19. Integridad del sprint

El baseline autenticado contiene 149 archivos. A2-006D autoriza solamente los siete archivos enumerados en la seccion 4. No se permiten modificaciones ni eliminaciones respecto del baseline.

La comprobacion final debe recorrer ambas direcciones: todo archivo final debe pertenecer al baseline o al conjunto autorizado; toda ruta autorizada debe existir una sola vez; todo archivo del baseline debe conservar tamano y SHA-256; `.git` y los 23 artefactos protegidos deben permanecer intactos.

No se creo ningun commit y no se limpio ni reorganizo el worktree preexistente.

## 20. Veredicto

La capa resuelve una publicacion activa inyectada, verifica identidad e integridad, exige el manifiesto y handlers exactos, valida las cuatro specs y la evaluacion final, materializa atomicamente con RNG inyectado y devuelve un resultado autocontenido, serializable y profundamente congelado.

**RUNTIME_EXECUTABLE_PUBLICATION_RESOLUTION_READY_FOR_BOOTSTRAP_INTEGRATION**

El siguiente paso sera la integracion controlada con el bootstrap principal de Runtime. Ese paso queda fuera de A2-006D y no fue iniciado.