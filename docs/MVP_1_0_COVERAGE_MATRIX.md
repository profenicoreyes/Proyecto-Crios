# CRIOS MVP 1.0 — matriz de cobertura

## 1. Baseline

- Rama: `main`.
- Commit funcional aceptado: `a01a89f71fb7a8063ac3994011b798459416a6a0`.
- Asunto: `fix(mvp): complete visual acceptance`.
- Commit del runner E2E completo: `99ce2f790c409cbac748ea0b2e636f03cdb9c99c`.
- Commit de caracterización visual: `bc94b846d1504bafee60e3a73a8c44d04d4f6310`.
- Contrato: `docs/MVP_1_0.md`.
- Matriz inicial: commit `8f8d154ccb5ec1aad12a4e2aa4ddd411a167f8a2`.
- Esta actualización no modifica producción ni amplía el alcance del MVP.

## 2. Base de evidencia

La clasificación utiliza:

- inspección estática del repositorio completo compartido;
- contratos y módulos de Studio, Publication, Activation, Persistence, Runtime, Session, Evaluation, Progress, Navigation, PlayerState y Game Flow;
- runners versionados existentes;
- resultados de cierre ya confirmados hasta A2-016;
- evidencia A2-016C de 141/141 sobre árbol limpio;
- evidencia A2-017C1 de 110/110 para el recorrido `published` integral;
- evidencia A2-017D de 166/166 y revisión visual manual aprobada;
- evidencia A2-017E de 417/417 en la validación agregada;
- contratos y límites registrados en ROADMAP.

No se considera demostrada una capacidad únicamente porque exista código para ella. Para marcar `DEMOSTRADO` debe existir evidencia focal o E2E que cubra el comportamiento relevante. `PARCIAL` indica que hay implementación y evidencia cercana, pero falta el recorrido exacto exigido por el MVP. `SIN_EVIDENCIA` no implica necesariamente un defecto.

## 3. Resumen

| Estado | Cantidad |
|---|---:|
| DEMOSTRADO | 37 |
| PARCIAL | 9 |
| SIN_EVIDENCIA | 0 |
| DEFECTO_CONFIRMADO | 0 |
| **Total** | **46** |

La matriz inicial resumía por error 36 criterios, aunque su tabla detallada contenía 46. Esta actualización corrige únicamente el conteo documental.

La arquitectura y el recorrido funcional necesarios para el MVP ya existen. A2-017C1 completó 110/110 comprobaciones sobre el flujo `published`, sin errores de página, consola, warnings ni promesas no controladas y sin modificar producción.

Las brechas restantes no bloquean el recorrido feliz aceptado y se limitan a:

1. caracterización publicada específica de rollback, reintento incorrecto y game over;
2. cobertura E2E adicional de aislamiento y limpieza entre campañas;
3. recorrido completo en más viewports angostos y revisión de todos los mensajes de bloqueo posibles;
4. bundle verificado y limpieza externa del cierre.

## 4. Matriz detallada

### 4.1 Studio, publicación y lanzamiento

| ID | Criterio | Estado | Evidencia existente | Brecha restante |
|---|---|---|---|---|
| MVP-PUB-01 | Existe una campaña demostrativa con dos o más misiones ejecutables. | DEMOSTRADO | Catálogo Antártida con `energy`, `greenhouse`, `ice` y `hangar`; catálogo declarativo de cuatro specs; suite de publicación ejecutable. | Ninguna para el contenido mínimo. |
| MVP-PUB-02 | Studio permite preparar una campaña y agregar misiones. | DEMOSTRADO | Campaign Draft, adaptador de Studio y runner publicado que carga cuatro misiones antes de publicar. | Ninguna dentro del alcance. |
| MVP-PUB-03 | La campaña puede publicarse y persistirse localmente. | DEMOSTRADO | Publication Core, Persistence y E2E de lanzamiento publicado. | Ninguna. |
| MVP-PUB-04 | Publicar no activa automáticamente. | DEMOSTRADO | Suites de publicación, activación y persistencia. | Ninguna. |
| MVP-PUB-05 | Studio solo ofrece abrir una publicación activa y persistida. | DEMOSTRADO | `studio-runtime-launch`, integración de Studio y E2E operativo. | Ninguna. |
| MVP-PUB-06 | El enlace utiliza el constructor canónico de referencia `published`. | DEMOSTRADO | Runtime Launch Contract, Studio Runtime Launch y cierre A2-014. | Ninguna. |
| MVP-PUB-07 | Una referencia `published` inválida no cae silenciosamente en legacy. | DEMOSTRADO | Runtime Launch Selection y E2E de publicación desactivada o corrupta. | Ninguna. |
| MVP-PUB-08 | Desactivar bloquea el lanzamiento y reactivar lo restaura. | DEMOSTRADO | Publication Activation y E2E operativo de desactivación/reactivación. | Ninguna. |
| MVP-PUB-09 | Publicaciones corruptas o incompatibles se bloquean sin sustitución. | DEMOSTRADO | Persistence, Runtime Publication Validator y E2E de corrupción. | Ninguna. |

