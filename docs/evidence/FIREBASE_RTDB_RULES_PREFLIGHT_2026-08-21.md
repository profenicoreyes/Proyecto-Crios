# Preflight de reglas Firebase RTDB del 21 de agosto de 2026

## Alcance y procedencia

Este documento conserva la evidencia previa a cualquier despliegue de la sincronización de progreso. No asigna un identificador de roadmap ni autoriza publicar reglas, hacer push o desplegar Apps Script.

El operador aportó el 21 de agosto de 2026 el contenido mostrado por Firebase Console para el proyecto `crios-e1b83`. El agente no pudo acceder de forma independiente a la sesión autenticada por una falla del control local del navegador; por eso la procedencia se registra expresamente como copia aportada por el operador.

El snapshot exacto normalizado con terminación LF se conserva en [`firebase-rtdb-rules-live-before-game-state-2026-08-21.json`](firebase-rtdb-rules-live-before-game-state-2026-08-21.json). Ese archivo es el contenido de rollback previo al despliegue, sujeto a una nueva verificación autenticada inmediatamente antes de publicar.

Snapshot normalizado: 875 bytes; SHA-256 `88d9dbab362504537fd8a688769cf7fe39eea68af13bcd41afae4b70f0ccbe36`.

Checkpoint local usado para la comparación: `b5fe6fb422dd43351df00758abc9daec061d0bc2`.

## Normalización y durabilidad

La raíz del repositorio fija `text eol=lf` exclusivamente para `firebase/realtime-database.rules.json` y este snapshot mediante `.gitattributes`. La huella anterior corresponde a los bytes LF; antes de publicar se deben verificar el atributo, el tamaño y el SHA-256, no inferirlos desde la configuración global `core.autocrlf`.

La evidencia solo se considera durable después de que `.gitattributes`, el snapshot y este informe estén incluidos en un commit y en un bundle verificado. El bundle `b5fe6fb` es deliberadamente anterior al preflight y no pretende contener estos archivos.

## Comparación estructural exacta

La comparación del JSON remoto aportado contra la regla anterior versionada en `719b7fb05c6f7cb277543e4e50836918b8357b4f` y contra `firebase/realtime-database.rules.json` aisló exactamente cuatro diferencias:

| Ruta | Remoto aportado | `719b7fb` | Candidata | Clasificación |
| --- | --- | --- | --- | --- |
| `/rules/.read` | ausente | `false` | `false` | denegación explícita defensiva |
| `/rules/.write` | ausente | `false` | `false` | denegación explícita defensiva |
| `/rules/$other/.validate` | ausente | `false` | `false` | rechazo explícito defensivo fuera del namespace |
| `/rules/liveRoomSignals/$roomId/$uid/type/.validate` | solo `presence-change` | solo `presence-change` | `presence-change` o `game-state-change` | ampliación funcional prevista del enum |

No se observaron otras diferencias estructurales.

Firebase Realtime Database deniega acceso si ninguna regla `.read` o `.write` lo concede. Las reglas `.validate` se evalúan después de autorizar la escritura y no conceden acceso. Por ello, las tres ausencias del snapshot remoto no habilitan por sí mismas otra ruta de cliente; la candidata las conserva como defensa explícita y como alineación con la fuente versionada anterior. Referencia oficial: <https://firebase.google.com/docs/database/security/core-syntax>.

## Decisión de preflight

No se reducirá la regla candidata para imitar las omisiones remotas. El diff de despliegue esperado contiene exactamente:

1. tres denegaciones explícitas en la raíz que no conceden permisos nuevos;
2. la incorporación de `game-state-change` al enum de tipos permitido.

Cualquier otra diferencia bloquea la publicación y exige una nueva revisión.

## Estado del gate

Cumplidos:

- snapshot remoto aportado y conservado;
- comparación contra la regla anterior versionada y la candidata;
- clasificación del diff esperado.

Pendientes:

- reconfirmar el snapshot desde una sesión autenticada inmediatamente antes de publicar;
- aprobar y ejecutar el despliegue coherente de reglas, Apps Script y cliente;
- conservar el snapshot posterior y ejecutar el smoke remoto completo;
- limpiar todos los nodos de prueba y registrar versión, fecha, resultados y rollback final.
