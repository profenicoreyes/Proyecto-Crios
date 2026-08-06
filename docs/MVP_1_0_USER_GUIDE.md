# CRIOS MVP 1.0 — guía breve de uso

## 1. Requisitos

- Servir la raíz del repositorio mediante HTTP local, GitHub Pages o un servidor estático equivalente.
- Usar un navegador de escritorio moderno. La aceptación final se ejecutó en Microsoft Edge 151.
- Permitir `localStorage`, porque las publicaciones, sesiones y el progreso se conservan localmente.
- Mantener el dispositivo en orientación horizontal cuando CRIOS muestre el aviso de rotación.

No se recomienda abrir los HTML directamente mediante `file://`.

## 2. Preparar y publicar una campaña

1. Abrir `studio/index.html`.
2. Revisar el banco de misiones.
3. Agregar las misiones deseadas al Campaign Draft.
4. Ordenarlas y completar los datos de campaña necesarios.
5. Verificar que el resumen y la validación no indiquen bloqueos.
6. Publicar el Draft.
7. Activar la publicación creada.

Publicar crea una versión inmutable. Publicar no activa automáticamente.

## 3. Abrir la campaña en CRIOS

Con una publicación activa y persistida, Studio muestra **Abrir campaña en CRIOS**.

1. Presionar ese acceso.
2. Confirmar que se abre CRIOS en modo `published`.
3. Completar nombre, personaje y grupo.
4. Confirmar la identidad.
5. Presionar **Continuar campaña**.

Una referencia publicada inválida, desactivada, corrupta o incompatible se bloquea. No existe fallback silencioso hacia `legacy`.

## 4. Completar el recorrido

1. En el mapa, abrir la misión disponible.
2. Resolverla y confirmar el resultado.
3. Volver al mapa.
4. Repetir el proceso hasta completar las cuatro misiones.
5. Abrir el protocolo final cuando quede habilitado.
6. Completar el procedimiento final.
7. Continuar hacia créditos.

El progreso del recorrido publicado se guarda en el navegador.

## 5. Recargar y reanudar

Al recargar:

- la aplicación vuelve a solicitar la confirmación de identidad;
- mantiene la publicación y el identificador de sesión válidos;
- conserva las misiones resueltas;
- conserva la finalización cuando la campaña ya fue completada.

## 6. Comenzar una sesión nueva

Desde los controles finales puede iniciarse una sesión nueva.

La nueva sesión:

- usa un identificador diferente;
- comienza con progreso 0/4;
- mantiene disponible la publicación;
- no conserva la identidad ni el resultado final de la sesión anterior.

## 7. Bloqueos frecuentes

### No aparece “Abrir campaña en CRIOS”

Comprobar que:

- la campaña fue publicada;
- la publicación fue activada;
- la persistencia local está disponible;
- la publicación activa sigue siendo coherente.

### CRIOS solicita girar el dispositivo

Cambiar a orientación horizontal. El recorrido angosto aceptado utiliza esa orientación.

### La publicación no abre

Volver a Studio y revisar el estado de publicación, activación y persistencia. Los datos corruptos o incompatibles se bloquean deliberadamente y no se sustituyen de forma automática.

### Se necesita conservar una campaña entre equipos

El MVP no sincroniza datos entre dispositivos. La persistencia es local al navegador utilizado.

## 8. Alcance de esta guía

Esta guía cubre el recorrido feliz aceptado de CRIOS MVP 1.0. No documenta como capacidades cerradas:

- backend o cuentas;
- colaboración multiusuario;
- sincronización remota;
- compatibilidad universal con dispositivos y navegadores;
- escenarios publicados específicos de rollback posterior a Progress, respuesta incorrecta y game over, que conservan evidencia parcial.
