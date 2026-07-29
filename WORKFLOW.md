# CRIOS - Flujo de trabajo vigente

## 1. Principio

El trabajo avanza por decisiones explícitas y evidencia reproducible. Arquitectura, implementación, validación, cierre funcional, versionado y sincronización documental son hitos distintos.

## 2. Secuencia

1. **Decidir arquitectura.** Definir alcance, propietarios, contratos, compatibilidad legacy y criterios de aceptación.
2. **Implementar.** Realizar el cambio mínimo y reversible sin ampliar el sprint.
3. **Validar sintaxis.** Comprobar parseo, carga, estructura y referencias del área tocada.
4. **Ejecutar pruebas focales.** Falsar directamente el comportamiento modificado.
5. **Ejecutar regresiones.** Correr solo la cobertura autorizada y registrar resultados y límites.
6. **Ejecutar smoke real.** Cargar las entradas reales por HTTP y observar UI, consola, red y storage.
7. **Cerrar checkpoint.** Consolidar evidencia, resultado oficial y siguiente acción sin iniciar trabajo nuevo.
8. **Auditar frontera.** Clasificar cada ruta como incluida, diferida o excluida; comprobar dependencias en ambos sentidos.
9. **Crear commit con autorización.** Hacer stage exacto, verificarlo y crear el commit solo después de aprobación explícita.
10. **Revisar documentación transversal.** Sincronizar arquitectura, protocolo, flujo, Studio y escenarios con el commit funcional estable.
11. **Seleccionar el siguiente trabajo.** Examinar pendientes y esperar una decisión antes de comenzar.

Una tarea puede restringir esta secuencia. Nunca se agregan pruebas, commits o pasos no autorizados solo por aparecer en esta lista.

## 3. Conceptos de cierre y versionado

| Concepto | Resultado | No implica |
| --- | --- | --- |
| cierre funcional | comportamiento validado y evidencia consolidada | documentación sincronizada, commit o push |
| checkpoint | estado externo recuperable de la investigación | modificación de Git |
| auditoría de frontera | manifiesto exacto de archivos | stage real |
| stage | selección en el índice de Git | commit |
| commit | versión local de lo staged | push |
| push | publicación explícita al remoto | nueva validación funcional |
| cierre documental | documentos coherentes con el commit estable | commit documental |

La autorización de un paso no autoriza los siguientes. Stage, commit y push son decisiones separadas.

## 4. Evidencia y verificación

Antes de cambiar archivos se captura el estado Git requerido. Después de cada cambio sustantivo se ejecuta una validación focal. Al cerrar se realiza revisión inversa para confirmar:

- solo cambiaron las rutas autorizadas;
- producción, pruebas y evidencia excluida permanecen intactas;
- staging, HEAD y checkpoint conservan el estado esperado;
- no existen referencias rotas ni afirmaciones sin respaldo;
- compatibilidad legacy y arquitectura modular se describen como capas coexistentes cuando así lo muestra el código.

El smoke distingue storage esperado de efectos laterales inesperados. `crios-campana-activa` y `crios-progreso-campanas-v1` son estado de bootstrap legacy esperado cuando el flujo los inicializa.

## 5. Fuentes de verdad

Para estado implementado, el orden de evidencia es:

1. código de producción del commit bajo revisión;
2. pruebas y fixtures que ejercitan ese código;
3. contratos, baselines y matrices versionados con el cambio;
4. checkpoint y estado Git de la ejecución.

Los documentos de planificación no prueban implementación. Chronicle puede ayudar a reconstruir contexto histórico, pero no es obligatorio cuando Git y el checkpoint permiten verificar el estado.

## 6. Detenciones obligatorias

Detenerse y esperar decisión cuando aparecen rutas inesperadas, existe una contradicción de contrato, una afirmación no puede demostrarse, una validación cambia la comprensión o se requiere stage, commit, push o ampliación de alcance sin autorización.

No continuar automáticamente con otro sprint después de cerrar una tarea.
