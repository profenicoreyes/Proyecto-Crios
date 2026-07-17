CRIOS OS v2.0 — Sprint 1.5

Novedades de arquitectura:
- EventBus para comunicación desacoplada.
- StateManager con persistencia única en localStorage.
- DataLoader con caché para archivos JSON.
- MissionManager preparado para cargar misiones.
- WindowManager para módulos y futuras actividades.
- Engine central que inicializa y conecta los servicios.
- Textos de las vistas trasladados a data/system.json.

Estructura principal:
- index.html
- css/main.css
- css/animations.css
- js/app.js
- js/engine.js
- js/event-bus.js
- js/state-manager.js
- js/data-loader.js
- js/mission-manager.js
- js/window-manager.js
- js/ui.js
- js/aria.js
- data/system.json
- data/missions.json

Ejecución:
1. Abrir la carpeta con Visual Studio Code.
2. Ejecutar mediante Live Server o cualquier servidor HTTP local.
3. No abrir con file://, porque se utilizan módulos ES y carga de JSON mediante fetch.

Audio opcional en assets/audio/:
- boot.mp3
- ambient.mp3
- interface.mp3
