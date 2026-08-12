'use strict';

REGISTRO_MISIONES.registrar({
  id: 'energy', // Identificador histórico conservado para no romper partidas guardadas.
  numero: '01',
  titulo: 'Centro de Energía',
  nombreCorto: 'Energía',
  mapa: Object.freeze({ titulo: 'Centro de Energía', subtitulo: 'Calefacción', clase: 'm-energy' }),
  clasificacion: Object.freeze({ materia: 'matematica', tema: 'geometria', subtema: 'calculoAreas', nivel: 'educacion-media', dificultad: 2 }),
  curriculum: CRIOS_CURRICULUM.createMissionReference('anep-ebi-matematica-t5-g7-areas'),
  narrativa: Object.freeze({ ubicacion: 'Centro de Energía', objetivo: 'Determinar la superficie activa para distribuir la calefacción.' }),
  tipoActividad: 'respuesta-numerica-con-procedimiento',
  duracionEstimadaMinutos: 12,
  etiquetas: Object.freeze(['areas', 'rectangulo', 'sustraccion-de-areas', 'resolucion-de-problemas']),
  mensajeAria: 'Sin conocer la superficie activa no puedo distribuir correctamente la calefacción.',
  ejemploProcedimiento: 'Ejemplo: 24*8 - 5*3',
  generar(aleatorio, variante) {
    const anchoTotal=elegirAlAzar([20,22,24,26,28], aleatorio), altura=elegirAlAzar([6,7,8,9], aleatorio);
    const oeste=elegirAlAzar([7,8,9,10,11], aleatorio), anchoDano=elegirAlAzar([3,4,5,6], aleatorio), altoDano=elegirAlAzar([2,3,4], aleatorio);
    return {
      variant:variante,totalW:anchoTotal,height:altura,west:oeste,east:anchoTotal-oeste,damageW:anchoDano,damageH:altoDano,
      expected:anchoTotal*altura-anchoDano*altoDano,
      required:[anchoTotal,altura,anchoDano,altoDano],
      hint:'La superficie activa es la del rectángulo completo menos la zona dañada. Si querés reconstruir el sector este: ancho total − sector oeste.'
    };
  },
  contenido(d) {
    return {
      text:`El módulo ocupa un rectángulo de <strong>${d.totalW} m de ancho</strong> y <strong>${d.height} m de altura</strong>. El sector oeste ocupa ${d.west} m del ancho. Una zona dañada de <strong>${d.damageW} m × ${d.damageH} m</strong> ya no debe calefaccionarse.`,
      question:'¿Qué superficie continúa calefaccionándose?',
      svg:`<svg viewBox="0 0 700 430"><g fill="none" stroke="#80e8ff" stroke-width="4"><rect x="120" y="105" width="460" height="210"/><line x1="${120+460*d.west/d.totalW}" y1="105" x2="${120+460*d.west/d.totalW}" y2="315"/><rect x="420" y="210" width="96" height="72" stroke="#ff5b6b"/></g><g fill="#dff9ff" font-size="20" font-family="Arial" text-anchor="middle"><text x="350" y="60">${d.totalW} m</text><text x="205" y="205">${d.west} m</text><text x="440" y="205">¿ ?</text></g><text x="62" y="215" fill="#dff9ff" font-size="20" font-family="Arial" text-anchor="middle" transform="rotate(-90 62 215)">${d.height} m</text><g fill="#ff9aa4" font-size="18" font-family="Arial" text-anchor="middle"><text x="468" y="242">ZONA DAÑADA</text><text x="468" y="266">${d.damageW} m × ${d.damageH} m</text></g></svg>`
    };
  }
});
