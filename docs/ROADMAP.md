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
- Integración operativa inicial de `published` cerrada con selección explícita en Runtime, acceso desde Studio, runner E2E durable y correcciones de reanudación de sesión.
- A2-013 cerrado con extracción incremental de Evaluation, Progress y decisión de navegación de misión, más contratos inmutables de PlayerStateResult y RuntimeResult integrados en Game Flow.

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

### Integración operativa inicial de `published`

La integración queda cerrada en cinco commits funcionales:

- `5fd690318767b52c3e1251dcdf5545ec9c82927b` — `feat(runtime): add published launch contract`.
- `55052895b3caef98d60494939ae102e16a8bb886` — `feat(runtime): integrate published launch selection`.
- `3bbc2ace5567e14a068aa26254109a10d4a1dde1` — `feat(studio): add published runtime launch entry`.
- `b875c862b1e4db71eff3ff10034086fcb9898b3f` — `test(runtime): add published launch operational e2e`.
- `56ee4ec5148916dbef2dd89e098b54e1996380a6` — `fix(runtime): guard published session resume`.

El contrato operativo conserva estas decisiones:

- `published` solo se selecciona mediante una solicitud explícita; `legacy` continúa como modo predeterminado.
- No existe fallback silencioso desde una referencia published inválida. La recuperación legacy requiere `source=legacy`.
- Studio muestra `Abrir campaña en CRIOS` únicamente para una publicación activa y persistida.
- Desactivar la publicación bloquea los enlaces anteriores y limpia sus atributos y metadatos; reactivarla restaura el enlace.
- Las referencias corruptas, publicaciones incompatibles y documentos persistentes corruptos se bloquean sin sustitución automática.
- La selección mantiene aislamiento entre sesiones, campañas y publicaciones, y una sesión published conserva la publicación fijada.
- Una recarga published vuelve a solicitar confirmación de identidad antes de reconstruir la publicación, mantiene el mismo `idSesion` y conserva el progreso resuelto.
- Una entrada explícita `source=legacy` no reutiliza visualmente ni persiste como legacy una sesión published anterior; crea una sesión legacy nueva.

La evidencia acumulada registra:

- contrato de lanzamiento: 44/44;
- selección en Runtime: 49/49;
- acceso desde Studio: 49/49;
- runner E2E operativo inicial: 112/112;
- runner E2E ampliado tras la auditoría: 136/136;
- cero errores de página, consola o promesas en los resultados funcionales cerrados.

Las pérdidas de `pageId` del navegador integrado de VS Code y la salida vacía de `msedge --dump-dom` fueron fallos del controlador o del entorno, no fallos funcionales del producto. No se usan como evidencia negativa ni justifican nuevos cambios de producción.

### A2-013 — contratos de dominio y resultados inmutables en Game Flow

La extracción incremental queda cerrada en doce commits locales:

- `d957f535ea2a31f4684b6270dc0152b4dd67f16b` y `58878946faf80a2a753deb856811d892acd0c204` — contrato e integración de Evaluation.
- `4f94a84987e012c04561a519b88dc6555e02ba4e` y `1ab865116325702d7d19d55016e7447e8c71ff9e` — contrato e integración de Progress.
- `1b8cac12f476e7a38222963107deb8db11384450` y `f154762511b66fded0135ac38cf698c220dbfa4e` — contrato e integración de la decisión de navegación de misión.
- `bb96a9f215a32174c87d8de1fa29c6bbb3b841c1`, `99f89d43a232c92b9623064e2134d329f9404ed0` y `c661698d3da0d1301ab37854d6f5fc6294c0bb94` — caracterización, contrato inmutable e integración de PlayerStateResult.
- `d1f54ba8069e5ea7bad1fc2ed5c661138b1fcf06`, `e9ca1ae0a675ac08895e0ff2e9b9d66d03a7e192` y `28ab938c1432c613fd7e3228a44296f4584cf5cf` — caracterización de RuntimeCore, contrato inmutable RuntimeResult e integración en Game Flow.

El cierre preserva estas fronteras:

- Game Flow mantiene el orden PlayerState → Progress → Runtime → Navigation y valida resultados mediante contratos canónicos.
- El adaptador legacy crea snapshots inmutables para PlayerStateResult y RuntimeResult antes de continuar el flujo.
- Navigation recibe el RuntimeResult validado completo; Runtime se reconstruye una sola vez por ejecución.
- `js/crios.js`, `js/runtime/runtime-core.js` y `js/navigation/navigation-core.js` no fueron modificados por la integración final de RuntimeResult.
- RuntimeCore y NavigationCore conservan por ahora su composición legacy mediante `window.CRIOS_DOMAIN`.
- Transacción, rollback, persistencia local, sincronización remota, DOM, audio y cambio visual continúan fuera de los contratos puros y siguen perteneciendo a `js/crios.js`.

La evidencia de cierre registra:

- EvaluationModel: 18/18;
- ProgressModel: 24/24;
- MissionNavigationModel: 22/22;
- PlayerStateService: 13/13;
- PlayerStateResultModel: 20/20;
- RuntimeCore: 25/25;
- RuntimeResultModel: 28/28;
- Game Flow Core: 28/28;
- adaptador legacy: 19/19;
- integración real de navegador: 24/24, sin errores de página, consola, requests fallidos ni requests externos.

El respaldo `Proyecto-Crios-28ab938c1432c613-main.bundle` fue verificado contra `main` en `28ab938c1432c613fd7e3228a44296f4584cf5cf`; su SHA-256 es `e20bac242baf9153b8e3f117f28d2546bc0905695521e809b8877c716be57e4c`. El parche externo de integración fue eliminado únicamente después de verificar ese respaldo.

A2-013 no declara finalizada la extracción de toda la orquestación legacy. Cierra los contratos enumerados y deja explícitamente fuera las fronteras de efectos y ownership todavía alojadas en `js/crios.js`.

## Trabajo posterior

Con la integración operativa inicial de `published` y A2-013 cerrados, siguen como líneas posibles, sujetas a nueva investigación y decisión de arquitectura:

- ampliar gradualmente el uso real de publicaciones sin eliminar prematuramente el fallback legacy;
- investigar por separado si RuntimeCore y NavigationCore deben dejar de depender de `window.CRIOS_DOMAIN`;
- delimitar ownership de transacción, rollback, persistencia, sincronización remota y aplicación visual antes de trasladar cualquiera de esos efectos;
- consolidar Game Flow como dueño de más transiciones solo cuando cada borde pueda aislarse, validarse y revertirse;
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

Esta actualización toma como baseline local el commit `28ab938c1432c613fd7e3228a44296f4584cf5cf`, creado el 4 de agosto de 2026. El commit documental que incorpore esta actualización será posterior.

El push permanece diferido. Esta actualización no afirma que `origin/main` esté alineado con el estado local.

La secuencia puede cambiar únicamente ante evidencia explícita más reciente y una nueva decisión de arquitectura.
