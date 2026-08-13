# A3-003B7C2 — Retiro de activación del flujo normal de Studio

## Objetivo

Studio deja de presentar o componer el modelo histórico de publicación activa. El docente publica una versión y utiliza el enlace directo e inmutable identificado por `campaignId + publicationId`.

## Decisión de producto

En el flujo normal ya no existen los pasos `Activar`, `Desactivar` ni `Volver a esta versión`. Publicar otra versión no reemplaza ni invalida enlaces anteriores.

## Alcance de B7C2

Se retiran del bootstrap y de la interfaz de Studio:

- los scripts de activación de dominio;
- el servicio remoto de activación;
- el controlador de activación de Studio;
- `CRIOS_STUDIO.activation`;
- la sección de estado e historial de activación;
- los botones `Activar`, `Desactivar` y `Volver a esta versión`;
- los badges y contadores de referencia activa expuestos al docente.

El acceso para estudiantes y el historial de publicaciones permanecen. B7C1 ya garantiza que `Abrir campaña en CRIOS` se construye desde la publicación inmutable, sin depender de activación ni de persistencia local.

## Compatibilidad temporal

B7C2 no elimina todavía el subsistema histórico del repositorio ni las operaciones del backend remoto. Los módulos de activación y los campos de compatibilidad del esquema de persistencia permanecen para una retirada posterior y reversible.

Por ese motivo `persistent-activation-store.js` continúa cargándose como parte de la compatibilidad del documento local de persistencia, aunque Studio ya no lee ni escribe activaciones.

## Persistencia

La recuperación del `campaignId` en Studio deja de consultar una referencia activa y utiliza la publicación almacenada más reciente. La UI de persistencia deja de mostrar contadores de referencias activas y registros de activación.

## Archivos modificados

- `studio/index.html`
- `js/studio/studio.js`
- `js/studio/render/studio-renderer.js`
- `docs/STUDIO.md`
- `tests/studio-remote-activation-wiring-node.test.js`

Documento agregado:

- `docs/architecture/A3_STUDIO_ACTIVATION_RETIREMENT.md`

## Garantías

- Studio no carga el API ni el controlador de activación.
- Studio no compone el servicio remoto de activación.
- `window.CRIOS_STUDIO` no expone `activation`.
- La interfaz no ofrece activar, desactivar ni rollback.
- El enlace de Runtime y la publicación remota siguen operativos.
- La autorización docente de escritura no cambia en este tramo.
- El backend de activación no se elimina en este tramo.

## No objetivos

B7C2 no:

- elimina todavía métodos `activate/deactivate` del cliente remoto;
- elimina endpoints mutables del backend;
- elimina el modelo histórico de activación del repositorio;
- modifica el esquema local persistido;
- elimina la clave docente;
- habilita publicación anónima;
- implementa salas multijugador ni TTL de 10 minutos.

## Rollback

Antes de commit, restaurar los cinco archivos modificados desde el backup externo de B7C2 y eliminar este documento. B7C1 debe quedar intacto.

Después del commit, revertir el commit del tramo como una unidad.
