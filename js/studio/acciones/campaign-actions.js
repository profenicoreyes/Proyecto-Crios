/* CRIOS Studio — campaign actions */
(function(){
  'use strict';

  function agregarMision(mission) {
    if (!window.CRIOS_CAMPAIGN_DRAFT) return false;
    const result = window.CRIOS_CAMPAIGN_DRAFT.agregarMision(mission);
    return result && result.ok;
  }

  function moverMision(index, offset) {
    if (!window.CRIOS_CAMPAIGN_DRAFT) return false;
    const result = window.CRIOS_CAMPAIGN_DRAFT.moverMision(index, offset);
    return result && result.ok;
  }

  function quitarMision(id) {
    if (!window.CRIOS_CAMPAIGN_DRAFT) return false;
    const result = window.CRIOS_CAMPAIGN_DRAFT.quitarMision(id);
    return result && result.ok;
  }

  window.CRIOS_CAMPAIGN_ACTIONS = {
    agregarMision: agregarMision,
    moverMision: moverMision,
    quitarMision: quitarMision
  };
})();
