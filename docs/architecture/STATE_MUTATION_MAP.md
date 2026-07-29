# STATE_MUTATION_MAP

Base utilizada: codigo real del motor actual y conteos por regex sobre js/crios.js para asignaciones directas.

## Tabla de mutaciones

| Estado | Quien modifica | Quien lee | Cantidad de mutaciones (asignaciones directas observadas) | Riesgo |
|---|---|---|---|---|
| progress | Inicio de campania, cambio campania, inicio sesion, respuesta correcta, reset | mapa, selector, guardado, payload indirecto | 5 | Alto |
| missionData | cambio campania, inicio sesion, generacion previa a render/validacion, reset | render mision/final, validaciones | 4 | Medio |
| hintRegistered | cambio campania, inicio sesion, registro de pista, reset | control de pista | 4 | Medio |
| missionOpenedAt | cambio campania, inicio sesion, apertura mision, reset | calculo de tiempo de mision | 4 | Medio |
| domainRuntime | rebuild y refresh dominio | navigation de dominio | 4 | Alto |
| domainNavigation | rebuild y refresh dominio | resolucion de mision actual | 4 | Medio |
| campanaActivaId | lectura inicial, inicializacion campania, cambio campania, reset | inicializacion/seleccion campania | 4 | Medio |
| campanaActiva | inicializacion y cambio campania | render cabecera/selector y dominio | 3 | Alto |
| misionesActivas | inicializacion y cambio campania | armado UI de misiones | 3 | Medio |
| missionIds | inicializacion y cambio campania | casi todo el flujo de mision/final | 3 | Alto |
| sessionData | inicio sesion, reset, lectura inicial | evaluacion, payload, render de cierre | 3 (asignacion raiz) + numerosas mutaciones internas | Alto |
| sessionStats | lectura inicial, inicio sesion, reset | evaluacion, payload | 3 (asignacion raiz) + numerosas mutaciones internas | Alto |
| domainSession | rebuild dominio + null por error | evaluacion de jugador y runtime | 3 (asignacion raiz) + mutaciones internas frecuentes | Alto |
| domainRelease | rebuild dominio + null por error | runtime/navigation | 3 | Alto |
| transmissionBusy | inicio/fin de envio | cola de transmision | 3 | Bajo |
| transmissionQueued | encolado y descarga de cola | finalizador de envio | 3 | Bajo |
| progresosCampanas | lectura inicial y reset | selector/progreso por campania | 2 (asignacion raiz) + mutaciones por indice | Alto |
| currentScreen | init y cada go | control de pantalla | 2 | Bajo |
| domainReady | init false y true al cargar dominio | rutas de dominio | 2 | Bajo |
| progressSendTimer | init y debounce | cola de envio | 2 | Bajo |
| introReady | init y fin de animacion | activacion intro | 2 | Bajo |
| introActivated | init y activacion unica | activacion intro | 2 | Bajo |
| complete (storage) | final correcto y reset | control de cierre/consulta externa | setItem 1 + removeItem 1 | Medio |
| pendingResult (storage) | fallo envio/salida, exito final/reintento/reset | retry online e inicio | localStorage set 1, remove 3, get 1 | Alto |

## Metricas de persistencia y red observadas

- sessionStorage.setItem: 6
- sessionStorage.removeItem: 9
- localStorage.setItem: 1
- localStorage.removeItem: 3
- localStorage.getItem: 1
- fetch: 4
- sendBeacon: 1

## Respuestas solicitadas

### Cuales son los estados con mayor cantidad de mutaciones

1. sessionData (pocas reasignaciones de raiz, pero maxima cantidad de mutaciones internas en todo el flujo).
2. sessionStats (idem sessionData).
3. progress.
4. missionData.
5. hintRegistered y missionOpenedAt.
6. domainSession/domainRuntime/domainNavigation durante evaluaciones y reconstrucciones.

### Cuales son modificados desde lugares distintos

- progress (inicio, cambio campania, evaluacion correcta, reset).
- sessionData (identificacion, campania, pantalla, procedimiento, respuesta, pista, final, envio final, reset).
- sessionStats (procedimiento, respuesta, pista, completitud, tiempo, reset).
- missionData (init sesion, cambio campania, ensure previo a render/validacion, reset).
- domainSession/domainRuntime/domainNavigation (rebuild, sync, evaluacion, refresh, fallback por error).
- pendingResult (fallo de envio, salida, reintento, cierre final, reset).

### Cuales tienen doble representacion

- Progreso: progress, progresosCampanas, sessionStorage progress/campaignProgress.
- Mision actual: missionOpenedAt + currentScreen + domainSession.progress.currentMissionId + domainRuntime.mission + domainNavigation.currentMissionId.
- Cierre de juego: complete (storage), sessionData.final.answerCorrect, sessionData.finISO, sessionData.enviada.
- Estado de sesion: sessionData (legacy gameplay) y domainSession (dominio de runtime/vidas).
