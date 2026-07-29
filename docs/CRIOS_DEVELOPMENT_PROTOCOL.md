# CRIOS Development Protocol

## 1. Propósito

Este protocolo regula cambios de producción, pruebas, evidencia y documentación. Cada tarea debe conservar compatibilidad legacy, contratos públicos y límites de ownership salvo autorización arquitectónica explícita.

Las restricciones de la tarea prevalecen. Si el objetivo exige salir del alcance, se detiene el trabajo y se informa el conflicto; no se amplía el cambio por iniciativa propia.

## 2. Investigación previa

Antes de editar:

1. validar rama, HEAD, staging y worktree;
2. capturar el baseline Git solicitado;
3. leer el código que controla el comportamiento y la evidencia cercana;
4. identificar productor, consumidor, propietario y contrato de cada dato afectado;
5. formular una hipótesis falsable y una comprobación económica;
6. confirmar que las rutas autorizadas son suficientes.

La planificación futura orienta, pero no prueba el estado implementado. Las afirmaciones deben rastrearse a código, test, contrato, baseline o matriz versionada.

## 3. Implementación

- realizar cambios pequeños, reversibles y limitados al requisito;
- conservar nombres y formas de APIs públicas salvo autorización expresa;
- no introducir estado duplicado ni dependencias circulares;
- no mezclar refactorizaciones cosméticas con cambios funcionales;
- no modificar producción para resolver problemas de navegador, servidor, VS Code, caché o automatización;
- no corregir defectos previos ajenos salvo que bloqueen el objetivo y exista autorización;
- usar comandos compatibles con Windows PowerShell 5.1: separar comandos con `;`, evitar `&&` y no depender de sintaxis exclusiva de PowerShell 7.

Cada cambio de contrato debe declarar productor, consumidores, compatibilidad e impacto.

## 4. Producción, pruebas y evidencia

- producción implementa el comportamiento;
- pruebas observan y falsan afirmaciones sin convertirse en dependencias de producción;
- fixtures controlan datos y dependencias del harness;
- contratos describen formas y garantías verificadas;
- baselines y matrices registran el flujo observado y sus límites;
- checkpoints externos conservan el estado operativo de una investigación sin incorporarse automáticamente al repositorio.

No se modifica producción para hacer coincidir una expectativa documental o un fallo del tooling. Primero se clasifica la diferencia.

## 5. Verificación directa e inversa

Después del primer cambio sustantivo se ejecuta la comprobación focal más barata que pueda refutar la hipótesis. Luego, según el riesgo:

1. validar sintaxis o estructura del archivo tocado;
2. ejecutar pruebas focales del comportamiento;
3. ejecutar regresiones autorizadas;
4. realizar smoke real por HTTP cuando corresponda;
5. comprobar referencias, storage, consola, red y efectos laterales;
6. revisar en sentido inverso que no cambiaron archivos, APIs, estado Git o checkpoints fuera del alcance.

La verificación directa pregunta si funciona lo solicitado. La inversa pregunta qué más cambió, qué quedó sin demostrar y si se preservó el baseline.

## 6. Warnings, fallos funcionales y tooling

Todo warning se clasifica con evidencia:

- esperado e inocuo para el caso controlado;
- preexistente y no bloqueante;
- causado por el cambio;
- indeterminado y bloqueante hasta investigar.

Un fallo funcional es una diferencia observable del producto o contrato. Un fallo de tooling proviene del servidor, automatización, navegador, caché, permisos o entorno. El segundo no autoriza parchar producción. Se documentan por separado el archivo del workspace, el recurso ejecutado y la comprobación que distingue ambos casos.

## 7. Storage y bootstrap

El smoke debe capturar storage antes y después. En el arranque legacy son escrituras esperadas de bootstrap:

- `crios-campana-activa`;
- `crios-progreso-campanas-v1`.

No se clasifican como contaminación si su valor y momento coinciden con el flujo implementado. Otras mutaciones deben justificarse por el escenario. La persistencia de publicación usa `localStorage` y es independiente del progreso legacy en `sessionStorage`.

En modo `published`, el bootstrap debe validar configuración, identidad, dependencias, referencia o publicación fijada, hash y handlers antes de exponer la campaña preparada. No se permite fallback silencioso a legacy.

## 8. Checkpoints y baseline Git

Un checkpoint externo registra evidencia, corridas, resultado y siguiente acción. No reemplaza Git ni se modifica fuera del alcance autorizado.

Durante una tarea se preservan rama y HEAD esperados, staging inicial, cambios preexistentes, archivos excluidos y checkpoint. No usar `reset`, `checkout` o limpieza para obtener un worktree conveniente. Si aparecen rutas inesperadas, detenerse y mostrarlas sin modificar nada.

## 9. Cierre, stage, commit y push

El cierre funcional confirma que implementación y validaciones requeridas terminaron. El cierre documental confirma que la documentación transversal describe ese estado. Ninguno crea por sí mismo un commit.

- `stage` selecciona una frontera exacta; requiere comprobar faltantes y extras;
- `commit` versiona lo staged; requiere autorización explícita;
- `push` publica commits en un remoto; requiere una autorización explícita separada;
- un checkpoint no equivale a stage, commit ni push.

No avanzar automáticamente al siguiente requisito, sprint o experimento. Al terminar, informar estado, evidencia, riesgos y siguiente decisión pendiente, y esperar instrucciones.

## 10. Ejemplos, no reglas permanentes

Un hash de commit, puerto, timestamp, cantidad de pruebas o identificador RT usado en una tarea es evidencia de esa ejecución. Debe etiquetarse como ejemplo o baseline puntual y no transformarse en regla permanente.
