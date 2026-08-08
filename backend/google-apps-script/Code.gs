const NOMBRE_HOJA_GENERAL = 'Hoja 1';
const NOMBRE_HOJA_CONFIG = 'CONFIG';
const FILA_INICIAL_GRUPOS = 2;

const ENCABEZADOS = [
  'ID SESIÓN',
  'FECHA',
  'NOMBRE',
  'VARIANTE',
  'HORA INICIO',
  'HORA FIN',
  'TIEMPO (SEGUNDOS)',
  'RESPUESTAS',
  'ACIERTOS',
  'INTENTOS',
  'PISTAS',
  'PUNTAJE',
  'NOTA SUGERIDA',
  'DEVOLUCIÓN',
  'VERSIÓN',
  'PERSONAJE',
  'GRUPO'
];

function doPost(e) {
  let datos;
  try {
    datos = JSON.parse((e && e.postData && e.postData.contents) || '{}');
  } catch (errorParseo) {
    return responder({ok: false, error: String(errorParseo)});
  }

  if (typeof esEnvelopePostPublicacionRemota === 'function' && esEnvelopePostPublicacionRemota(datos)) {
    return responder(procesarSolicitudPublicacionRemota(datos.request, {writeToken: datos.writeToken}));
  }

  const bloqueo = LockService.getScriptLock();
  bloqueo.waitLock(10000);

  try {
    const libro = SpreadsheetApp.getActiveSpreadsheet();
    const idSesion = textoSeguro(datos.idSesion);
    const grupo = textoSeguro(datos.grupo);

    if (!idSesion) {
      throw new Error('Falta el ID de sesión.');
    }

    if (!grupo) {
      throw new Error('Falta el grupo.');
    }

    const hojaGeneral = obtenerOCrearHoja(libro, NOMBRE_HOJA_GENERAL);
    const hojaGrupo = obtenerOCrearHoja(libro, nombreSeguroDeHoja(grupo));

    prepararEncabezados(hojaGeneral);
    prepararEncabezados(hojaGrupo);

    const resultadoGeneral = guardarOActualizar(hojaGeneral, datos);
    const resultadoGrupo = guardarOActualizar(hojaGrupo, datos);

    return responder({
      ok: true,
      accion: resultadoGrupo.accion,
      fila: resultadoGrupo.fila,
      hoja: hojaGrupo.getName(),
      hojaGeneral: hojaGeneral.getName(),
      idSesion: idSesion
    });
  } catch (error) {
    return responder({ok: false, error: String(error)});
  } finally {
    bloqueo.releaseLock();
  }
}

function doGet(e) {
  try {
    const accion = e && e.parameter ? String(e.parameter.accion || '') : '';

    if (accion === 'grupos') {
      const grupos = leerGruposConfigurados();
      return responder({
        ok: true,
        sistema: 'CRIOS',
        grupos: grupos
      });
    }

    if (accion === 'getPublication' && typeof construirSolicitudGetPublicacionRemota === 'function') {
      return responder(procesarSolicitudPublicacionRemota(
        construirSolicitudGetPublicacionRemota(e.parameter),
        {writeToken: ''}
      ));
    }

    return responder({
      ok: true,
      sistema: 'CRIOS',
      estado: 'Servidor activo'
    });
  } catch (error) {
    return responder({ok: false, error: String(error), grupos: []});
  }
}

function leerGruposConfigurados() {
  const libro = SpreadsheetApp.getActiveSpreadsheet();
  const hoja = libro.getSheetByName(NOMBRE_HOJA_CONFIG);

  if (!hoja) {
    throw new Error(
      'No existe la hoja CONFIG. Creala y escribí los grupos en la columna A desde la fila 2.'
    );
  }

  const ultimaFila = hoja.getLastRow();
  if (ultimaFila < FILA_INICIAL_GRUPOS) return [];

  const valores = hoja
    .getRange(FILA_INICIAL_GRUPOS, 1, ultimaFila - FILA_INICIAL_GRUPOS + 1, 1)
    .getDisplayValues()
    .flat()
    .map(valor => String(valor || '').trim())
    .filter(Boolean);

  return [...new Set(valores)];
}

function obtenerOCrearHoja(libro, nombre) {
  return libro.getSheetByName(nombre) || libro.insertSheet(nombre);
}

function prepararEncabezados(hoja) {
  const rango = hoja.getRange(1, 1, 1, ENCABEZADOS.length);
  const actuales = rango.getDisplayValues()[0];
  const necesitaActualizar = ENCABEZADOS.some(
    (encabezado, indice) => actuales[indice] !== encabezado
  );

  if (necesitaActualizar) {
    rango.setValues([ENCABEZADOS]);
    rango.setFontWeight('bold');
    hoja.setFrozenRows(1);
  }
}

function guardarOActualizar(hoja, datos) {
  const idSesion = textoSeguro(datos.idSesion);
  const filaExistente = buscarFilaPorId(hoja, idSesion);
  const fila = filaExistente || hoja.getLastRow() + 1;
  const fechaOriginal = filaExistente
    ? hoja.getRange(fila, 2).getValue()
    : new Date();

  const valores = [[
    idSesion,
    fechaOriginal || new Date(),
    textoSeguro(datos.nombre),
    textoSeguro(datos.variante),
    textoSeguro(datos.horaInicio),
    textoSeguro(datos.horaFin),
    numeroOBlanco(datos.tiempoSegundos),
    JSON.stringify(datos.respuestas || {}),
    numeroOBlanco(datos.aciertos),
    numeroOBlanco(datos.intentos),
    numeroOBlanco(datos.pistas),
    numeroOBlanco(datos.puntaje),
    numeroOBlanco(datos.notaSugerida),
    textoSeguro(datos.devolucion),
    textoSeguro(datos.version),
    textoSeguro(datos.personaje),
    textoSeguro(datos.grupo)
  ]];

  hoja.getRange(fila, 1, 1, valores[0].length).setValues(valores);

  return {
    accion: filaExistente ? 'actualizada' : 'creada',
    fila: fila
  };
}

function buscarFilaPorId(hoja, idSesion) {
  const ultimaFila = hoja.getLastRow();
  if (ultimaFila < 2) return 0;

  const coincidencia = hoja
    .getRange(2, 1, ultimaFila - 1, 1)
    .createTextFinder(idSesion)
    .matchEntireCell(true)
    .findNext();

  return coincidencia ? coincidencia.getRow() : 0;
}

function nombreSeguroDeHoja(grupo) {
  const limpio = String(grupo || '')
    .trim()
    .replace(/[\\\/\?\*\[\]\:]/g, ' ')
    .replace(/\s+/g, ' ')
    .slice(0, 90);

  if (!limpio) {
    throw new Error('El nombre del grupo no es válido.');
  }

  return 'GRUPO - ' + limpio;
}

function textoSeguro(valor) {
  if (valor === undefined || valor === null) return '';
  const texto = String(valor).trim();
  return /^[=+\-@]/.test(texto) ? "'" + texto : texto;
}

function numeroOBlanco(valor) {
  if (valor === '' || valor === undefined || valor === null) return '';
  const resultado = Number(valor);
  return Number.isFinite(resultado) ? resultado : '';
}

function responder(contenido) {
  return ContentService
    .createTextOutput(JSON.stringify(contenido))
    .setMimeType(ContentService.MimeType.JSON);
}
