# CRIOS MVP 1.0 — matriz de cobertura

## 1. Baseline

- Rama prevista: `main`.
- Commit de contrato del MVP: `f4399e1d819306a4f861aad37ff8527243171add`.
- Asunto: `docs(mvp): define CRIOS 1.0 acceptance contract`.
- Documento contractual: `docs/MVP_1_0.md`.
- Esta matriz no modifica producción ni amplía el alcance del MVP.

## 2. Base de evidencia

La clasificación utiliza:

- inspección estática del repositorio completo compartido;
- contratos y módulos de Studio, Publication, Activation, Persistence, Runtime, Session, Evaluation, Progress, Navigation, PlayerState y Game Flow;
- runners versionados existentes;
- resultados de cierre ya confirmados hasta A2-016;
- evidencia A2-016C de 141/141 sobre árbol limpio;
- contratos y límites registrados en ROADMAP.

No se considera demostrada una capacidad únicamente porque exista código para ella. Para marcar `DEMOSTRADO` debe existir evidencia focal o E2E que cubra el comportamiento relevante. `PARCIAL` indica que hay implementación y evidencia cercana, pero falta el recorrido exacto exigido por el MVP. `SIN_EVIDENCIA` no implica necesariamente un defecto.

## 3. Resumen

| Estado | Cantidad |
|---|---:|
| DEMOSTRADO | 20 |
| PARCIAL | 11 |
| SIN_EVIDENCIA | 5 |
| DEFECTO_CONFIRMADO | 0 |
| **Total** | **36** |

La arquitectura necesaria para el MVP ya existe. No se identificó mediante inspección estática un defecto nuevo que justifique modificar producción antes de ejecutar la aceptación integral.

Las brechas principales son:

1. recorrido `published` completo a través de dos o más misiones;
2. desbloqueo y ejecución del protocolo final;
3. persistencia y reanudación después de completar la campaña;
4. cierre de sesión y comienzo limpio de una nueva;
5. auditoría visual del recorrido completo en notebook y viewport angosto.

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
| MVP-SES-04 | La recarga conserva `idSesion`, publicación y misión resuelta. | DEMOSTRADO | E2E operativo ampliado. | Falta comprobarlo después de varias misiones y finalización. |
| MVP-SES-05 | Una entrada legacy explícita no reutiliza una sesión publicada. | DEMOSTRADO | E2E de sesión publicada obsoleta y recuperación legacy. | Ninguna. |
| MVP-SES-06 | Campañas y publicaciones distintas no comparten estado accidentalmente. | DEMOSTRADO | Runtime Launch Selection, Persistence y aislamiento de claves/sesiones. | Falta una comprobación integral con dos campañas reales, no necesaria para la demo mínima. |
| MVP-SES-07 | Cerrar la sesión permite comenzar otra identidad sin residuos. | PARCIAL | Existe `resetProgress` y limpieza de claves de sesión. | Falta E2E de cierre, nueva identidad y nueva sesión publicada. |

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
| MVP-FLOW-09 | Dos o más misiones publicadas se completan secuencialmente. | SIN_EVIDENCIA | Existen cuatro misiones y navegación entre ellas, pero el E2E publicado cerrado resuelve solo la primera. | Crear escenario E2E multi-misión. |
| MVP-FLOW-10 | La última misión desbloquea el protocolo final. | SIN_EVIDENCIA | `updateMap` habilita `finalBtn` cuando todas están completas. | Falta comprobarlo en navegador con progreso publicado real. |
| MVP-FLOW-11 | El protocolo final puede resolverse y abre créditos. | SIN_EVIDENCIA | Existen `validateFinal`, persistencia de finalización y transición a `credits`. | Falta prueba funcional integral. |
| MVP-FLOW-12 | La finalización es estable y no se duplica al reintentar. | SIN_EVIDENCIA | Hay guardado de `complete` y envío de resultados. | Falta caracterización y aceptación. |

### 4.4 Persistencia y recuperación

| ID | Criterio | Estado | Evidencia existente | Brecha restante |
|---|---|---|---|---|
| MVP-REC-01 | El progreso de una misión publicada sobrevive a la recarga. | DEMOSTRADO | E2E conserva la misión `energy` resuelta y el mismo `idSesion`. | Ninguna para una misión. |
| MVP-REC-02 | Una publicación desactivada no crea sesión ni misiones. | DEMOSTRADO | E2E de desactivación. | Ninguna. |
| MVP-REC-03 | Persistencia corrupta se bloquea y no se borra automáticamente. | DEMOSTRADO | Persistence y E2E de corrupción. | Ninguna. |
| MVP-REC-04 | Limpiar una sesión no elimina publicaciones ni campañas ajenas. | PARCIAL | Stores y claves separadas están probados; `resetProgress` elimina claves concretas de sesión. | Falta E2E desde la interfaz. |
| MVP-REC-05 | Puede iniciarse una nueva sesión después de cerrar o invalidar la anterior. | PARCIAL | Hay caminos de reset y creación de sesión nueva. | Falta aceptación publicada. |
| MVP-REC-06 | Una campaña completada se reanuda como completada. | SIN_EVIDENCIA | Existe `STORAGE.complete`, pero no hay E2E completo. | Comprobar recarga posterior a créditos/finalización. |

