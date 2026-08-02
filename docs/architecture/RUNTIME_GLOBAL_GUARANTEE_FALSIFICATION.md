# RT-008 — Falsación de la garantía documental global

## 1. Propósito

Evaluar `DC-030`: **“Las afirmaciones globales de completitud documental implican garantía del comportamiento real.”**

RT-008 no vuelve a ejecutar RT-001 a RT-007. Usa su evidencia cerrada y versionada para decidir si existe al menos un contraejemplo concreto. Una desviación directa basta para refutar la implicación global; una cantidad finita de coincidencias nunca basta para confirmarla universalmente.

## 2. Fuentes cerradas

- Matriz de afirmaciones: `docs/architecture/DEMONSTRABLE_CLAIMS_MATRIX.md`.
- Contrato experimental: `docs/architecture/RUNTIME_EXPERIMENT_CONTRACT.md`.
- Síntesis RT-006: commit `0c839e05e1cf219a7b17dbc0c03fda8d33e17eff` (`test(runtime): complete RT-006 contradiction matrix`).
- Runner cerrado de RT-006: `tests/runtime-contradiction-matrix.test.html`.
- Resultado técnico cerrado de RT-006: `PASS`, 63/63 comprobaciones, `sourceIntegrity=PASS`, `executionIntegrity=PASS` y 2 claims contradichos.

La evidencia de A2-011 es posterior y confirma integración operativa acotada de Game Flow, pero no reemplaza ni reabre los experimentos RT-001 a RT-007.

## 3. Regla de decisión

Clasificaciones permitidas:

- `CONTRADICTED`: existe al menos una desviación directa, específica, reproducible y vinculada a una afirmación documental.
- `NO_CONTRADICTION_OBSERVED`: no aparece una desviación dentro del universo finito evaluado; no significa garantía universal.
- `NOT_DEMONSTRATED`: falta evidencia aplicable.
- `INDETERMINATE`: la evidencia existe, pero es inválida, ambigua o no permite una relación causal suficiente.
- `OUT_OF_SCOPE`: la afirmación queda fuera de la frontera declarada.

Regla asimétrica de RT-008:

- un contraejemplo válido refuta `DC-030`;
- ninguna cantidad finita de coincidencias confirma `DC-030` globalmente.

## 4. Tabla de falsación

| Evidencia cerrada | Afirmación relacionada | Observación preservada | Relación con DC-030 | Alcance y límite |
| --- | --- | --- | --- | --- |
| RT-001 | `DC-013`: la finalización técnica equivale a cierre transmitido exitoso de extremo a extremo | RT-006 clasificó `DC-013` como `CONTRADICTED`: el cierre local puede quedar marcado sin confirmación verificable del procesamiento del servidor | `DEVIATION` | Contraejemplo directo dentro del cliente controlado; `no-cors` no permite observar confirmación real del servidor |
| RT-002 | `DC-015`: el cierre persiste y es recuperable tras recarga | `NO_CONTRADICTION_OBSERVED` en la recarga controlada | `FINITE_MATCH` | Coincidencia limitada a los campos y órdenes ejecutados; no demuestra recuperación universal |
| RT-003 | `DC-018`: no existe una rama visible dedicada de `gameOver` | `NO_CONTRADICTION_OBSERVED` dentro del front-end ejecutado | `FINITE_MATCH` | La ausencia solo vale para el universo visible inspeccionado |
| RT-004 | `DC-020`: el ownership de misión convive en varios clústeres | `NO_CONTRADICTION_OBSERVED` en la secuencia de misión ejecutada | `FINITE_MATCH` | No cubre todas las transiciones posibles |
| RT-005 | `DC-024`: callbacks, promesas, timers y tareas diferidas participan del flujo | `NO_CONTRADICTION_OBSERVED` bajo instrumentación controlada | `FINITE_MATCH` | No observa la política interna completa del scheduler |
| RT-006 | `DC-028`: no hay contradicciones entre documentos y código en todos los temas auditados | La matriz cerrada clasificó `DC-028` como `CONTRADICTED` y registró 2 claims contradichos | `DEVIATION` | Contraejemplo derivado de la comparación canónica; no pretende enumerar todas las contradicciones posibles |
| RT-007 | `DC-029`: hay dependencias de integración que solo pueden cerrarse en runtime | `NO_CONTRADICTION_OBSERVED` para la existencia de cambios de resultado bajo disponibilidad degradada | `FINITE_MATCH` | Evidencia contextual; no redefine claims normativos ni garantiza redes o schedulers externos |

## 5. Resultado

- Claim evaluado: `DC-030`.
- Clasificación: `CONTRADICTED`.
- Veredicto: `GLOBAL_DOCUMENTATION_GUARANTEE_FALSIFIED`.
- Contraejemplos preservados: `RT-001 / DC-013` y `RT-006 / DC-028`.
- Coincidencias finitas preservadas: RT-002, RT-003, RT-004, RT-005 y RT-007.

El resultado no afirma que la documentación sea inútil ni que todo el comportamiento esté mal documentado. Afirma algo más acotado: **declarar completa una documentación no garantiza por sí solo el comportamiento real en todas las corridas**.

## 6. Revisión directa e inversa

Recorrido directo:

1. `DC-030` formula una garantía global.
2. RT-006 conserva dos contradicciones concretas vinculadas a afirmaciones documentales.
3. Al menos una de ellas es suficiente para refutar la implicación global.
4. El clasificador produce `CONTRADICTED`.

Recorrido inverso:

1. El veredicto apunta a `DC-030`.
2. `DC-030` apunta a la matriz de afirmaciones y al contrato experimental.
3. Cada desviación apunta a un claim clasificado por RT-006 y a su experimento de origen.
4. Las coincidencias finitas quedan explícitamente impedidas de convertirse en una conclusión universal positiva.

## 7. Implementación de prueba

`tests/runtime-global-guarantee-falsification.test.html` ejecuta únicamente un clasificador puro y determinista sobre el resumen cerrado anterior. No abre iframes, no ejecuta los runners RT-001 a RT-007, no usa producción, no escribe storage, no realiza red externa y no modifica el repositorio.
