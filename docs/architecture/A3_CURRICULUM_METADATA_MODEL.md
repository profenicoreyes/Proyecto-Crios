# A3 — Modelo de metadatos curriculares ANEP y estimaciones CRIOS

## 1. Objetivo

A3-003B6A separa los metadatos pedagógicos que pertenecen a CRIOS de las decisiones que pertenecen al docente al componer una campaña.

La duración estimada, la dificultad y la referencia curricular sugerida ya no son entradas manuales del Campaign Draft. Cada misión del catálogo declara esos datos y Studio deriva la información agregada de la campaña a partir de las misiones seleccionadas.

Este cambio corrige además el defecto detectado durante B6: Studio mostraba controles de duración, dificultad y nivel que no eran propietarios reales del estado del Draft, por lo que la duración volvía a cero al validar. La solución no consiste en persistir controles redundantes, sino en eliminar esa duplicación y usar la fuente pedagógica canónica de cada misión.

## 2. Jerarquía y gramática curricular

CRIOS usa la terminología de ANEP y conserva la referencia normativa de cada mapeo. La jerarquía adoptada es:

1. Marco Curricular Nacional (MCN).
2. Progresiones de Aprendizaje y Perfiles de Tramo.
3. Planes vigentes de EBI/EMS y de DGETP cuando corresponde.
4. Programa vigente de la unidad curricular y sus ajustes.

Gramática de tramos almacenada por el catálogo curricular:

- EBI · Tramo 5 · 7.º y 8.º grado.
- EBI · Tramo 6 · 9.º grado.
- EMS · Tramo 7 · 1.er grado.
- EMS · Tramo 8 · 2.º y 3.er grado.

El catálogo está preparado para referencias DGES y DGETP. No se usa `educacion-media` como referencia curricular presentada al docente. El valor legacy que todavía existe dentro del contrato ejecutable de algunas mission specs se conserva únicamente por compatibilidad del Runtime y no constituye la fuente curricular nueva.

## 3. Referencia vigente para las misiones de áreas

Las cuatro misiones actualmente implementadas de áreas se mapean a:

- organismo: ANEP;
- marco: Marco Curricular Nacional;
- nivel: Educación Básica Integrada (EBI);
- tramo: 5;
- grado sugerido: 7.º;
- subsistemas: DGES y DGETP;
- componente: Alfabetizaciones fundamentales;
- espacio curricular: Científico-Matemático;
- unidad curricular: Matemática;
- eje: Figura;
- contenido: Perímetros, áreas, volúmenes;
- tipo: Contenido para la profundización.

Fuente oficial canónica de CRIOS para este mapeo:

- `Programa de Educación Básica Integrada. Matemática. Tramo 5 | Grados 7.º y 8.º`;
- ajuste 2024;
- sección de 7.º grado, eje Figura y orientaciones metodológicas;
- URL: `https://www.anep.edu.uy/sites/default/files/images/te-programas/2024/ajustes/3er_ciclo/Matem%C3%A1tica%20-%20Tramo%205%20-%202024.pdf`;
- verificación de vigencia realizada el 2026-08-08.

El programa ubica `Perímetros, áreas, volúmenes` como contenido para la profundización de 7.º grado y recomienda integrar su cálculo en actividades interdisciplinarias. La referencia de CRIOS es sugerida: describe la alineación pedagógica de la misión, no impide que un docente la use en otro contexto cuando lo considere adecuado.

## 4. Contrato de misión

Cada misión registrable debe declarar, además de su contrato existente:

- `clasificacion.dificultad`: entero de 1 a 6, definido por CRIOS;
- `duracionEstimadaMinutos`: entero positivo, definido por CRIOS;
- `curriculum`: referencia canónica producida por `CRIOS_CURRICULUM.createMissionReference(...)`.

`js/nucleo/registro-misiones.js` rechaza una misión que no cumpla esas condiciones.

La dificultad CRIOS es una estimación interna del producto. No se presenta como una categoría oficial de ANEP.

## 5. Derivación de campaña

Studio calcula la información de campaña sin pedirla al docente.

### Duración estimada

Es la suma de `duracionEstimadaMinutos` de todas las misiones seleccionadas.

### Dificultad estimada

Es el promedio aritmético de las dificultades propias de las misiones seleccionadas. Se conserva en la escala CRIOS 1–6 y se muestra con una cifra decimal.

