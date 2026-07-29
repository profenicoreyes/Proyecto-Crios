/* Registro de carga de escenarios disponibles para CRIOS Studio */
(function(){
  'use strict';

  // Esperar a que tanto el registro como los escenarios estén disponibles
  function registrarEscenariosDisponibles(){
    if (typeof REGISTRO_ESCENARIOS === 'undefined') {
      console.warn('[Registro Carga] REGISTRO_ESCENARIOS no disponible');
      return;
    }

    // Registrar Antártida si está disponible
    if (typeof ESCENARIO_ANTARTIDA !== 'undefined') {
      REGISTRO_ESCENARIOS.registrar(ESCENARIO_ANTARTIDA);
    } else {
      console.warn('[Registro Carga] ESCENARIO_ANTARTIDA no disponible');
    }
  }

  // Ejecutar inmediatamente si posible, sino esperar DOMContentLoaded
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', registrarEscenariosDisponibles);
  } else {
    registrarEscenariosDisponibles();
  }
})();
