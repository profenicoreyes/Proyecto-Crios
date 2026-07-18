/*
 * CRIOS OS — Catálogo de misiones
 * Para agregar o cambiar una misión, este es el archivo principal a editar.
 * El motor general vive en crios.js y no necesita conocer los detalles internos.
 */

const MISSION_DEFINITIONS = {
  energy: {
    number: '01',
    title: 'Centro de Energía',
    shortName: 'Energía',
    mapSubtitle: 'Calefacción',
    mapClass: 'm-energy',
    ariaBrief: 'Sin conocer la superficie activa no puedo distribuir correctamente la calefacción.',
    procedurePlaceholder: 'Ejemplo: 24*8 - 5*3',
    generate(r, variant) {
      const totalW=pick([20,22,24,26,28],r), height=pick([6,7,8,9],r);
      const west=pick([7,8,9,10,11],r), damageW=pick([3,4,5,6],r), damageH=pick([2,3,4],r);
      return {
        variant,totalW,height,west,east:totalW-west,damageW,damageH,
        expected:totalW*height-damageW*damageH,
        required:[totalW,height,damageW,damageH],
        hint:'La superficie activa es la del rectángulo completo menos la zona dañada. Si querés reconstruir el sector este: ancho total − sector oeste.'
      };
    },
    content(d) {
      return {
        text:`El módulo ocupa un rectángulo de <strong>${d.totalW} m de ancho</strong> y <strong>${d.height} m de altura</strong>. El sector oeste ocupa ${d.west} m del ancho. Una zona dañada de <strong>${d.damageW} m × ${d.damageH} m</strong> ya no debe calefaccionarse.`,
        question:'¿Qué superficie continúa calefaccionándose?',
        svg:`<svg viewBox="0 0 700 430"><g fill="none" stroke="#80e8ff" stroke-width="4"><rect x="120" y="105" width="460" height="210"/><line x1="${120+460*d.west/d.totalW}" y1="105" x2="${120+460*d.west/d.totalW}" y2="315"/><rect x="420" y="210" width="96" height="72" stroke="#ff5b6b"/></g><g fill="#dff9ff" font-size="20" font-family="Arial" text-anchor="middle"><text x="350" y="60">${d.totalW} m</text><text x="205" y="205">${d.west} m</text><text x="440" y="205">¿ ?</text></g><text x="62" y="215" fill="#dff9ff" font-size="20" font-family="Arial" text-anchor="middle" transform="rotate(-90 62 215)">${d.height} m</text><g fill="#ff9aa4" font-size="18" font-family="Arial" text-anchor="middle"><text x="468" y="242">ZONA DAÑADA</text><text x="468" y="266">${d.damageW} m × ${d.damageH} m</text></g></svg>`
      };
    }
  },

  greenhouse: {
    number: '02',
    title: 'Invernadero',
    shortName: 'Invernadero',
    mapSubtitle: 'Cultivos',
    mapClass: 'm-green',
    ariaBrief: 'Necesito determinar la superficie que todavía puede destinarse a la producción de alimentos.',
    procedurePlaceholder: 'Ejemplo: 24*8 - 5*3',
    generate(r, variant) {
      const width=pick([16,18,20,22],r), height=pick([10,12,14],r);
      const base=pick([4,6,8],r), triH=pick([3,4,5,6],r), loss=pick([12,15,18,20],r), recovered=pick([4,6,7,9],r);
      return {
        variant,width,height,base,triH,loss,recovered,
        expected:width*height-(base*triH/2)-loss+recovered,
        required:[width,height,base,triH,loss,recovered],
        hint:'Primero calculá el área total. El estanque triangular no se cultiva. Después aplicá la pérdida y la recuperación.'
      };
    },
    content(d) {
      return {
        text:`El invernadero mide <strong>${d.width} m × ${d.height} m</strong>. El estanque triangular tiene <strong>${d.base} m de base</strong> y <strong>${d.triH} m de altura</strong>. La tormenta inutilizó ${d.loss} m² y luego se recuperaron ${d.recovered} m².`,
        question:'¿Qué superficie puede cultivarse actualmente?',
        svg:`<svg viewBox="0 0 700 430"><g fill="none" stroke="#80e8ff" stroke-width="4"><rect x="120" y="90" width="460" height="260"/><path d="M270 295 L430 295 L350 175 Z" stroke="#ffb62e"/><line x1="350" y1="175" x2="350" y2="295" stroke-dasharray="8 8"/></g><g fill="#dff9ff" font-size="20" font-family="Arial" text-anchor="middle"><text x="350" y="48">${d.width} m</text></g><text x="63" y="220" fill="#dff9ff" font-size="20" font-family="Arial" text-anchor="middle" transform="rotate(-90 63 220)">${d.height} m</text><g fill="#ffd179" font-size="18" font-family="Arial" text-anchor="middle"><text x="350" y="340">base: ${d.base} m</text><text x="385" y="235">altura: ${d.triH} m</text></g></svg>`
      };
    }
  },

  ice: {
    number: '03',
    title: 'Banco de Hielo',
    shortName: 'Banco de Hielo',
    mapSubtitle: 'Muestras',
    mapClass: 'm-ice',
    ariaBrief: 'La cámara circular contiene las muestras. Solo la superficie exterior puede utilizarse para el trabajo técnico.',
    procedurePlaceholder: 'Ejemplo: 24*8 - 5*3',
    generate(r, variant) {
      const side=pick([14,16,18,20],r), diam=pick([8,10,12],r), recovered=pick([8,10,12,14],r), sealed=pick([4,6,8,10],r);
      const rad=diam/2;
      return {
        variant,side,diam,rad,pi:3,recovered,sealed,
        expected:side*side-(3*rad*rad)+recovered-sealed,
        required:[side,diam,3,recovered,sealed],
        alternatives:[[side,side,3,rad,rad,recovered,sealed]],
        hint:'La fórmula del círculo necesita el radio. El radio es la mitad del diámetro. La cámara circular no pertenece al espacio operativo.'
      };
    },
    content(d) {
      return {
        text:`La sala es cuadrada y mide <strong>${d.side} m de lado</strong>. La cámara circular tiene <strong>${d.diam} m de diámetro</strong>. Usen <strong>π ≈ 3</strong>. Se recuperaron ${d.recovered} m² de corredor y se sellaron ${d.sealed} m².`,
        question:'¿Qué superficie exterior queda operativa?',
        svg:`<svg viewBox="0 0 700 430"><g fill="none" stroke="#80e8ff" stroke-width="4"><rect x="180" y="55" width="340" height="340"/><circle cx="350" cy="225" r="112" stroke="#ffb62e"/><line x1="238" y1="225" x2="462" y2="225" stroke="#ffb62e"/></g><g fill="#dff9ff" font-size="20" font-family="Arial" text-anchor="middle"><text x="350" y="35">${d.side} m</text></g><text x="145" y="230" fill="#dff9ff" font-size="20" font-family="Arial" text-anchor="middle" transform="rotate(-90 145 230)">${d.side} m</text><g fill="#ffd179" font-size="18" font-family="Arial" text-anchor="middle"><text x="350" y="214">DIÁMETRO</text><text x="350" y="244">${d.diam} m</text></g><text x="560" y="380" fill="#dff9ff" font-size="20" font-family="Arial">π ≈ 3</text></svg>`
      };
    }
  },

  hangar: {
    number: '04',
    title: 'Hangar de Perforación',
    mapTitle: 'Hangar',
    shortName: 'Hangar',
    mapSubtitle: 'Perforación',
    mapClass: 'm-hangar',
    ariaBrief: 'El vehículo perforador necesita una superficie libre segura para maniobrar.',
    procedurePlaceholder: 'Ejemplo: 24*8 - 5*3',
    generate(r, variant) {
      const width=pick([20,22,24,26],r), height=pick([12,14,16],r), upper=pick([11,12,13,14,15],r), lowerH=pick([5,6,7],r);
      const blockW=pick([3,4,5],r), blockH=pick([3,4,5],r), recovered=pick([4,6,8],r);
      return {
        variant,width,height,upper,lowerH,missingW:width-upper,missingH:height-lowerH,blockW,blockH,recovered,
        expected:width*height-(upper*lowerH)-(blockW*blockH)+recovered,
        required:[width,height,upper,lowerH,blockW,blockH,recovered],
        alternatives:[],
        hint:'Calculá el área exterior, restá la superficie indicada por el brazo superior y el inferior, descontá la zona bloqueada y sumá el corredor recuperado.'
      };
    },
    content(d) {
      return {
        text:`La planta en L tiene medidas exteriores de <strong>${d.width} m × ${d.height} m</strong>. El brazo horizontal mide <strong>${d.upper} m de largo</strong> y el brazo vertical mide <strong>${d.lowerH} m de ancho</strong>. Una zona de ${d.blockW} m × ${d.blockH} m está bloqueada y se recuperaron ${d.recovered} m² de corredor.`,
        question:'¿Qué superficie queda disponible para maniobrar?',
        svg:`<svg viewBox="0 0 700 430"><path d="M130 80 H570 V190 H390 V350 H130 Z" fill="none" stroke="#80e8ff" stroke-width="5"/><rect x="185" y="245" width="100" height="72" fill="none" stroke="#ff5b6b" stroke-width="4"/><g fill="#dff9ff" font-size="20" font-family="Arial" text-anchor="middle"><text x="350" y="35">${d.width} m</text><text x="480" y="235">${d.upper} m</text><text x="435" y="280" transform="rotate(-90 435 280)">${d.lowerH} m</text><text x="480" y="178">¿ ?</text></g><text x="72" y="220" fill="#dff9ff" font-size="20" font-family="Arial" text-anchor="middle" transform="rotate(-90 72 220)">${d.height} m</text><g fill="#ff9aa4" font-size="17" font-family="Arial" text-anchor="middle"><text x="235" y="274">ZONA BLOQUEADA</text><text x="235" y="298">${d.blockW} m × ${d.blockH} m</text></g></svg>`
      };
    }
  }
};
