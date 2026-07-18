'use strict';

REGISTRO_MISIONES.registrar({
  id: 'ice',
  numero: '03',
  titulo: 'Banco de Hielo',
  nombreCorto: 'Banco de Hielo',
  mapa: Object.freeze({ titulo: 'Banco de Hielo', subtitulo: 'Muestras', clase: 'm-ice' }),
  clasificacion: Object.freeze({ materia: 'matematica', tema: 'geometria', subtema: 'calculoAreas', nivel: 'educacion-media', dificultad: 2 }),
  narrativa: Object.freeze({ ubicacion: 'Banco de Hielo', objetivo: 'Calcular la superficie exterior operativa alrededor de la cámara circular.' }),
  tipoActividad: 'respuesta-numerica-con-procedimiento',
  duracionEstimadaMinutos: 12,
  etiquetas: Object.freeze(['areas', 'cuadrado', 'circulo', 'radio-y-diametro', 'sustraccion-de-areas']),
  mensajeAria: 'La cámara circular contiene las muestras. Solo la superficie exterior puede utilizarse para el trabajo técnico.',
  ejemploProcedimiento: 'Ejemplo: 24*8 - 5*3',
  generar(aleatorio, variante) {
    const lado=elegirAlAzar([14,16,18,20], aleatorio), diametro=elegirAlAzar([8,10,12], aleatorio), recuperada=elegirAlAzar([8,10,12,14], aleatorio), sellada=elegirAlAzar([4,6,8,10], aleatorio);
    const radio=diametro/2;
    return {
      variant:variante,side:lado,diam:diametro,rad:radio,pi:3,recovered:recuperada,sealed:sellada,
      expected:lado*lado-(3*radio*radio)+recuperada-sellada,
      required:[lado,diametro,3,recuperada,sellada],
      alternatives:[[lado,lado,3,radio,radio,recuperada,sellada]],
      hint:'La fórmula del círculo necesita el radio. El radio es la mitad del diámetro. La cámara circular no pertenece al espacio operativo.'
    };
  },
  contenido(d) {
    return {
      text:`La sala es cuadrada y mide <strong>${d.side} m de lado</strong>. La cámara circular tiene <strong>${d.diam} m de diámetro</strong>. Usen <strong>π ≈ 3</strong>. Se recuperaron ${d.recovered} m² de corredor y se sellaron ${d.sealed} m².`,
      question:'¿Qué superficie exterior queda operativa?',
      svg:`<svg viewBox="0 0 700 430"><g fill="none" stroke="#80e8ff" stroke-width="4"><rect x="180" y="55" width="340" height="340"/><circle cx="350" cy="225" r="112" stroke="#ffb62e"/><line x1="238" y1="225" x2="462" y2="225" stroke="#ffb62e"/></g><g fill="#dff9ff" font-size="20" font-family="Arial" text-anchor="middle"><text x="350" y="35">${d.side} m</text></g><text x="145" y="230" fill="#dff9ff" font-size="20" font-family="Arial" text-anchor="middle" transform="rotate(-90 145 230)">${d.side} m</text><g fill="#ffd179" font-size="18" font-family="Arial" text-anchor="middle"><text x="350" y="214">DIÁMETRO</text><text x="350" y="244">${d.diam} m</text></g><text x="560" y="380" fill="#dff9ff" font-size="20" font-family="Arial">π ≈ 3</text></svg>`
    };
  }
});
