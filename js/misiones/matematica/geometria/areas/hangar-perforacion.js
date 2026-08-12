'use strict';

REGISTRO_MISIONES.registrar({
  id: 'hangar',
  numero: '04',
  titulo: 'Hangar de Perforación',
  nombreCorto: 'Hangar',
  mapa: Object.freeze({ titulo: 'Hangar', subtitulo: 'Perforación', clase: 'm-hangar' }),
  clasificacion: Object.freeze({ materia: 'matematica', tema: 'geometria', subtema: 'calculoAreas', nivel: 'educacion-media', dificultad: 3 }),
  curriculum: CRIOS_CURRICULUM.createMissionReference('anep-ebi-matematica-t5-g7-areas'),
  narrativa: Object.freeze({ ubicacion: 'Hangar de Perforación', objetivo: 'Determinar la superficie libre segura para maniobrar.' }),
  tipoActividad: 'respuesta-numerica-con-procedimiento',
  duracionEstimadaMinutos: 15,
  etiquetas: Object.freeze(['areas', 'figura-compuesta', 'planta-en-l', 'ajustes-de-superficie']),
  mensajeAria: 'El vehículo perforador necesita una superficie libre segura para maniobrar.',
  ejemploProcedimiento: 'Ejemplo: 24*8 - 5*3',
  generar(aleatorio, variante) {
    const ancho=elegirAlAzar([20,22,24,26], aleatorio), altura=elegirAlAzar([12,14,16], aleatorio), superior=elegirAlAzar([11,12,13,14,15], aleatorio), altoInferior=elegirAlAzar([5,6,7], aleatorio);
    const anchoBloqueo=elegirAlAzar([3,4,5], aleatorio), altoBloqueo=elegirAlAzar([3,4,5], aleatorio), recuperada=elegirAlAzar([4,6,8], aleatorio);
    return {
      variant:variante,width:ancho,height:altura,upper:superior,lowerH:altoInferior,missingW:ancho-superior,missingH:altura-altoInferior,blockW:anchoBloqueo,blockH:altoBloqueo,recovered:recuperada,
      expected:ancho*altura-(superior*altoInferior)-(anchoBloqueo*altoBloqueo)+recuperada,
      required:[ancho,altura,superior,altoInferior,anchoBloqueo,altoBloqueo,recuperada],
      alternatives:[],
      hint:'Calculá el área exterior, restá la superficie indicada por el brazo superior y el inferior, descontá la zona bloqueada y sumá el corredor recuperado.'
    };
  },
  contenido(d) {
    return {
      text:`La planta en L tiene medidas exteriores de <strong>${d.width} m × ${d.height} m</strong>. El brazo horizontal mide <strong>${d.upper} m de largo</strong> y el brazo vertical mide <strong>${d.lowerH} m de ancho</strong>. Una zona de ${d.blockW} m × ${d.blockH} m está bloqueada y se recuperaron ${d.recovered} m² de corredor.`,
      question:'¿Qué superficie queda disponible para maniobrar?',
      svg:`<svg viewBox="0 0 700 430"><path d="M130 80 H570 V190 H390 V350 H130 Z" fill="none" stroke="#80e8ff" stroke-width="5"/><rect x="185" y="245" width="100" height="72" fill="none" stroke="#ff5b6b" stroke-width="4"/><g fill="#dff9ff" font-size="20" font-family="Arial" text-anchor="middle"><text x="350" y="35">${d.width} m</text><text x="480" y="235">${d.upper} m</text><text x="435" y="280" transform="rotate(-90 435 280)">${d.lowerH} m</text><text x="480" y="178">¿ ?</text></g><text x="72" y="220" fill="#dff9ff" font-size="20" font-family="Arial" text-anchor="middle" transform="rotate(-90 72 220)">${d.height} m</text><g fill="#ff9aa4" font-size="17" font-family="Arial" text-anchor="middle"><text x="235" y="274">ZONA BLOQUEADA</text><text x="235" y="298">${d.blockW} m × ${d.blockH} m</text></g></svg>`
    };
  }
});
