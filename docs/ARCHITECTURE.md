# CRIOS OS - Arquitectura implementada

## 1. Alcance y fuente de verdad

Este documento describe el sistema observable en el commit funcional estable posterior a A2-006J. El código, las pruebas y los contratos de [architecture](architecture/) son la evidencia del estado implementado. La planificación futura no demuestra capacidades existentes.

CRIOS mantiene dos capas que conviven:

- el flujo legacy de `js/crios.js`, que continúa orquestando la experiencia del alumno;
- módulos de dominio, publicación y Runtime con contratos explícitos, consumidos por el flujo principal y por Studio.

La convivencia es compatibilidad vigente, no una migración ya terminada.

## 2. Puntos de entrada y límites

- `index.html` carga la aplicación del alumno, los registros legacy, publicación, activación, persistencia, materialización, resolución ejecutable, trazabilidad y `js/crios.js`.
- `studio/index.html` carga la aplicación docente y sus controladores de Draft, publicación, activación, persistencia y `missionSpecs`.
- `js/crios.js` decide el flujo operativo, integra módulos y conserva los contratos de UI, sesión, progreso, evaluación y transmisión existentes.
- `js/studio/studio.js` coordina Studio; no es una dependencia del Runtime del alumno.
- `window.CRIOS_DOMAIN` registra servicios compartidos de Release, Session, Runtime, Navigation, PlayerState, Publish y Share. `runtimeBootstrapAdapter` pertenece a ese registro y no crea un global raíz adicional.

El dominio no depende del DOM. Studio y el flujo legacy pueden consumir contratos públicos, pero no deben convertir sus representaciones internas en una segunda fuente de verdad.

## 3. Dependencias

```text
Studio -> Campaign Draft -> Publication Core -> Publication Store
                         -> Activation Service -> Activation Store
                         -> Persistence Coordinator -> localStorage

index.html -> js/crios.js -> Runtime Bootstrap Adapter
                           -> legacy: campaña + REGISTRO_MISIONES
                           -> published: referencia activa -> publicación
                              -> resolución ejecutable -> materialización

Release -> StudentSession -> Runtime -> Navigation
Evaluation data -> PlayerState -> StudentSession
```

Las flechas expresan consumo o coordinación, no mutación automática. No se permiten dependencias circulares ni acceso de Runtime al Draft editable.

## 4. Dominio y ownership de estado

Los límites verificados se detallan en [STATE_OWNERSHIP_MATRIX.md](architecture/STATE_OWNERSHIP_MATRIX.md) y [STATE_MUTATION_MAP.md](architecture/STATE_MUTATION_MAP.md).

| Estado | Propietario o autoridad actual | Regla |
| --- | --- | --- |
| Campaign Draft | `CRIOS_CAMPAIGN_DRAFT` en Studio | mutable durante la edición; no alimenta Runtime directamente |
| Campaign Release | Release / publicación | snapshot inmutable; separado del Draft |
| StudentSession modular | Session | contiene el estado persistente del jugador |
| vidas y estado asociado | PlayerState | se modifican mediante datos de evaluación |
| Runtime modular | Runtime | contexto inmutable construido desde Release y Session |
| navegación modular | Navigation | calcula misión actual y continuidad sin mutar Runtime |
| sesión y progreso legacy | `js/crios.js` y storage configurado | continúan activos en el flujo de producto |
| publicación activa | Activation Store | una referencia activa por campaña según contrato |
| documento persistente de publicación | Persistence Coordinator | publicaciones, referencias y registros de activación en una única clave |

No existe todavía un engine separado de Game Flow, Evaluation o Progress que reemplace toda la orquestación legacy. La evaluación y el progreso funcionales existen, pero parte de su ejecución y mutación permanece en `js/crios.js` y en el estado legacy.

## 5. Publicación, activación y persistencia

`window.CRIOS_PUBLICATION_CORE` normaliza y valida Drafts, construye contenido canónico, calcula el hash y crea publicaciones inmutables. El contrato está definido en [PUBLICATION_CONTRACT.md](architecture/PUBLICATION_CONTRACT.md).

`window.CRIOS_PUBLICATION_ACTIVATION` administra activar, desactivar, resolver y revertir referencias mediante su servicio. Activar no modifica el contenido publicado.

`window.CRIOS_PUBLICATION_PERSISTENCE` crea el adaptador y los stores persistentes coordinados. El documento se guarda en `localStorage` bajo `crios.publication.persistence.v1`; su esquema y estados están descritos en [PUBLICATION_PERSISTENCE_IMPLEMENTATION.md](architecture/PUBLICATION_PERSISTENCE_IMPLEMENTATION.md).

Publicar, activar y persistir son operaciones distintas. Una publicación válida no queda activa por el solo hecho de existir, y la persistencia local no equivale a almacenamiento remoto.

