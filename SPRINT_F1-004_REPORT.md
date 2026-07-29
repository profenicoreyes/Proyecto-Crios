# Sprint F1-004: Selección de Escenario para la Campaña
## REPORTE EJECUTIVO FINAL

> **Nota histórica:** este documento conserva el cierre original del sprint F1-004 y no describe el estado vigente ni la planificación actual de CRIOS. Para el estado actual, consultar [docs/ROADMAP.md](docs/ROADMAP.md) y la documentación versionada en `docs/`.

**Estado**: ✅ **COMPLETADO Y VERIFICADO**

**Fecha de Finalización**: 20 de Julio de 2026

---

## 1. Resumen Ejecutivo

Sprint F1-004 implementa la funcionalidad de selección de escenario para campañas docentes en CRIOS Studio. Los docentes pueden ahora seleccionar el escenario donde se desarrollará la campaña mediante botones interactivos en la interfaz de composición. La selección forma parte del Campaign Draft y se valida en tiempo real, con actualizaciones inmediatas en la zona de edición, resumen y estado de validación.

---

## 2. Archivos Modificados

### Modificaciones de Código:
1. **js/studio/modelo/campaign-draft.js**
   - Agregados getter/setter para escenario
   - Método: `obtenerEscenario()` → retorna ID del escenario (default: 'antartida')
   - Método: `establecerEscenario(escenarioId)` → actualiza y retorna `{ok: true}`

2. **js/studio/studio.js**
   - Recupera escenarios de REGISTRO_ESCENARIOS
   - Extrae información del escenario actual
   - Pasa escenarios array al Validator y Renderer
   - Implementa callback `alCambiarEscenario` para actualizar Campaign Draft

3. **js/servicios/campaign-validator.js**
   - Firma actualizada: `validarCampaignDraft(draft, escenarios)`
   - Nueva regla: Error "Debés seleccionar un escenario válido." si escenario no existe en array
   - Validación mediante: `escenarios.some(e => String(e.id) === escenarioSeleccionado)`

4. **js/studio/render/studio-renderer.js** ⭐ **COMPLETAMENTE RECREADO**
   - Función `renderMetadata()` crea y gestiona `.campaign-scenario-selector` div
   - Genera botones para cada escenario del array options.escenarios
   - Aplica clase `scenario-active` al escenario actual
   - Adjunta evento click a cada botón que llama `alCambiarEscenario(escenarioId)`
   - Función `renderSummary()` muestra nombre del escenario actual (no ID)

5. **css/studio.css**
   - `.scenario-buttons`: flex layout vertical con espaciado de 8px
   - `.scenario-option`: botón estilizado con borde CRIOS, fondo oscuro, texto cyan
   - `.scenario-option:hover`: borde y fondo más iluminados
   - `.scenario-active`: borde cyan brillante, fondo semitransparente cyan, texto blanco, **negrita**, prefijo checkmark (✓)

6. **studio/index.html** ⚠️ **MODIFICADO POR AUTORIZACIÓN**
   - Agregado: `<script src="../js/escenarios/registro-escenarios.js"></script>`
   - Agregado: `<script src="../js/escenarios/antartida.js"></script>`
   - Agregado: `<script src="../js/escenarios/registro-carga.js"></script>`
   - Todos los scripts agregados ANTES de `adapter.js` para garantizar registro previo

7. **js/escenarios/registro-carga.js** ✨ **NUEVO**
   - Módulo IIFE que registra escenarios disponibles en página load
   - Verifica existencia de `REGISTRO_ESCENARIOS` global
   - Registra `ESCENARIO_ANTARTIDA` con datos completos (id, nombre, descripción)
   - Manejo graceful si escenarios no están cargados

---

## 3. Implementación Técnica

### Arquitectura de Comunicación

```
Campaign Draft
  ↓ (getter obtenerEscenario)
Studio Coordinator
  ├─→ Validator: validarCampaignDraft(draft, escenarios)
  ├─→ Renderer: render({campaignScenarioId, escenarios, alCambiarEscenario, ...})
  └─→ Callback: alCambiarEscenario(escenarioId)
       ├→ establecerEscenario(escenarioId) en Campaign Draft
       └→ render() nuevamente para actualizar UI
```

### Flujo de Datos