Ejemplo: dificultades `2, 2, 3` producen dificultad de campaña `2,3 / 6`.

### Referencia curricular sugerida

`CRIOS_CURRICULUM.deriveCampaignReference(...)` calcula la intersección de grados sugeridos y subsistemas de las referencias de las misiones.

- Si existe una referencia común, Studio muestra esa referencia.
- Si las misiones no comparten una referencia común, la campaña puede seguir componiéndose, pero el validador emite una advertencia de referencia curricular mixta.
- No se calcula un “promedio de grados”.

## 6. Nota docente por misión

Al agregar una misión al Campaign Draft se crea `notaDocente: ""` en la copia de esa misión dentro de la campaña.

La nota:

- es opcional;
- admite hasta 500 caracteres;
- pertenece a esa aparición de la misión en esa campaña;
- no modifica la misión base del catálogo;
- viaja con el contenido publicable y queda cubierta por `contentHash`;
- no es interpretada por Runtime ni modifica la dificultad, duración o referencia curricular.

El campo queda deliberadamente libre para que el docente pueda registrar una indicación, observación o criterio breve sin imponer todavía un contrato de calificación separado.

## 7. Studio

La sección Configuración deja de ofrecer controles manuales de:

- dificultad;
- duración;
- nivel/grado;
- modalidad no conectada a comportamiento real.

En su lugar muestra un bloque informativo de estimación automática con:

- dificultad de campaña;
- duración total;
- referencia curricular sugerida;
- subsistemas compatibles.

Cada tarjeta de misión muestra dificultad, duración y referencia curricular propias, y agrega el campo opcional `Nota docente`.

## 8. Validación

`campaign-validator.js` deja de exigir `draft.duracion` y `draft.nivel`.

Valida en cambio que cada misión seleccionada tenga:

- dificultad CRIOS válida;
- duración positiva;
- referencia curricular catalogada válida;
- nota docente dentro del límite de longitud.

Una referencia curricular mixta genera advertencia, no error de publicación.

## 9. Publicación y Runtime

Los nuevos campos `curriculum` y `notaDocente` forman parte de las misiones contenidas en el snapshot publicable. Por lo tanto su contenido queda protegido por el `contentHash` de la publicación remota.

No se modifica el `runtimeExecutionManifest`, el contrato de `missionSpec`, los handlers ni la materialización ejecutable. Runtime puede ignorar estos metadatos descriptivos sin perder compatibilidad.

Esto permite enriquecer Studio y la publicación sin acoplar el contrato curricular al handler de geometría.

## 10. Validación de A3-003B6A

El tramo debe demostrar antes del commit:

- sintaxis válida de todos los módulos modificados;
- pruebas del catálogo curricular y gramática ANEP;
- las cuatro misiones actuales referenciadas al catálogo canónico;
- suma correcta de duración;
- promedio aritmético correcto de dificultad;
- persistencia de `notaDocente` sin mutar el catálogo base;
- ausencia de controles manuales redundantes en Studio;
- validador sin dependencia de `draft.duracion` o `draft.nivel`;
- regresiones Node existentes sin fallas;
- comprobación manual en navegador de Studio antes del commit.

## 11. Punto de recuperación previo

Estado inmediatamente anterior a A3-003B6A:

- rama: `main`;
- HEAD: `f06f6a270fb1c533ec14ffbb1a6316d4ab1fbc0f`;
- subject: `feat(publication): enable controlled remote endpoint`;
- bundle: `Proyecto-Crios-f06f6a270fb1c533-main.bundle`;
- tamaño: `2978462` bytes;
- SHA-256: `f903b5ecf9b257f1b8b6701389d04b49171b8928f579c042a12fd5ae8a3ae65b`.

Ese bundle permanece vigente hasta que A3-003B6A sea validado manualmente, comprometido y reemplazado por un bundle nuevo verificado.

## 12. Rollback

Antes de un commit B6A, el candidato completo puede desandarse aplicando el patch en reversa, siempre que el reverse-check confirme coincidencia exacta.

Después del commit B6A, revertir el commit de este tramo devuelve Studio, catálogo y validador al estado B5B. No requiere migración del backend porque B6A no altera el contrato remoto ni escribe datos por sí mismo.

Si ya existen publicaciones creadas con `curriculum` o `notaDocente`, las versiones anteriores del Runtime siguen pudiendo ignorar esos campos adicionales; no deben eliminarse ni reescribirse publicaciones históricas durante un rollback.
