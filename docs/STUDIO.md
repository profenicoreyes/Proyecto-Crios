# CRIOS Studio

## 1. Propósito y entrada

Studio es la aplicación docente disponible en `studio/index.html`. Permite componer, validar y publicar campañas a partir del catálogo implementado sin ejecutar ni mutar la sesión del alumno. Cada publicación genera un enlace propio e inmutable para abrir esa versión exacta en Runtime.

`js/studio/studio.js` coordina modelos, acciones, adapters, controladores y renderer. El Draft es la única fuente editable; una publicación es un snapshot inmutable y no reemplaza al Draft.

## 2. Capacidades implementadas

Studio permite:

- visualizar el banco de cuatro misiones: `energy`, `greenhouse`, `ice` y `hangar`;
- agregar, quitar y reordenar misiones del Campaign Draft;
- editar nombre, descripción y escenario;
- agregar una nota docente opcional a cada misión dentro de la campaña, sin mutar la misión base del catálogo;
- consultar resumen, cantidad, duración y dificultad derivadas automáticamente de las misiones, además de la referencia curricular sugerida ANEP;
- mantener y validar cuatro `missionSpecs` y su `runtimeExecutionManifest`;
- validar el Draft con Publication Core;
- publicar una nueva versión inmutable con contenido canónico y `contentHash`;
- listar publicaciones y registros de una campaña;
- abrir la última publicación mediante su enlace directo `campaignId + publicationId`;
- conservar publicaciones en `localStorage` como apoyo local de Studio;
- mostrar estado, revisión, tamaño y conteos de persistencia;
- exportar el documento persistente y borrarlo mediante confirmación explícita.

Véanse [STUDIO_PUBLICATION_INTEGRATION.md](architecture/STUDIO_PUBLICATION_INTEGRATION.md), [EXECUTABLE_MISSION_PUBLICATION.md](architecture/EXECUTABLE_MISSION_PUBLICATION.md) y [PUBLICATION_PERSISTENCE_IMPLEMENTATION.md](architecture/PUBLICATION_PERSISTENCE_IMPLEMENTATION.md).

## 3. Campaign Draft

`window.CRIOS_CAMPAIGN_DRAFT` conserva el estado mutable de edición. Expone operaciones para leer la campaña y sus misiones, agregar, mover o quitar misiones, editar metadatos, y leer o establecer `missionSpecs` y la evaluación final.

El Draft vive en memoria, cambia su revisión cuando cambia contenido publicable, no es Campaign Release, no alimenta Runtime directamente y no se recupera desde la persistencia de publicaciones. La persistencia implementada conserva publicaciones y datos locales de compatibilidad; no es una sesión remota de edición colaborativa.

La dificultad, la duración estimada y la referencia curricular sugerida no son datos que ingrese el docente. Cada misión los declara como metadatos canónicos de CRIOS y Studio deriva los valores de campaña: suma de duraciones, promedio aritmético de dificultades e intersección de referencias curriculares. La gramática curricular se centraliza en `js/curriculum/anep-curriculum-catalog.js`. Véase [A3_CURRICULUM_METADATA_MODEL.md](architecture/A3_CURRICULUM_METADATA_MODEL.md).

## 4. Servicios compartidos y APIs

Studio consume `window.CRIOS_STUDIO_ADAPTER` como acceso de solo lectura a misiones, taxonomía y campañas legacy; los namespaces públicos de publicación, persistencia y handlers; y módulos de `window.CRIOS_DOMAIN` cuando compone contratos compartidos. El subsistema histórico de activación permanece en el repositorio por compatibilidad, pero ya no se carga ni se compone en el flujo normal de Studio.

`window.CRIOS_STUDIO` expone APIs congeladas. Operaciones públicas comprobadas:

- `publication.validateCurrentDraft()` y `publication.publishCurrentDraft()`;
- `persistence.getStatus()`, `persistence.exportLocalData()` y `persistence.clearLocalData()`;
- `missionSpecs.listCurrentSpecs()`, `missionSpecs.getCurrentSpec()`, `missionSpecs.getExecutionManifest()` y `missionSpecs.validateCurrentDraft()`.

## 5. Publicación, acceso directo y persistencia

Publicar crea una versión nueva solo si el Draft y sus specs son válidos y la revisión esperada no cambió. El acceso a Runtime se construye directamente desde la publicación inmutable; no existe un paso normal de activar, desactivar ni volver a una versión mediante una referencia activa.

La persistencia usa `crios.publication.persistence.v1`. Es local al navegador y puede reportar estados vacíos, listos, degradados, corruptos o no soportados. No es nube, servidor ni garantía multiusuario.

## 6. Relación con Runtime

Studio produce publicaciones ejecutables. Runtime, en modo `published`, recibe `campaignId + publicationId`, obtiene esa publicación exacta, valida identidad y hash, resuelve handlers y materializa misiones. Studio no llama al flujo del alumno ni migra una sesión activa.

El modo predeterminado continúa siendo `legacy`. Abrir Studio no cambia ese modo y, sin una acción explícita del usuario, no debe mutar storage.

## 7. Límites actuales

No debe asumirse que Studio guarda Drafts en servidor, sincroniza dispositivos, ofrece colaboración, crea handlers o catálogo desde la UI, edita publicaciones existentes, cambia la configuración de Runtime o reemplaza el flujo legacy. Tampoco existe ya una activación manual como requisito para compartir una publicación. Las capacidades futuras siguen requiriendo implementación y pruebas.
