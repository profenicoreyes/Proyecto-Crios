# CRIOS - Escenarios operativos

## 1. Alcance

Este documento separa comportamiento implementado, escenarios de validación y trabajo futuro. Los escenarios narrativos son datos registrados; los escenarios operativos describen cómo Runtime, Studio, publicación y storage interactúan.

## 2. Escenario narrativo implementado

`REGISTRO_ESCENARIOS` expone `registrar`, `obtener`, `listar`, `establecerActivo` y `obtenerActivo`. Antártida es el escenario narrativo implementado y activo por defecto. Sus datos no manipulan el DOM ni contienen lógica del motor.

## 3. Escenarios implementados

### 3.1 Arranque legacy

Con `CRIOS_CONFIG.runtimeCampaignMode` en `legacy`, `index.html` carga la campaña activa, cuatro misiones desde `REGISTRO_MISIONES`, UI y servicios compartidos sin exigir publicación activa. Un modo desconocido se bloquea y no hace fallback a legacy.

### 3.2 Campaña activa y selector de grupos

El bootstrap selecciona o conserva la campaña activa y carga sus grupos en el selector de identificación. Si una fuente auxiliar no está disponible, el flujo expone el estado degradado observado y no inventa datos.

### 3.3 Bootstrap esperado de sessionStorage

Una carga real puede inicializar `crios-campana-activa` y `crios-progreso-campanas-v1`. Son escrituras esperadas del bootstrap legacy, no publicación ni activación, y deben distinguirse de mutaciones no justificadas.

### 3.4 Publicación, activación y persistencia

Studio adapta cuatro misiones a `missionSpecs`, construye `runtimeExecutionManifest`, valida el Draft y crea una publicación inmutable con versión y `contentHash`. Publicar no activa automáticamente.

Una publicación válida puede activarse, desactivarse o ser destino de rollback. El coordinador persiste publicaciones, registros y referencias en `localStorage` bajo `crios.publication.persistence.v1`; una recarga reconstruye los stores. Un documento corrupto o con esquema no soportado se reporta y no se sobrescribe silenciosamente.

### 3.5 Materialización en Runtime

En modo `published`, con identidad, publicación activa coherente y handler disponible, Runtime valida referencia, publicación, hash, manifiesto y specs, y materializa cuatro misiones mediante `crios.geometry.declarative-area` versión `1.0.0`. La sesión conserva la identidad de publicación. Un handler o versión ausente bloquea la preparación sin fallback silencioso.

### 3.6 Apertura de Studio

Abrir `studio/index.html` carga el banco y paneles de Draft, resumen, publicación, activación y persistencia. Sin una acción explícita de publicar, activar, desactivar, revertir o borrar, Studio no debe mutar storage.

### 3.7 Degradación controlada

Los fallos de dominio, red, storage, recuperación o contexto temporal se clasifican por resultado observable. Un envío fallido puede conservar `crios-pending-result`; un fallo de persistencia puede producir estado degradado; una dependencia obligatoria de bootstrap published bloquea la preparación. No es válida una recuperación silenciosa que cambie campaña, publicación o semántica.

### 3.8 Errores de datos

Drafts inválidos, hashes incoherentes, referencias de otra campaña, publicaciones ausentes, specs inválidas, handlers no disponibles o documentos persistentes corruptos producen errores estructurados. La UI puede informar el error, pero no corrige el contenido ni elige otra versión automáticamente.

### 3.9 Recuperación desde un commit estable

La recuperación de trabajo parte de rama, HEAD y worktree verificados; se contrasta el commit con su checkpoint y se confirma staging vacío. No se usan reset, checkout ni limpieza para ocultar cambios. Una sesión published se recupera desde su publicación fijada, no desde cualquier referencia activa más reciente.

## 4. Escenarios de validación

Las pruebas de navegador cubren núcleo, activación y persistencia de publicación; integración de `missionSpecs` en Studio; resolución y materialización; bootstrap y recuperación fijada; coherencia local, orden asíncrono y recarga/transmisión; disponibilidad degradada; y convivencia legacy.

Los harnesses son evidencia y no dependencias de producción. Un escenario controlado no autoriza generalizar fuera de sus variables observadas. Véanse [EVENT_FLOW_MATRIX.md](architecture/EVENT_FLOW_MATRIX.md), [GAME_TRANSACTIONS.md](architecture/GAME_TRANSACTIONS.md) y [DEMONSTRABLE_CLAIMS_MATRIX.md](architecture/DEMONSTRABLE_CLAIMS_MATRIX.md).

## 5. Escenarios futuros

Permanecen futuros: nuevos escenarios narrativos oficiales, edición visual de nuevos tipos de misión o handlers, persistencia remota, sincronización multiusuario, recuperación entre dispositivos, reemplazo completo del Game Flow legacy y garantías de disponibilidad más amplias que las pruebas controladas.