1. **Renderizado inicial**:
   - Studio obtiene escenarios: `REGISTRO_ESCENARIOS.listar()`
   - Studio obtiene ID actual: `CRIOS_CAMPAIGN_DRAFT.obtenerEscenario()`
   - Renderer crea botón(es) de escenario con estado correcto

2. **Cambio de escenario**:
   - Usuario hace clic en botón de escenario
   - Callback `alCambiarEscenario` se ejecuta con nuevo ID
   - Campaign Draft se actualiza: `establecerEscenario(newId)`
   - Studio re-renderiza con nuevos datos
   - Validador ejecuta y retorna estado

3. **Validación**:
   - Error si: `escenarios.length > 0` Y escenario actual NO está en array
   - Sin error si: escenario ID coincide con algún escenario registrado
   - Validación silenciosa si: `escenarios` array no proporcionado (backward compatible)

### Reglas de Validación

| Condición | Estado | Mensaje |
|-----------|--------|---------|
| 0 misiones | ❌ Error | "La campaña debe contener al menos una misión." |
| Nombre vacío | ⚠️ Advertencia | "La campaña todavía no tiene nombre." |
| Escenario inválido* | ❌ Error | "Debés seleccionar un escenario válido." |
| Todos válidos | ✅ Correcto | (Verde - "Lista para continuar") |

*Solo valida si `escenarios` array tiene elementos

---

## 4. Resultados de Pruebas

### Pruebas Manuales Ejecutadas ✅

**Prueba 1: Renderizado de Selector**
- ✅ Botón "✓ Antártida" aparece en zona de campaña
- ✅ Clase `scenario-active` aplicada al seleccionado
- ✅ Estilo cyan/checkmark visible y correcto

**Prueba 2: Datos de Campaign Draft**
- ✅ `obtenerEscenario()` retorna 'antartida'
- ✅ Campaign Draft inicializa con escenario default

**Prueba 3: Adición de Misión**
- ✅ Misión agregada a draft correctamente
- ✅ Validador cambia a verde (error de "0 misiones" desaparece)
- ✅ Resumen muestra "Misiones: 1"

**Prueba 4: Actualización de Nombre**
- ✅ Nombre se refleja en Summary en tiempo real
- ✅ Publicación de cambios en Campaign Draft correcta
- ✅ Validador actualiza estado (advertencia desaparece)
- ✅ Escenario mantiene su valor: "Escenario: Antártida"

**Prueba 5: Persistencia de Escenario**
- ✅ Escenario persiste al agregar misiones
- ✅ Escenario persiste al cambiar nombre
- ✅ Escenario se muestra correctamente en Summary

**Prueba 6: Integración Validator-Renderer**
- ✅ Validator recibe escenarios array correctamente
- ✅ No hay errores de validación de escenario (es válido)
- ✅ UI refleja estado validator en tiempo real

---

## 5. Puntos Resueltos

✅ **Selección de escenario funcional**: Docente puede ver escenario con botón "Antártida" presente

✅ **Integración con Campaign Draft**: Escenario almacenado en modelo de datos

✅ **Validación en tiempo real**: Validator acepta escenarios según registro

✅ **Actualización inmediata**: UI re-renderiza sin necesidad de refresh manual

✅ **Persistencia de datos**: Escenario mantiene valor durante operaciones UI

✅ **Arquitectura VSR** (Validator-Studio-Renderer): Comunicación clara y unidireccional

---

## 6. Restricciones Respetadas

✅ No modificado: js/studio/acciones/campaign-actions.js
✅ No modificado: js/studio/adapter.js
✅ No modificado: CRIOS OS core (escenarios, misiones, etc.)
✅ No modificado: Lógica de Campaign Actions

⚠️ **Modificado por autorización**: studio/index.html - necesario para cargar escenarios en contexto Studio

---

## 7. Criterios de Aceptación

| Criterio | Estado | Evidencia |
|----------|--------|-----------|
| Selector visible | ✅ | Botón "✓ Antártida" en interfaz |
| Parte de Campaign Draft | ✅ | `obtenerEscenario()` / `establecerEscenario()` funcional |
| Validación automática | ✅ | Validator opera sin errores |
| Actualización inmediata | ✅ | Summary se actualiza sin refresh |
| Comunicación VSR | ✅ | Flujo Validator→Studio→Renderer correcto |

**RESULTADO FINAL: TODOS LOS CRITERIOS COMPLETADOS ✅**

