# CRIOS Studio

## 1. Propósito y entrada

Studio es la aplicación docente disponible en `studio/index.html`. Permite componer, validar, publicar y activar campañas a partir del catálogo implementado sin ejecutar ni mutar la sesión del alumno.

`js/studio/studio.js` coordina modelos, acciones, adapters, controladores y renderer. El Draft es la única fuente editable; una publicación es un snapshot inmutable y no reemplaza al Draft.

## 2. Capacidades implementadas

Studio permite:

- visualizar el banco de cuatro misiones: `energy`, `greenhouse`, `ice` y `hangar`;
- agregar, quitar y reordenar misiones del Campaign Draft;
- editar nombre, descripción y escenario;
- consultar resumen, cantidad, duración, dificultad y validación;
- mantener y validar cuatro `missionSpecs` y su `runtimeExecutionManifest`;
- validar el Draft con Publication Core;
- publicar una nueva versión inmutable con contenido canónico y `contentHash`;
- listar publicaciones y registros de una campaña;
- activar, desactivar y revertir a una publicación previa elegible;
- resolver la publicación activa;
- persistir publicaciones, referencias y registros de activación en `localStorage`;
- mostrar estado, revisión, tamaño y conteos de persistencia;
- exportar el documento persistente y borrarlo mediante confirmación explícita.

Véanse [STUDIO_PUBLICATION_INTEGRATION.md](architecture/STUDIO_PUBLICATION_INTEGRATION.md), [EXECUTABLE_MISSION_PUBLICATION.md](architecture/EXECUTABLE_MISSION_PUBLICATION.md) y [PUBLICATION_PERSISTENCE_IMPLEMENTATION.md](architecture/PUBLICATION_PERSISTENCE_IMPLEMENTATION.md).

## 3. Campaign Draft

`window.CRIOS_CAMPAIGN_DRAFT` conserva el estado mutable de edición. Expone operaciones para leer la campaña y sus misiones, agregar, mover o quitar misiones, editar metadatos, y leer o establecer `missionSpecs` y la evaluación final.

El Draft vive en memoria, cambia su revisión cuando cambia contenido publicable, no es Campaign Release, no alimenta Runtime directamente y no se recupera desde la persistencia de publicaciones. La persistencia implementada conserva publicaciones y activaciones, no una sesión remota de edición colaborativa.

## 4. Servicios compartidos y APIs

Studio consume `window.CRIOS_STUDIO_ADAPTER` como acceso de solo lectura a misiones, taxonomía y campañas legacy; los namespaces públicos de publicación, activación, persistencia y handlers; y módulos de `window.CRIOS_DOMAIN` cuando compone contratos compartidos.

`window.CRIOS_STUDIO` expone APIs congeladas. Operaciones públicas comprobadas:

- `publication.validateCurrentDraft()` y `publication.publishCurrentDraft()`;
- `activation.activatePublication()`, `activation.deactivatePublication()`, `activation.rollbackPublication()` y `activation.resolveActivePublication()`;
- `persistence.getStatus()`, `persistence.exportLocalData()` y `persistence.clearLocalData()`;
- `missionSpecs.listCurrentSpecs()`, `missionSpecs.getCurrentSpec()`, `missionSpecs.getExecutionManifest()` y `missionSpecs.validateCurrentDraft()`.

## 5. Publicación, activación y persistencia

Publicar crea una versión nueva solo si el Draft y sus specs son válidos y la revisión esperada no cambió. Activar selecciona qué publicación puede resolver Runtime; desactivar elimina la referencia; rollback registra una transición hacia una versión anterior válida sin modificarla.

La persistencia usa `crios.publication.persistence.v1`. Es local al navegador y puede reportar estados vacíos, listos, degradados, corruptos o no soportados. No es nube, servidor ni garantía multiusuario.

## 6. Relación con Runtime

Studio produce publicaciones ejecutables. Runtime, en modo `published`, lee la referencia activa y la publicación persistida, valida identidad y hash, resuelve handlers y materializa misiones. Studio no llama al flujo del alumno ni migra una sesión activa.

El modo predeterminado continúa siendo `legacy`. Abrir Studio no cambia ese modo y, sin una acción explícita del usuario, no debe mutar storage.

## 7. Límites actuales

No debe asumirse que Studio guarda Drafts en servidor, sincroniza dispositivos, ofrece colaboración, crea handlers o catálogo desde la UI, edita publicaciones existentes, activa automáticamente al publicar, cambia la configuración de Runtime o reemplaza el flujo legacy. Esas capacidades son futuras hasta contar con implementación y pruebas.
