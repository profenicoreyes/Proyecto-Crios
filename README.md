# CRIOS OS — MVP 1.0

Aplicación web educativa inmersiva organizada mediante campañas, misiones y una narrativa científica situada en una base antártica.

## Estado actual

CRIOS MVP 1.0 tiene aceptado el recorrido publicado completo:

- composición y publicación de una campaña desde Studio;
- activación y lanzamiento explícito en CRIOS;
- identidad y sesión del operador;
- cuatro misiones ejecutables;
- evaluación, progreso, Runtime, Navigation y Game Flow;
- protocolo final y créditos;
- recarga, reanudación y creación de una sesión nueva.

La validación agregada sobre el commit funcional `a01a89f71fb7a8063ac3994011b798459416a6a0` aprobó **417/417** comprobaciones:

- arquitectura y regresiones relacionadas: 141/141;
- recorrido MVP publicado: 110/110;
- aceptación visual: 166/166;
- revisión visual manual: aprobada;
- errores de página, consola, warnings y promesas no controladas: 0.

## Uso

La guía operativa está en [`docs/MVP_1_0_USER_GUIDE.md`](docs/MVP_1_0_USER_GUIDE.md).

Entradas principales:

- Studio: `studio/index.html`;
- CRIOS: `index.html`.

La aplicación debe servirse mediante HTTP local, GitHub Pages o un servidor estático equivalente. No se recomienda abrirla directamente con `file://`.

## Documentación principal

- [`docs/MVP_1_0.md`](docs/MVP_1_0.md) — alcance y criterios de aceptación.
- [`docs/MVP_1_0_COVERAGE_MATRIX.md`](docs/MVP_1_0_COVERAGE_MATRIX.md) — cobertura y brechas no bloqueantes.
- [`docs/MVP_1_0_USER_GUIDE.md`](docs/MVP_1_0_USER_GUIDE.md) — recorrido de uso.
- [`docs/ROADMAP.md`](docs/ROADMAP.md) — estado técnico y trabajo posterior.
- [`docs/STUDIO.md`](docs/STUDIO.md) — arquitectura y límites de Studio.
- [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) — arquitectura general.

## Límites del MVP

El modo `legacy` continúa disponible y sigue siendo el modo predeterminado cuando no existe una solicitud `published` explícita. La persistencia es local al navegador. El MVP no incluye backend, cuentas, colaboración, sincronización entre dispositivos ni garantías universales para cualquier navegador, dispositivo, red o storage.