### 4.5 Interfaz y experiencia de uso

| ID | Criterio | Estado | Evidencia existente | Brecha restante |
|---|---|---|---|---|
| MVP-UX-01 | Inicio, identidad, campaña, mapa y misión tienen controles visibles. | DEMOSTRADO | Entradas reales en `index.html`, superficie publicada y E2E de primera misión. | Falta recorrerlos juntos hasta créditos. |
| MVP-UX-02 | No se necesitan herramientas de desarrollo para el recorrido principal. | PARCIAL | Todas las acciones tienen controles de interfaz. | Falta una corrida de aceptación operada únicamente por UI. |
| MVP-UX-03 | Los bloqueos muestran mensajes comprensibles y una salida posible. | PARCIAL | Mensajes de publicación no disponible y fallback legacy comprobados. | Revisar todos los fallos del recorrido MVP, no solo lanzamiento. |
| MVP-UX-04 | El acceso esencial funciona en viewport angosto. | PARCIAL | Corrección y smoke del acceso a campaña en pantalla angosta cerrados en A2-011. | Falta recorrer publicación, misiones y final completo en ese viewport. |
| MVP-UX-05 | No hay solapamientos, scroll bloqueante ni controles fuera de pantalla. | PARCIAL | Evidencia puntual del selector/acceso. | Revisión visual integral pendiente. |
| MVP-UX-06 | Contrastes y estados disabled/hidden permiten comprender las acciones. | PARCIAL | CSS y estados visibles existen; algunos estados se prueban. | Auditoría visual y de contraste pendiente. |
| MVP-UX-07 | A.R.I.A. usa mensajes breves, claros y no infantiles. | PARCIAL | Mensajes actuales siguen mayoritariamente el estilo definido. | Revisión editorial del recorrido completo. |

### 4.6 Calidad técnica y release

| ID | Criterio | Estado | Evidencia existente | Brecha restante |
|---|---|---|---|---|
| MVP-QA-01 | Contratos focales y regresiones relacionadas están aprobados. | DEMOSTRADO | Cierres A2-013 a A2-016; A2-016C 141/141. | Volver a ejecutarlos tras cualquier cambio futuro. |
| MVP-QA-02 | Los recorridos existentes terminan sin errores de página, consola o promesas. | DEMOSTRADO | E2E publicado, puente de dominio, coherencia local y legacy cerrados sin errores. | Falta la misma garantía para la aceptación integral. |
| MVP-QA-03 | Existe un runner durable para el recorrido MVP completo. | SIN_EVIDENCIA | Hay E2E operativo inicial, pero no recorre múltiples misiones, final y recarga final. | Crear el runner A2-017C. |
| MVP-QA-04 | La versión tiene instrucciones breves de uso. | PARCIAL | Existen README y documentación de Studio. | Redactar una guía específica del MVP después de cerrar el recorrido. |
| MVP-QA-05 | El cierre produce commit, bundle verificado y limpieza. | PARCIAL | El procedimiento está probado en tramos anteriores. | Ejecutarlo para el commit final del MVP. |

## 5. Decisión de arquitectura

No se autoriza una nueva extracción arquitectónica antes de obtener evidencia del runner integral.

En particular, A2-017 no necesita por ahora:

- eliminar legacy;
- cambiar el modo predeterminado;
- convertir RuntimeCore o NavigationCore en factorías puras;
- mover todos los efectos fuera de `js/crios.js`;
- agregar backend, sincronización o multiusuario;
- crear nuevos tipos de misión.

La primera tarea técnica debe observar el recorrido real con el código actual.

## 6. Próximo tramo recomendado

### A2-017C1 — caracterización E2E del recorrido MVP

Crear un runner durable que:

1. abra Studio;
2. prepare y publique la campaña de cuatro misiones;
3. active y abra la publicación;
4. confirme identidad;
5. resuelva al menos dos misiones en orden;
6. recargue y confirme que ambas siguen resueltas;
7. resuelva las misiones restantes;
8. confirme que el protocolo final se habilita;
9. resuelva el protocolo final;
10. confirme créditos y estado completo;
11. recargue nuevamente;
12. compruebe reanudación coherente de la campaña completada;
13. cierre la sesión;
14. cree una sesión nueva sin residuos;
15. reporte errores, warnings, requests, storage, frames y cleanup.

El runner debe ejecutarse primero contra producción sin modificar. Si falla, cada fallo se clasificará como:

- defecto de producción;
- limitación contractual;
- defecto del runner;
- dependencia del entorno;
- brecha exclusivamente visual o documental.

Solo después se autorizará A2-017C2 para corregir el primer defecto real confirmado.

## 7. Definición de cierre de A2-017B

A2-017B queda cerrado cuando esta matriz se versiona sin cambios productivos y se acepta que la siguiente acción es caracterizar el E2E integral antes de implementar.