### 4.2 Identidad y sesión

| ID | Criterio | Estado | Evidencia existente | Brecha restante |
|---|---|---|---|---|
| MVP-SES-01 | La identidad se confirma mediante controles visibles. | DEMOSTRADO | Formulario real con nombre, personaje y grupo; E2E completa la identificación. | Ninguna para el inicio. |
| MVP-SES-02 | La sesión conserva campaña, publicación, modo, identidad y escenario. | DEMOSTRADO | Session, Runtime Bootstrap, Published Domain Bridge y cierre A2-014. | Ninguna. |
| MVP-SES-03 | Una recarga `published` vuelve a pedir confirmación de identidad. | DEMOSTRADO | E2E de reanudación publicada. | Ninguna. |
| MVP-SES-04 | La recarga conserva `idSesion`, publicación y misión resuelta. | DEMOSTRADO | A2-017C1 conserva el mismo `idSesion`, publicación y progreso después de dos misiones y después de la finalización. | Ninguna. |
| MVP-SES-05 | Una entrada legacy explícita no reutiliza una sesión publicada. | DEMOSTRADO | E2E de sesión publicada obsoleta y recuperación legacy. | Ninguna. |
| MVP-SES-06 | Campañas y publicaciones distintas no comparten estado accidentalmente. | DEMOSTRADO | Runtime Launch Selection, Persistence y aislamiento de claves/sesiones. | Falta una comprobación integral con dos campañas reales, no necesaria para la demo mínima. |
| MVP-SES-07 | Cerrar la sesión permite comenzar otra identidad sin residuos. | DEMOSTRADO | A2-017C1 elimina sesión, progreso, finalización e identidad; preserva la publicación y crea un `idSesion` nuevo con 0/4 misiones. | Ninguna. |

### 4.3 Misiones, evaluación y Game Flow

| ID | Criterio | Estado | Evidencia existente | Brecha restante |
|---|---|---|---|---|
| MVP-FLOW-01 | Las misiones publicadas se materializan sin depender del registro legacy. | DEMOSTRADO | Runtime Mission Materialization y cierre A2-014. | Ninguna. |
| MVP-FLOW-02 | La primera misión publicada puede abrirse y resolverse correctamente. | DEMOSTRADO | Published Launch Operational E2E resuelve `energy` y guarda el progreso. | Ninguna para una misión. |
| MVP-FLOW-03 | Evaluation, PlayerState, Progress, Runtime y Navigation están conectados. | DEMOSTRADO | Game Flow Core, adaptador, modelos y cierre A2-013. | Ninguna en contratos. |
| MVP-FLOW-04 | El orden de Game Flow se respeta durante una misión real. | PARCIAL | Integración real de navegador 24/24 en el camino legacy; el camino publicado usa la misma función de evaluación. | Falta una aserción E2E explícita en modo `published`. |
| MVP-FLOW-05 | Runtime se reconstruye una vez y Navigation se resuelve una vez. | PARCIAL | Demostrado en integración legacy y coherencia local. | Falta medirlo durante la aceptación publicada completa. |
| MVP-FLOW-06 | Un fallo posterior a Progress no persiste estado parcial. | PARCIAL | Rollback real demostrado en integración legacy. | Falta escenario equivalente publicado o justificar formalmente la reutilización exacta del borde. |
| MVP-FLOW-07 | Una respuesta incorrecta mantiene la misión disponible para reintentar. | PARCIAL | Demostrado en integración legacy; lógica compartida visible en producción. | Falta comprobarlo en `published`. |
| MVP-FLOW-08 | Game over restaura el estado sin cambiar de misión ni corromper progreso. | PARCIAL | Integración legacy y Runtime Local State Coherence. | Falta decidir si el MVP publicado debe aceptar este escenario y probarlo. |
| MVP-FLOW-09 | Dos o más misiones publicadas se completan secuencialmente. | DEMOSTRADO | A2-017C1 resuelve `energy`, `greenhouse`, recarga, y luego `ice` y `hangar` mediante controles visibles. | Ninguna. |
| MVP-FLOW-10 | La última misión desbloquea el protocolo final. | DEMOSTRADO | A2-017C1 confirma el botón final deshabilitado con 0/4 y 2/4, y habilitado con 4/4. | Ninguna. |
| MVP-FLOW-11 | El protocolo final puede resolverse y abre créditos. | DEMOSTRADO | A2-017C1 construye el procedimiento visible, obtiene `836`, persiste el resultado y abre créditos. | Ninguna. |
| MVP-FLOW-12 | La finalización es estable y no se duplica al reintentar. | DEMOSTRADO | A2-017C1 conserva `final.answerCorrect`, `complete`, evaluación, envío y el mismo `idSesion` después de recargar. | Ninguna dentro del recorrido aceptado. |

