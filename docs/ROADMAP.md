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
- A2-006J / RT-007 cerrado con validación de Runtime, Studio y disponibilidad degradada controlada.
- Sincronización de la documentación transversal con el estado implementado.
- Commit funcional y commit documental creados y publicados en `origin/main`.

## Trabajo actual cerrado

A2-006J / RT-007 está `CLOSED`.

La evidencia cerrada registra:

- sintaxis `PASS_3_OF_3`;
- cinco corridas oficiales aprobadas;
- regresiones `PASS_1226_OF_1226`;
- smoke de Runtime y Studio `PASS_2_OF_2`;
- cero errores funcionales conocidos en el alcance validado.

RT-007 produjo evidencia experimental sobre cómo cambian los resultados ante degradaciones de dominio, red, storage, recuperación y orden temporal. Esa evidencia no demuestra por sí sola garantías universales.

## Próximo trabajo: RT-006

RT-006 es el próximo trabajo y no se ejecuta como parte de este cierre documental. Su objetivo es:

- organizar la evidencia acumulada;
- comparar resultados entre escenarios;
- consolidar relaciones y garantías observadas;
- detectar contradicciones, huecos o evidencia insuficiente;
- preparar una base verificable para RT-008.

## Trabajo posterior

La secuencia confirmada es:

1. RT-006: síntesis y comparación de evidencia.
2. RT-008: falsación final de garantías globales.
3. Integración operativa real de `published`.

La integración operativa de `published` comienza después de RT-008. Los contratos, módulos y caminos controlados ya implementados no equivalen a declarar ese modo como operación principal desplegada.

## Capacidades futuras

Permanecen futuras hasta contar con implementación y evidencia específicas:

- adopción operativa de `published` como flujo real del producto;
- extracción completa de Game Flow, Evaluation y Progress respecto de la orquestación legacy;
- persistencia remota, sincronización entre dispositivos y colaboración multiusuario;
- creación visual de nuevos handlers, tipos de misión, escenarios y taxonomías;
- garantías de disponibilidad más amplias que los experimentos controlados.

## Estado técnico fechado

Al 29 de julio de 2026, `main` local y `origin/main` están alineados en `32fd69067ab3bd8a3d0aca800a8ee213993938d6`. Este hash identifica el estado técnico de esta actualización; no es una regla permanente del roadmap.

La secuencia puede cambiar únicamente ante evidencia explícita más reciente y una nueva decisión de arquitectura.