## 6. Misiones ejecutables y bootstrap

Una publicación ejecutable incluye `missionSpecs`, `runtimeExecutionManifest` y evaluación final. `window.CRIOS_RUNTIME_MISSION_HANDLERS` valida cada spec y materializa la misión mediante el handler exacto solicitado. El handler implementado es `crios.geometry.declarative-area` versión `1.0.0`; no hay fallback silencioso a otra versión.

`window.CRIOS_RUNTIME_EXECUTABLE_PUBLICATION` valida la publicación, comprueba identidad, versión y `contentHash`, resuelve la referencia activa y produce una campaña resuelta. Véanse [PUBLISHABLE_MISSION_CONTRACT.md](architecture/PUBLISHABLE_MISSION_CONTRACT.md), [RUNTIME_EXECUTABLE_PUBLICATION_RESOLUTION.md](architecture/RUNTIME_EXECUTABLE_PUBLICATION_RESOLUTION.md) y [RUNTIME_MISSION_MATERIALIZATION.md](architecture/RUNTIME_MISSION_MATERIALIZATION.md).

`CRIOS_DOMAIN.runtimeBootstrapAdapter` expone `prepareLegacyCampaign`, `preparePublishedCampaign`, `recoverPublishedCampaign` e `isPreparedRuntimeCampaign`:

- `legacy`, valor predeterminado de `CRIOS_CONFIG.runtimeCampaignMode`, prepara la campaña y las cuatro misiones registradas sin exigir publicación;
- `published` exige dependencias, referencia o publicación fijada coherente, hash válido, handlers disponibles e identidad del alumno;
- un modo desconocido se bloquea; no se interpreta como legacy;
- la recuperación publicada conserva la identidad de la publicación fijada y no migra una sesión en curso a otra versión activa.

## 7. Runtime y compatibilidad legacy

El Runtime del alumno mantiene cuatro misiones y las pantallas, progreso, evaluación, transmisión y recuperación existentes. En modo `published`, las misiones provienen del puente materializado; en modo `legacy`, provienen de `REGISTRO_MISIONES`.

El bootstrap normal puede escribir `crios-campana-activa` y `crios-progreso-campanas-v1` en `sessionStorage`. Esas escrituras son estado legacy esperado, no persistencia de publicaciones. Las demás claves y transacciones se describen en [CURRENT_GAME_FLOW_BASELINE.md](architecture/CURRENT_GAME_FLOW_BASELINE.md) y [GAME_TRANSACTIONS.md](architecture/GAME_TRANSACTIONS.md).

## 8. Studio y trazabilidad

Studio conserva el Draft como única fuente editable. Puede componer una campaña con el banco de cuatro misiones, validar y publicar un snapshot ejecutable, activar una versión y persistir registros localmente. No ejecuta la sesión del alumno ni convierte una publicación inmutable en Draft. Véase [STUDIO_PUBLICATION_INTEGRATION.md](architecture/STUDIO_PUBLICATION_INTEGRATION.md).

`window.CRIOS_TRACE` es una API congelada y acotada para registrar eventos explícitos del flujo. Su capacidad es finita, entrega copias defensivas y puede permanecer deshabilitada. No es telemetría remota ni reemplaza el estado de dominio. Véanse [RUNTIME_TRACE_IMPLEMENTATION.md](architecture/RUNTIME_TRACE_IMPLEMENTATION.md) y [FLOW_TRACEABILITY_AUDIT.md](architecture/FLOW_TRACEABILITY_AUDIT.md).

## 9. Contratos y trabajo futuro

Contratos públicos relevantes:

- `window.CRIOS` para la UI del alumno;
- `window.CRIOS_DOMAIN` para servicios modulares compartidos;
- `window.CRIOS_PUBLICATION_CORE`, `window.CRIOS_PUBLICATION_ACTIVATION` y `window.CRIOS_PUBLICATION_PERSISTENCE`;
- `window.CRIOS_RUNTIME_MISSION_HANDLERS` y `window.CRIOS_RUNTIME_EXECUTABLE_PUBLICATION`;
- `window.CRIOS_CAMPAIGN_DRAFT`, `window.CRIOS_STUDIO_ADAPTER` y `window.CRIOS_STUDIO` en Studio;
- `REGISTRO_MISIONES`, `REGISTRO_ESCENARIOS`, `CAMPANAS_CRIOS` y `TAXONOMIA_CRIOS` como contratos legacy vigentes.

La extracción completa de Game Flow, Evaluation o Progress, la persistencia remota, la colaboración y cualquier ampliación de catálogo son trabajo futuro hasta que código, pruebas y contratos lo demuestren. Ante una contradicción: detenerse, presentar evidencia y esperar una decisión explícita.
