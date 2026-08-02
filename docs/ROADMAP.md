# CRIOS Roadmap

## Propósito

Este roadmap ordena el trabajo confirmado y separa estado implementado de capacidades futuras. El estado técnico se demuestra con código, pruebas, contratos, documentación versionada y checkpoints cerrados; una entrada futura no constituye una garantía disponible.

## Trabajo terminado

- Studio base, banco de cuatro misiones, Campaign Draft, selector de escenario Antártida y resumen de campaña.
- Dominio modular de Release, Session, Runtime, Navigation y PlayerState integrado con compatibilidad legacy.
- Núcleo de publicación, activación y persistencia local dentro del alcance validado.
- Contrato de `missionSpecs`, resolución de publicación ejecutable y materialización de misiones.
- Bootstrap de Runtime en modos explícitos `legacy` y `published`, con `legacy` como valor predeterminado.
- Trazabilidad acotada y contratos experimentales para observar el flujo sin convertir trazas en estado de dominio.
- A2-006J / RT-007 cerrado con evidencia de disponibilidad degradada, recuperación y orden temporal.
- A2-006K / RT-006 cerrado con síntesis, comparación y matriz de contradicciones de la evidencia RT-001 a RT-007.
- A2-011 cerrado con núcleo puro de Game Flow, adaptador legacy, primera integración real, rollback atómico y corrección de acceso a campaña en pantallas angostas.
- A2-012 / RT-008 cerrado con falsación de la garantía documental global `DC-030`.

## Cierres recientes

### A2-006K / RT-006 — síntesis y contradicciones

- Commit de cierre: `0c839e05e1cf219a7b17dbc0c03fda8d33e17eff`.
- Resultado técnico cerrado: `PASS`, 63/63 comprobaciones.
- Integridad de fuentes y ejecución: `PASS`.
- La matriz preserva dos afirmaciones contradichas y distingue contradicción, coincidencia finita, evidencia insuficiente e indeterminación.

RT-006 organiza evidencia cerrada. No convierte una muestra finita en garantía universal.

### A2-011 — primera integración de Game Flow

- Estado funcional final: `11ed7d81fe5ef36955761c180b43bf7b4c146503`.
- Game Flow conserva el orden: resultado de evaluación → PlayerState → Progress → reconstrucción de Runtime → Navigation → decisión declarativa.
- La integración legacy incluye rollback atómico ante fallos posteriores a la mutación de progreso.
- La evidencia de cierre combina regresión, pruebas focales, sintaxis, smoke funcional y validación real del acceso a campaña en pantalla angosta.

A2-011 integra un primer borde real sin declarar completada la extracción total de Evaluation, Progress ni de toda la orquestación legacy.

### A2-012 / RT-008 — falsación de garantía global

- Commit de cierre: `17f70e495801ec215874871bff9749dcd48dd888`.
- Runner mínimo: 39/39 comprobaciones aprobadas.
- Claim evaluado: `DC-030`.
- Clasificación: `CONTRADICTED`.
- Veredicto: `GLOBAL_DOCUMENTATION_GUARANTEE_FALSIFIED`.
- Contraejemplos preservados: `RT-001 / DC-013` y `RT-006 / DC-028`.
- Coincidencias finitas preservadas: RT-002, RT-003, RT-004, RT-005 y RT-007.
- La validación usa únicamente evidencia cerrada: no reabre runners anteriores, no carga producción, no escribe storage y no realiza red externa.

La conclusión es acotada: declarar completa una documentación no garantiza por sí solo el comportamiento real en todas las corridas. No implica que toda la documentación sea incorrecta ni que las coincidencias observadas carezcan de valor.

## Próximo trabajo: integración operativa real de `published`

RT-008 cierra la secuencia experimental previa. El siguiente trabajo confirmado es llevar `published` desde contratos y caminos controlados hacia una integración operativa real del producto.

Antes de implementar se requiere una investigación focal y un plan técnico aprobado. Esa investigación debe determinar, sin asumir todavía una solución:

- dónde se selecciona actualmente la fuente `legacy` o `published`;
- cómo se conectan publicación, activación, persistencia y bootstrap de Runtime;
- cuál es el borde mínimo para resolver una publicación activa en una sesión real;
- qué fallback explícito conserva el funcionamiento legacy;
- qué estados, errores y rollbacks deben quedar definidos;
- qué pruebas focales demuestran el camino directo y el inverso sin reabrir trabajo cerrado.

La integración se considerará operativa únicamente cuando exista un recorrido real y verificable desde una publicación válida hasta una misión ejecutable, con comportamiento de fallo controlado y sin romper el flujo legacy. Hasta ese cierre, `legacy` continúa como modo predeterminado.

## Trabajo posterior

Después de la integración operativa inicial de `published`, siguen como líneas posibles, sujetas a nueva decisión de arquitectura:

- ampliar gradualmente el uso real de publicaciones sin eliminar prematuramente el fallback legacy;
- completar la extracción de Evaluation y Progress respecto de la orquestación legacy;
- consolidar Game Flow como dueño de más transiciones solo cuando cada borde pueda aislarse y revertirse;
- ampliar Studio con nuevos handlers, tipos de misión, escenarios y taxonomías;
- evaluar persistencia remota, sincronización entre dispositivos y colaboración multiusuario.

## Capacidades futuras

Permanecen futuras hasta contar con implementación y evidencia específicas:

- declarar `published` como modo principal del producto;
- eliminar el camino legacy;
- persistencia remota y garantías de sincronización entre dispositivos;
- colaboración multiusuario;
- garantías universales de disponibilidad, red, storage o scheduler externo.

## Estado técnico fechado

Esta actualización toma como baseline local el commit de A2-012 `17f70e495801ec215874871bff9749dcd48dd888`, creado el 2 de agosto de 2026. El commit documental que incorpore esta actualización será posterior.

El push permanece diferido. Esta actualización no afirma que `origin/main` esté alineado con el estado local.

La secuencia puede cambiar únicamente ante evidencia explícita más reciente y una nueva decisión de arquitectura.
