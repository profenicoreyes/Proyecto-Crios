'use strict';

REGISTRO_MISIONES.registrar({
  id: 'greenhouse',
  numero: '02',
  titulo: 'Invernadero',
  nombreCorto: 'Invernadero',
  mapa: Object.freeze({ titulo: 'Invernadero', subtitulo: 'Cultivos', clase: 'm-green' }),
  clasificacion: Object.freeze({ materia: 'matematica', tema: 'geometria', subtema: 'calculoAreas', nivel: 'educacion-media', dificultad: 2 }),
  curriculum: CRIOS_CURRICULUM.createMissionReference('anep-ebi-matematica-t5-g7-areas'),
  narrativa: Object.freeze({ ubicacion: 'Invernadero', objetivo: 'Determinar la superficie que todavía puede destinarse a cultivos.' }),
  tipoActividad: 'respuesta-numerica-con-procedimiento',
  duracionEstimadaMinutos: 12,
  etiquetas: Object.freeze(['areas', 'rectangulo', 'triangulo', 'ajustes-de-superficie']),
  mensajeAria: 'Necesito determinar la superficie que todavía puede destinarse a la producción de alimentos.',
  ejemploProcedimiento: 'Ejemplo: 24*8 - 5*3',
  generar(aleatorio, variante) {
    const ancho=elegirAlAzar([16,18,20,22], aleatorio), altura=elegirAlAzar([10,12,14], aleatorio);
    const base=elegirAlAzar([4,6,8], aleatorio), alturaTriangulo=elegirAlAzar([3,4,5,6], aleatorio), perdida=elegirAlAzar([12,15,18,20], aleatorio), recuperada=elegirAlAzar([4,6,7,9], aleatorio);
    return {
      variant:variante,width:ancho,height:altura,base,triH:alturaTriangulo,loss:perdida,recovered:recuperada,
      expected:ancho*altura-(base*alturaTriangulo/2)-perdida+recuperada,
      required:[ancho,altura,base,alturaTriangulo,perdida,recuperada],
      hint:'Primero calculá el área total. El estanque triangular no se cultiva. Después aplicá la pérdida y la recuperación.'
    };
  },
  contenido(d) {
    return {
      text:`El invernadero mide <strong>${d.width} m × ${d.height} m</strong>. El estanque triangular tiene <strong>${d.base} m de base</strong> y <strong>${d.triH} m de altura</strong>. La tormenta inutilizó ${d.loss} m² y luego se recuperaron ${d.recovered} m².`,
      question:'¿Qué superficie puede cultivarse actualmente?',
      svg:`<svg viewBox="0 0 700 430"><g fill="none" stroke="#80e8ff" stroke-width="4"><rect x="120" y="90" width="460" height="260"/><path d="M270 295 L430 295 L350 175 Z" stroke="#ffb62e"/><line x1="350" y1="175" x2="350" y2="295" stroke-dasharray="8 8"/></g><g fill="#dff9ff" font-size="20" font-family="Arial" text-anchor="middle"><text x="350" y="48">${d.width} m</text></g><text x="63" y="220" fill="#dff9ff" font-size="20" font-family="Arial" text-anchor="middle" transform="rotate(-90 63 220)">${d.height} m</text><g fill="#ffd179" font-size="18" font-family="Arial" text-anchor="middle"><text x="350" y="340">base: ${d.base} m</text><text x="385" y="235">altura: ${d.triH} m</text></g></svg>`
    };
  }
});
