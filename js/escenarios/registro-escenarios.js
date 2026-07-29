/* Registro central de escenarios para CRIOS
 * Provee API mínima y segura para registrar/obtener escenarios.
 */
(function(){
  'use strict';

  if (typeof globalThis.REGISTRO_ESCENARIOS !== 'undefined') return;

  const catalog = new Map();
  let activeId = null;

  function validarEscenario(e) {
    if (!e || typeof e !== 'object') throw new Error('Escenario inválido (no es objeto)');
    if (!e.id || typeof e.id !== 'string') throw new Error('Escenario inválido (id faltante)');
  }

  function registrar(escenario) {
    try {
      validarEscenario(escenario);
      if (catalog.has(escenario.id)) throw new Error('Ya existe un escenario con id: ' + escenario.id);
      // Almacenar copia inmutable
      const copy = Object.freeze(Object.assign({}, escenario));
      catalog.set(escenario.id, copy);
      return copy;
    } catch (error) {
      console.warn('[REGISTRO_ESCENARIOS] registrar:', error && error.message);
      return null;
    }
  }

  function obtener(id) {
    try {
      return catalog.has(id) ? catalog.get(id) : null;
    } catch (e) {
      return null;
    }
  }

  function listar() {
    try {
      return Array.from(catalog.values());
    } catch (e) {
      return [];
    }
  }

  function establecerActivo(id) {
    try {
      if (!catalog.has(id)) {
        console.warn('[REGISTRO_ESCENARIOS] establecerActivo: id no registrado:', id);
        return false;
      }
      activeId = id;
      return true;
    } catch (e) {
      return false;
    }
  }

  function obtenerActivo() {
    try {
      return activeId ? obtener(activeId) : null;
    } catch (e) {
      return null;
    }
  }

  const API = Object.freeze({ registrar, obtener, listar, establecerActivo, obtenerActivo });
  Object.defineProperty(globalThis, 'REGISTRO_ESCENARIOS', { value: API, writable: false, configurable: false });
})();