### 4.4 Persistencia y recuperación

| ID | Criterio | Estado | Evidencia existente | Brecha restante |
|---|---|---|---|---|
| MVP-REC-01 | El progreso de una misión publicada sobrevive a la recarga. | DEMOSTRADO | E2E conserva la misión `energy` resuelta y el mismo `idSesion`. | Ninguna para una misión. |
| MVP-REC-02 | Una publicación desactivada no crea sesión ni misiones. | DEMOSTRADO | E2E de desactivación. | Ninguna. |
| MVP-REC-03 | Persistencia corrupta se bloquea y no se borra automáticamente. | DEMOSTRADO | Persistence y E2E de corrupción. | Ninguna. |
| MVP-REC-04 | Limpiar una sesión no elimina publicaciones ni campañas ajenas. | PARCIAL | Stores y claves separadas están probados; `resetProgress` elimina claves concretas de sesión. | Falta E2E desde la interfaz. |
| MVP-REC-05 | Puede iniciarse una nueva sesión después de cerrar o invalidar la anterior. | DEMOSTRADO | A2-017C1 crea una sesión publicada nueva, con identificador distinto, progreso 0/4 y final bloqueado. | Ninguna. |
| MVP-REC-06 | Una campaña completada se reanuda como completada. | DEMOSTRADO | A2-017C1 recarga después de créditos y conserva las cuatro misiones, el final correcto, `complete=true`, 100 % y el mismo `idSesion`. | Ninguna. |

### 4.5 Interfaz y experiencia de uso

| ID | Criterio | Estado | Evidencia existente | Brecha restante |
|---|---|---|---|---|
| MVP-UX-01 | Inicio, identidad, campaña, mapa y misión tienen controles visibles. | DEMOSTRADO | A2-017C1 recorre identidad, entrada, mapa, cuatro misiones, protocolo final, créditos y nueva sesión. | Ninguna funcional. |
| MVP-UX-02 | No se necesitan herramientas de desarrollo para el recorrido principal. | DEMOSTRADO | A2-017C1 opera el recorrido principal mediante los controles visibles de Studio y CRIOS. | Ninguna funcional. |
| MVP-UX-03 | Los bloqueos muestran mensajes comprensibles y una salida posible. | PARCIAL | Mensajes de publicación no disponible y fallback legacy comprobados. | Revisar todos los fallos del recorrido MVP, no solo lanzamiento. |
| MVP-UX-04 | El acceso esencial funciona en viewport angosto. | PARCIAL | Corrección y smoke del acceso a campaña en pantalla angosta cerrados en A2-011. | Falta recorrer publicación, misiones y final completo en ese viewport. |
| MVP-UX-05 | No hay solapamientos, scroll bloqueante ni controles fuera de pantalla. | DEMOSTRADO | A2-017D ejecutó 166/166, confirmó ausencia de overflow horizontal y controles críticos fuera del viewport; la revisión manual corrigió y volvió a revisar ocho defectos reales. | Ninguna para los checkpoints aceptados. |
| MVP-UX-06 | Contrastes y estados disabled/hidden permiten comprender las acciones. | DEMOSTRADO | A2-017D verificó estados visibles, ocultos y deshabilitados durante 14 checkpoints; la revisión manual final aprobó composición y legibilidad. | Ninguna para el recorrido aceptado. |
| MVP-UX-07 | A.R.I.A. usa mensajes breves, claros y no infantiles. | DEMOSTRADO | Revisión manual del recorrido desde identidad hasta créditos y sesión nueva. | Ninguna para el recorrido aceptado. |

### 4.6 Calidad técnica y release

| ID | Criterio | Estado | Evidencia existente | Brecha restante |
|---|---|---|---|---|
| MVP-QA-01 | Contratos focales y regresiones relacionadas están aprobados. | DEMOSTRADO | Cierres A2-013 a A2-016; A2-016C 141/141. | Volver a ejecutarlos tras cualquier cambio futuro. |
| MVP-QA-02 | Los recorridos existentes terminan sin errores de página, consola o promesas. | DEMOSTRADO | A2-017C1 registra 0 errores de página, consola, warnings y promesas no controladas en la aceptación integral; cleanup de storage y frames confirmado. | Ninguna para el recorrido actual. |
| MVP-QA-03 | Existe un runner durable para el recorrido MVP completo. | DEMOSTRADO | `tests/mvp-e2e-characterization.test.html` y `.js`, versionados en `99ce2f7…`, aprobaron 110/110. | Ninguna. |
| MVP-QA-04 | La versión tiene instrucciones breves de uso. | DEMOSTRADO | `docs/MVP_1_0_USER_GUIDE.md` documenta publicación, activación, recorrido, recarga, sesión nueva, bloqueos y límites. | Ninguna. |
| MVP-QA-05 | El cierre produce commit, bundle verificado y limpieza. | PARCIAL | El procedimiento está probado en tramos anteriores. | Ejecutarlo para el commit final del MVP. |

## 5. Decisión de arquitectura

La aceptación integral no confirmó defectos productivos. No se autoriza una nueva extracción arquitectónica para cerrar el MVP.

En particular, A2-017 no necesita:

- eliminar legacy;
- cambiar el modo predeterminado;
- convertir RuntimeCore o NavigationCore en factorías puras;
- mover todos los efectos fuera de `js/crios.js`;
- agregar backend, sincronización o multiusuario;
- crear nuevos tipos de misión.

A2-017C1 demuestra que el código actual ya soporta el recorrido funcional obligatorio.

## 6. Evidencia A2-017C1

- commit: `99ce2f790c409cbac748ea0b2e636f03cdb9c99c`;
- total: 110;
- aprobadas: 110;
- fallidas: 0;
- misiones: `energy`, `greenhouse`, `ice`, `hangar`;
- protocolo final esperado y obtenido: `836`;
- recarga intermedia: aprobada;
- recarga posterior a la finalización: aprobada;
- nueva sesión después del reset: aprobada;
- errores de página, consola, frames y promesas: 0;
- warnings: 0;
- cleanup de localStorage, sessionStorage y frames: aprobado;
- producción modificada: no;
- defectos productivos confirmados: 0.

## 7. Evidencia A2-017D y A2-017E

### A2-017D — aceptación visual

- commit de caracterización: `bc94b846d1504bafee60e3a73a8c44d04d4f6310`;
- commit funcional: `a01a89f71fb7a8063ac3994011b798459416a6a0`;
- comprobaciones automatizadas: 166/166;
- capturas por corrida: 14;
- revisión visual manual: aprobada;
- defectos visuales confirmados y corregidos: 8;
- overflow horizontal: 0;
- controles críticos fuera del viewport: 0;
- errores de página, consola, warnings y promesas: 0.

### A2-017E — validación agregada

- commit validado: `a01a89f71fb7a8063ac3994011b798459416a6a0`;
- regresiones de arquitectura y compatibilidad: 141/141;
- recorrido MVP publicado: 110/110;
- aceptación visual: 166/166;
- total: 417/417;
- fallidas: 0;
- árbol de trabajo: limpio;
- staging: vacío;
- archivos sin seguimiento o eliminados: 0;
- `git diff --check`: aprobado.

## 8. Próximo tramo recomendado

### A2-017E — cierre documental, bundle y limpieza

1. versionar esta matriz, la guía breve, el contrato actualizado, el README y el roadmap;
2. crear un bundle Git del commit documental de cierre;
3. verificar HEAD, rama, tamaño y SHA-256 del bundle;
4. eliminar los respaldos obsoletos y temporales de A2-017 únicamente después de verificar el nuevo bundle;
5. conservar el repositorio, `_tools` y un único respaldo vigente.

## 9. Definición de cierre de esta actualización

La actualización queda cerrada cuando se versionan:

- la aceptación funcional 110/110;
- la aceptación visual 166/166 y su revisión manual;
- la validación agregada 417/417;
- la reclasificación a 37 criterios demostrados, 9 parciales y 0 sin evidencia;
- la guía de uso y los límites no bloqueantes;
- la decisión de no abrir nuevas refactorizaciones para cerrar el MVP.
