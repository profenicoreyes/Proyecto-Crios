# Contrato de misiones publicables y materialización Runtime

## 1. Propósito

Este documento define la frontera serializable y ejecutable necesaria para que una campaña publicada pueda contener misiones autosuficientes sin persistir funciones ni recuperar contenido pedagógico desde el catálogo legacy.

La arquitectura objetivo es:

```text
PublishedCampaign
        |
        v
PublishedMissionSpec
        |
        v
Versioned Runtime Mission Handler
        |
        v
MaterializedRuntimeMission
        |
        v
Runtime
```

El contrato separa contenido pedagógico publicado de comportamiento genérico versionado. Define identidades, formas, invariantes, validaciones, errores, reproducibilidad y la migración de las cuatro misiones actuales. No implementa modelos, handlers, registro, materializador, cambios de Studio ni resolución Runtime.

## 2. Alcance

El alcance contractual comprende:

- la forma persistible de `PublishedMissionSpec`;
- la identidad y responsabilidad de `RuntimeMissionHandler`;
- el futuro registro `CRIOS_RUNTIME_MISSION_HANDLERS`;
- la forma efímera `MaterializedRuntimeMission` requerida por el Runtime actual;
- un manifiesto de ejecución incluido en el contenido publicado;
- la política de generación determinista;
- la validación por Studio, Publicación, Activación y Runtime;
- la migración individual de `energy`, `greenhouse`, `ice` y `hangar`;
- la secuencia A2-006B, A2-006C, A2-006D y A2-007.

Quedan fuera de alcance la implementación, la republicación de campañas, la lectura de persistencia desde Runtime, el pinning de una publicación, la procedencia en sesiones, Seguimiento y cualquier transmisión.

Son prohibiciones permanentes de esta frontera:

- serializar funciones o código fuente;
- ejecutar `eval()` o `new Function()` sobre contenido publicado;
- persistir scripts o URLs de scripts;
- hacer imports dinámicos indicados por contenido no confiable;
- recuperar una misión completa desde `REGISTRO_MISIONES`;
- completar una spec con datos legacy o usar `missionId` como permiso implícito para hacerlo;
- modificar una publicación para incorporarle funciones;
- cambiar la semántica de un handler sin incrementar `handlerVersion`;
- elegir otro handler, otra versión o contenido legacy como fallback ante una publicación activa incompatible;
- publicar sin handler exacto resoluble;
- materializar parcialmente;
- usar `Math.random` sin política de generación explícita.

## 3. Diagnóstico

`CampaignDraft` conserva misiones mediante copias JSON. El normalizador de Publicación clona y sanea datos serializables, y `PublishedCampaign.content` queda cubierto por canonicalización y `contentHash`. Las funciones no sobreviven a esa ruta.

Las misiones legacy contienen dos funciones indispensables:

- `generar(aleatorio, variante)`, que selecciona datos, deriva magnitudes, calcula la respuesta esperada y produce criterios para validar el procedimiento;
- `contenido(d)`, que construye texto, pregunta y SVG específicos.

Runtime llama `obtenerMision(id).generar(...)` durante `generateMissionData()` y `definition.contenido(data)` durante `renderMission()`. También usa metadatos de la misión para crear pantallas, mapa, accesibilidad, evaluación final y metadata de release. Por ello, una publicación que solo conserva la parte JSON del objeto actual no es ejecutable.

Recuperar por ID las funciones y el resto del objeto desde `REGISTRO_MISIONES` no resuelve el problema: el texto, las listas de valores, las fórmulas, las pistas y el SVG están embebidos en esas funciones y quedarían fuera de `contentHash`. El resultado sería una mezcla no auditable entre publicación y legacy.

La causa arquitectónica es la ausencia de una representación declarativa de todos los datos pedagógicos y de una identidad versionada para el comportamiento genérico. El bloqueo es independiente del defecto procedimental de baseline observado en A2-006.

## 4. Fuentes

La definición se obtuvo mediante lectura completa de los módulos exigidos. Las fuentes controladoras son:

| Fuente | Evidencia utilizada |
|---|---|
| `js/nucleo/registro-misiones.js` | Campos obligatorios legacy, registro, lookup y orden de campaña |
| `js/datos/campanas.js` | Campaña `reactivacion-base-antartica` y orden `energy`, `greenhouse`, `ice`, `hangar` |
| `js/misiones/matematica/geometria/areas/*.js` | Datos, algoritmos, textos, preguntas, pistas y SVG de las cuatro misiones |
| `js/crios.js` | Generación, render, procedimiento, respuesta, final, navegación y creación del dominio |
| `js/studio/modelo/campaign-draft.js` | Copia JSON del borrador y edición de misiones |
| adaptador y controlador de publicación de Studio | Transporte del draft hacia Publicación |
| ocho módulos de Publicación | Normalización, serialización estricta, canonicalización, hash y modelos publicados |
| cuatro módulos de Activación | Referencia activa e identidad de publicación |
| seis módulos de Persistencia | Documento persistido, copia congelada y clave única |
| release, runtime, navigation y session | Formas ejecutables y contratos del dominio actual |
| cuatro suites existentes | Contratos públicos y casos demostrados hasta A2-005 |
| cinco documentos protegidos | Decisiones vigentes y límites declarados |

La inspección dinámica aislada no se ejecutó porque Node no está disponible. Cargar la aplicación real habría activado bootstrap, storage, timers y rutas de transmisión, contrario al alcance. Las salidas se determinaron estáticamente a partir de funciones puras, listas literales y fórmulas completas; este límite no oculta dependencias dinámicas: ninguna misión accede a DOM, storage, red, timers, configuración ni otras misiones.

## 5. Misiones actuales

Las cuatro misiones pertenecen a la campaña `reactivacion-base-antartica`, escenario `antartida`, en el orden declarado por campaña.

| missionId | Módulo | Propiedades serializables propias | Funciones | Dependencias y efectos | Generación |
|---|---|---|---|---|---|
| `energy` | `js/misiones/matematica/geometria/areas/centro-energia.js` | `id`, `numero`, `titulo`, `nombreCorto`, `mapa`, `clasificacion`, `narrativa`, `tipoActividad`, `duracionEstimadaMinutos`, `etiquetas`, `mensajeAria`, `ejemploProcedimiento` | `generar(aleatorio, variante)`, `contenido(d)` | Solo `elegirAlAzar`; sin DOM, config, otras misiones, timers, storage, red o `Math.random` directo | DETERMINISTA_CON_SEMILLA |
| `greenhouse` | `js/misiones/matematica/geometria/areas/invernadero.js` | mismos campos estructurales, con valores propios | `generar(aleatorio, variante)`, `contenido(d)` | Solo `elegirAlAzar`; sin efectos externos | DETERMINISTA_CON_SEMILLA |
| `ice` | `js/misiones/matematica/geometria/areas/banco-hielo.js` | mismos campos estructurales, con valores propios | `generar(aleatorio, variante)`, `contenido(d)` | Solo `elegirAlAzar`; sin efectos externos | DETERMINISTA_CON_SEMILLA |
| `hangar` | `js/misiones/matematica/geometria/areas/hangar-perforacion.js` | mismos campos estructurales, con valores propios | `generar(aleatorio, variante)`, `contenido(d)` | Solo `elegirAlAzar`; sin efectos externos | DETERMINISTA_CON_SEMILLA |

Inventario de funciones y contenido embebido:

| Misión | Entradas y salida de `generar` | Contenido pedagógico dentro de `generar` | Entrada y salida de `contenido` | Contenido pedagógico dentro de `contenido` |
|---|---|---|---|---|
| `energy` | RNG + variante; devuelve `variant,totalW,height,west,east,damageW,damageH,expected,required,hint` | listas `[20,22,24,26,28]`, `[6,7,8,9]`, `[7,8,9,10,11]`, `[3,4,5,6]`, `[2,3,4]`; fórmula rectángulo menos daño; operandos esenciales; pista | datos generados; devuelve `text,question,svg` | consigna de calefacción, pregunta, plantilla rectangular, división oeste/este, zona dañada, etiquetas y coordenadas visuales |
| `greenhouse` | RNG + variante; devuelve `variant,width,height,base,triH,loss,recovered,expected,required,hint` | listas `[16,18,20,22]`, `[10,12,14]`, `[4,6,8]`, `[3,4,5,6]`, `[12,15,18,20]`, `[4,6,7,9]`; fórmula rectángulo menos triángulo menos pérdida más recuperación; pista | datos generados; devuelve `text,question,svg` | consigna de cultivo, pregunta, rectángulo, estanque triangular, base y altura, coordenadas y etiquetas visuales |
| `ice` | RNG + variante; devuelve `variant,side,diam,rad,pi,recovered,sealed,expected,required,alternatives,hint` | listas `[14,16,18,20]`, `[8,10,12]`, `[8,10,12,14]`, `[4,6,8,10]`; constante pedagógica pi=3; radio derivado; fórmula cuadrado menos círculo más recuperación menos sellado; dos conjuntos de operandos; pista | datos generados; devuelve `text,question,svg` | consigna de superficie exterior, pregunta, cuadrado, círculo, diámetro, aproximación de pi, coordenadas y etiquetas visuales |
| `hangar` | RNG + variante; devuelve `variant,width,height,upper,lowerH,missingW,missingH,blockW,blockH,recovered,expected,required,alternatives,hint` | listas `[20,22,24,26]`, `[12,14,16]`, `[11,12,13,14,15]`, `[5,6,7]`, dos veces `[3,4,5]`, `[4,6,8]`; dimensiones derivadas; fórmula de planta en L, bloqueo y recuperación; pista | datos generados; devuelve `text,question,svg` | consigna de maniobra, pregunta, planta en L, zona bloqueada, medidas, coordenadas y etiquetas visuales |

El Runtime actual pasa una única secuencia RNG a todas las misiones en orden de campaña. `hashString(realName)` inicializa `seeded(seed)` y `variantIdFor(realName)` produce la variante. Cada llamada a `elegirAlAzar` consume el siguiente valor. Después de las cuatro misiones se generan `adjustMinus` y `adjustPlus` para la evaluación final. Por tanto, cambiar el orden, la cantidad de selecciones o las listas cambia el ejercicio y el final.

## 6. Comparación de formas

| Campo o comportamiento | CampaignDraft | PublishedCampaign.content actual | Misión legacy | Runtime lo usa | Se conserva por JSON | Clasificación | Resultado contractual |
|---|---|---|---|---|---|---|---|
| campaña: `id`/`campaignId` | `id` puede ser null | `campaignId` está en el sobre; se retira de `content` | campaña usa `id` | selección, progreso y publicación | sí | DATO_SERIALIZABLE | identidad en sobre y coherencia validada |
| `nombre`/título de campaña | `nombre` | `nombre` | `titulo` | release y cabecera | sí | CONTENIDO_PEDAGÓGICO | permanece publicado |
| `descripcion` | sí | sí | sí | release y selector | sí | CONTENIDO_PEDAGÓGICO | permanece publicado |
| `escenario` | ID string | sí | campaña no lo porta; Runtime fija `antartida` al construir draft | release | sí | DATO_SERIALIZABLE | obligatorio en contenido publicado |
| orden de misiones | orden del array | orden preservado | campaña usa array de IDs | generación, mapa, navegación y final | sí | CONTENIDO_PEDAGÓGICO | `missionOrder` y specs deben coincidir |
| `missionId` | `mision.id` | sobrevive si la copia lo incluye | `id` | lookup, DOM IDs, progreso y navegación | sí | DATO_SERIALIZABLE | obligatorio y único |
| `numero` | puede copiarse | sí si estaba en draft | sí | encabezado de pantalla | sí | CONTENIDO_PEDAGÓGICO | payload de presentación obligatorio |
| `titulo` | puede copiarse | sí si estaba en draft | sí | pantalla y mapa | sí | CONTENIDO_PEDAGÓGICO | obligatorio |
| `nombreCorto` | puede copiarse | sí si estaba en draft | sí | estado, mapa y final | sí | CONTENIDO_PEDAGÓGICO | obligatorio |
| `mapa` | puede copiarse | sí si estaba en draft | sí | clase, título, subtítulo | sí | CONTENIDO_PEDAGÓGICO | semántica visual publicada; token de estilo validado |
| `clasificacion` | puede copiarse | sí si estaba en draft | sí | filtros y dificultad de release | sí | METADATA_PEDAGÓGICA | obligatoria |
| `narrativa` | puede copiarse | sí si estaba en draft | sí | contexto y Studio | sí | CONTENIDO_PEDAGÓGICO | obligatoria |
| `tipoActividad` | puede copiarse | sí si estaba en draft | sí | contrato pedagógico | sí | DATO_SERIALIZABLE | obligatorio |
| `duracionEstimadaMinutos` | puede copiarse | sí si estaba en draft | sí | metadata de release | sí | METADATA_PEDAGÓGICA | obligatorio, finito y positivo |
| `etiquetas` | puede copiarse | sí si estaba en draft | sí | clasificación/búsqueda | sí | METADATA_PEDAGÓGICA | arreglo ordenado |
| `mensajeAria` | puede copiarse | sí si estaba en draft | sí | pantalla de misión | sí | CONTENIDO_PEDAGÓGICO | obligatorio |
| `ejemploProcedimiento` | puede copiarse | sí si estaba en draft | sí | placeholder | sí | CONTENIDO_PEDAGÓGICO | obligatorio |
| listas de valores | dentro de función, se pierden | no | literales en `generar` | determinan números | no | CONTENIDO_PEDAGÓGICO | extraer a `payload.generation.variables` |
| fórmula y derivados | dentro de función, se pierden | no | código en `generar` | `expected`, final y evaluación | no | CONTENIDO_PEDAGÓGICO + COMPORTAMIENTO_GENÉRICO | fórmula declarativa publicada; intérprete cerrado en handler |
| `required`/`alternatives` | dentro de función | no | código en `generar` | validación del procedimiento | no | CRITERIO_DE_EVALUACIÓN | referencias declarativas publicadas |
| pista | dentro de función | no | string en `generar` | panel de ayuda | no | CONTENIDO_PEDAGÓGICO | texto publicado |
| texto y pregunta | dentro de función | no | plantilla en `contenido` | render de misión | no | CONTENIDO_PEDAGÓGICO | plantilla declarativa publicada |
| SVG | dentro de función | no | plantilla en `contenido` | blueprint por `innerHTML` | no | CONTENIDO_PEDAGÓGICO + PRESENTACIÓN | escena semántica publicada; renderer seguro del handler |
| `generar()` | se elimina en copia JSON | no | función | generación | no | FUNCIÓN con datos y algoritmo mezclados | reemplazar por payload + handler versionado |
| `contenido()` | se elimina en copia JSON | no | función | render | no | FUNCIÓN con datos y presentación mezclados | reemplazar por payload + handler versionado |
| `REGISTRO_MISIONES` | origen de selección actual | no | referencia global | `obtenerMision` y campaña | no | REFERENCIA_GLOBAL | prohibida para materializar publicaciones |
| `missionData` | no | no | no | datos generados, expected y final | no en publicación | ESTADO_TRANSITORIO | propietario Sesión/Runtime |
| progreso, respuestas, intentos | no | saneados si aparecen | no | evaluación y navegación | no deben publicarse | ESTADO_TRANSITORIO | propietario Sesión |
| `go()` | no | no | no | render de pantallas y navegación | no | COMPORTAMIENTO_GENÉRICO | permanece en Runtime |
| `openMission()` | no | no | no | materializa/renderiza/abre | no | COMPORTAMIENTO_GENÉRICO | permanece en Runtime |
| evaluación numérica | no | no | `expected` calculado | tolerancia `1e-9` | lógica no | COMPORTAMIENTO_GENÉRICO + CRITERIO_PUBLICADO | handler aplica criterio publicado |
| ajuste final | no | no | generado globalmente | validación final | no | CONTENIDO_PEDAGÓGICO de campaña + ESTADO_DE_SESIÓN | futura spec de final, no debe inferirse de legacy |

No toda función actual es comportamiento genérico. Las listas de opciones, fórmulas, operandos requeridos, pistas, consignas, preguntas, SVG y constantes como pi=3 son datos pedagógicos y deben extraerse al payload.

## 7. Separación entre datos y comportamiento

Contenido pedagógico publicado:

- identidades, títulos, orden y navegación;
- clasificación, narrativa, duración y etiquetas;
- listas de valores seleccionables y constantes;
- expresiones declarativas para derivados y respuesta esperada;
- criterios y operandos del procedimiento;
- pistas, consignas, preguntas y textos accesibles;
- escena visual semántica, medidas, etiquetas y estilo permitido;
- política declarada de generación y consumo de RNG.

Comportamiento genérico del handler:

- validar la forma cerrada de la spec y del payload;
- seleccionar de listas usando el RNG inyectado;
- evaluar un AST aritmético cerrado, sin código dinámico;
- sustituir marcadores declarados en plantillas de texto;
- construir SVG seguro desde primitivas permitidas y valores ya validados;
- producir las funciones efímeras `generar()` y `contenido()` esperadas por Runtime;
- validar datos generados y contenido renderizado;
- aplicar comparación numérica y reglas de operandos sin aportar valores concretos.

El handler no puede aportar silenciosamente textos, números, fórmulas, respuestas, títulos, orden, referencias o escenas específicas. Tampoco puede consultar `REGISTRO_MISIONES`, campañas legacy ni Studio.

Invariantes:

1. Todo lo que cambia lo visible o resoluble está en `PublishedCampaign.content` y su hash.
2. Una pareja `handlerId` + `handlerVersion` tiene semántica inmutable.
3. Una spec incompleta falla cerrada; no se completa.
4. La materialización es total o no produce misión.
5. Arrays e IDs conservan orden y valor.
6. La publicación y la spec nunca son mutadas.
7. El código publicado nunca se ejecuta.

## 8. PublishedMissionSpec

Forma exacta propuesta:

```text
PublishedMissionSpec = {
  missionId: string,
  handlerId: string,
  handlerVersion: string,
  payload: {
    presentation: {
      number: string,
      title: string,
      shortTitle: string,
      map: { title: string, subtitle: string, styleToken: string },
      ariaMessage: string,
      procedurePlaceholder: string,
      statementTemplate: string,
      question: string,
      hint: string,
      visual: { sceneType: string, primitives: array, labels: array }
    },
    classification: {
      subject: string,
      topic: string,
      subtopic: string,
      level: string,
      difficulty: number
    },
    narrative: { location: string, objective: string },
    activity: {
      type: string,
      estimatedDurationMinutes: number,
      tags: string[]
    },
    generation: {
      policy: "SEEDED_SEQUENCE_V1",
      variables: [{ name: string, select: number[] }],
      constants: [{ name: string, value: finite number }],
      derived: [{ name: string, expression: ArithmeticExpression }]
    },
    assessment: {
      responseType: "NUMERIC_WITH_PROCEDURE",
      expected: ArithmeticExpression,
      tolerance: finite nonnegative number,
      requiredOperands: OperandReference[],
      alternativeOperandSets: OperandReference[][]
    }
  }
}
```

`ArithmeticExpression` es un AST de datos con nodos cerrados: literal finito, referencia a variable/constante/derivado y operaciones `ADD`, `SUBTRACT`, `MULTIPLY`, `DIVIDE`. No admite strings ejecutables, llamadas, propiedades arbitrarias ni operadores adicionales. `OperandReference` apunta a un nombre declarado y puede pedir su valor derivado. Las plantillas usan marcadores nombrados validados, nunca interpolación evaluada.

Campos obligatorios: todos los mostrados, incluidos arreglos que pueden estar vacíos. `constants`, `derived` y `alternativeOperandSets` pueden ser arreglos vacíos, pero no null. Campos opcionales: ninguno en versión contractual 1. Campos anulables: ninguno. Campos derivados, no persistidos en la spec: valores elegidos, derivados numéricos, `expected`, contenido sustituido y SVG final.

Campos prohibidos: funciones, símbolos, bigint, undefined, no finitos, referencias circulares, DOM, Promise, storage, servicios, código fuente, scripts, URLs ejecutables, imports, estado de sesión, progreso, respuestas, seed, datos generados, `publicationId`, stores y referencias legacy.

La spec completa debe ser una copia defensiva, profundamente congelada al publicar, íntegramente canónica y cubierta por `contentHash`. `missionId` es único dentro de campaña; nombres de variables son únicos dentro de spec; toda referencia debe resolverse localmente; todos los marcadores y elementos visuales deben referirse solo a nombres declarados.

## 9. RuntimeMissionHandler

Identidad exacta:

```text
RuntimeMissionHandler = {
  handlerId: string,
  handlerVersion: string,
  validateSpec(spec): ValidationResult,
  materialize(spec, context): MaterializedRuntimeMission
}
```

No se requieren métodos públicos separados `generate`, `render`, `evaluate` ni `createNavigationMetadata`. El Runtime actual necesita finalmente `generar()` y `contenido()` sobre la misión materializada; `materialize()` puede crear cierres privados que usan operaciones internas del handler. La evaluación de resultado y procedimiento sigue hoy en `crios.js`; A2-006B debe probar helpers internos de expresión y forma, pero no ampliar innecesariamente la API pública. Si una futura actividad requiere otro modelo de evaluación, se define otro handler o una nueva versión.

`context` aporta únicamente capacidades genéricas: fábrica RNG compatible con la política declarada, clonación/congelación, renderer seguro y catálogo de tokens visuales permitido. No aporta misiones, textos, respuestas ni acceso a registros legacy.

Reglas:

1. registro explícito antes de cerrar el registry;
2. pareja identidad/versión única;
3. versión publicada semánticamente inmutable;
4. cambio incompatible implica nueva versión;
5. prohibido leer una misión completa o textos por `missionId`;
6. prohibido completar payload;
7. spec no mutada;
8. misión retornada nueva y profundamente congelada salvo los cierres funcionales necesarios;
9. validación obligatoria antes de materializar;
10. error estructurado sin resultado parcial;
11. ningún código de la publicación se ejecuta.

Retiro: una versión puede marcarse `DEPRECATED` para impedir nuevas publicaciones, pero sigue resolviéndose mientras exista cualquier publicación que la referencie. Solo puede pasar a `RETIRED` y eliminarse cuando un inventario demostrable confirme cero publicaciones resolubles dependientes. Nunca se redirige a otra versión.

## 10. Registro de handlers

El futuro `CRIOS_RUNTIME_MISSION_HANDLERS` es independiente de `REGISTRO_MISIONES` y resuelve exclusivamente por `handlerId` y `handlerVersion`.

API conceptual:

```text
register(handler)                 // interna durante bootstrap
has(handlerId, handlerVersion)    // pública de lectura
get(handlerId, handlerVersion)    // pública de lectura
list()                            // pública de lectura
close()                           // interna durante bootstrap
```

La API pública congelada debe exponer solo `has`, `get` y `list`; `register` y `close` pertenecen al bootstrap interno. `get` y `list` devuelven vistas congeladas o handlers ya congelados, nunca el mapa privado.

No se permite registro duplicado, reemplazo, fallback, selección de versión reciente, resolución por misión/título/posición/campaña ni mutación después de `close()`. Los errores son estructurados. El registry no lee persistencia, Studio, DOM ni red.

## 11. MaterializedRuntimeMission

Forma exacta compatible con los usos actuales:

```text
MaterializedRuntimeMission = {
  id: string,
  numero: string,
  titulo: string,
  nombreCorto: string,
  mapa: { titulo: string, subtitulo: string, clase: string },
  clasificacion: {
    materia: string, tema: string, subtema: string,
    nivel: string, dificultad: number
  },
  narrativa: { ubicacion: string, objetivo: string },
  tipoActividad: string,
  duracionEstimadaMinutos: number,
  etiquetas: string[],
  mensajeAria: string,
  ejemploProcedimiento: string,
  handlerId: string,
  handlerVersion: string,
  generar(aleatorio, variante): GeneratedMissionData,
  contenido(generatedData): { text: string, question: string, svg: string }
}
```

`GeneratedMissionData` contiene `variant`, todas las variables elegidas, derivados declarados, `expected`, `required`, `alternatives` y `hint`. Es una copia nueva y congelada. Las funciones son creadas por código confiable del handler y cierran sobre una copia congelada de la spec; no se serializan ni persisten.

La misión materializada es efímera, se fija durante la página o sesión y conserva ID, orden externo, navegación e identidad exacta del handler. No modifica publicación, registry ni misión legacy y no usa datos específicos externos.

Distinción:

- `PublishedMissionSpec`: dato persistido, autosuficiente y hasheado;
- `RuntimeMissionHandler`: código confiable, versionado e inmutable por identidad;
- `MaterializedRuntimeMission`: objeto ejecutable efímero construido dentro de Runtime.

## 12. Manifiesto de ejecución

`PublishedCampaign.content` debe incluir explícitamente:

```text
runtimeExecutionManifest = {
  runtimeContractVersion: "1.0.0",
  requiredHandlers: [{ handlerId: string, handlerVersion: string }],
  missionCount: positive integer,
  missionOrder: string[]
}
```

No se incluye `compatibilityLevel`: duplicaría decisiones que deben expresarse por `runtimeContractVersion` y handlers exactos.

El manifiesto se ubica dentro de `PublishedCampaign.content`, no fuera del contenido ni solo derivado en Runtime. Así queda cubierto por `contentHash`, permite rechazo temprano y diagnóstico de handlers ausentes sin materializar, y conserva explícitamente el orden semántico. `requiredHandlers` contiene parejas únicas en orden de primera aparición. Debe coincidir exactamente con las specs, `missionCount` con su cantidad y `missionOrder` con sus IDs.

Aunque parte sea derivable, la duplicación controlada funciona como compromiso verificable. Cualquier incoherencia produce `EXECUTION_MANIFEST_INVALID`; no se corrige automáticamente.

## 13. Reproducibilidad

Reproducir una ejecución exige:

- mismo `PublishedCampaign.content` y `contentHash`;
- mismas parejas `handlerId`/`handlerVersion`;
- mismo `runtimeContractVersion`;
- misma política `SEEDED_SEQUENCE_V1`;
- mismo orden de misión;
- misma semilla y contexto de sesión relevante;
- misma cantidad y orden de consumos RNG;
- mismo estado generado cuando sea registrado por sesión.

El hash protege los datos publicados, pero no incluye automáticamente los bytes JavaScript del handler. La garantía contractual es que una pareja de identidad y versión no cambia de semántica. Cambiar implementación o resultados exige incrementar `handlerVersion`, y tests de vectores conocidos deben impedir reutilizar una versión con semántica diferente.

Un `implementationHash` o `runtimeBundleId` aportaría evidencia más fuerte frente a builds accidentales. Debe evaluarse en A2-007 o endurecimiento posterior: mejora auditoría, pero exige pipeline de build, distribución y retención de bundles. No es obligatorio para A2-006B. `manifestHash` sería redundante mientras el manifiesto permanezca dentro de `contentHash`.

## 14. Generación y aleatoriedad

Las cuatro misiones son `DETERMINISTA_CON_SEMILLA`. No llaman `Math.random`; reciben `aleatorio`. El Runtime actual crea una secuencia con `seeded(hashString(realName))`, calcula variante con `hashString(realName) % variantCount + 1`, consume la secuencia en orden de campaña y después genera ajustes finales.

La publicación define listas, constantes, derivados, orden y política, pero no contiene la semilla. La semilla es estado de Sesión. Runtime crea el RNG conforme a la versión de política. Seguimiento deberá conservar procedencia, semilla o identificador reproducible, estado generado y handler identity en A2-007.

Reglas futuras:

- el handler no usa `Math.random` directamente;
- Runtime inyecta RNG y variante;
- cada selección consume exactamente una muestra en el orden de `generation.variables`;
- listas no pueden estar vacías;
- índice es `floor(randomValue * length)` con valor en `[0,1)`;
- la salida generada se valida y congela;
- cambiar consumo u orden exige nueva política o versión de handler;
- datos de sesión no se trasladan a `PublishedCampaign`.

El ajuste final actual también depende de la secuencia y es contenido pedagógico de campaña todavía no modelado por `PublishedMissionSpec`. A2-006C debe definir una spec de evaluación final o demostrar otra frontera publicada antes de declarar una campaña completamente autosuficiente.

## 15. Ownership

| Propietario | Responsabilidad exclusiva |
|---|---|
| Studio | editar borrador, seleccionar handler exacto y editar payload |
| Publicación | validar spec/manifiesto, congelar, versionar y calcular hash |
| Runtime handler registry | conservar implementaciones genéricas versionadas |
| Runtime | resolver handler exacto, materializar y mantener objeto efímero |
| Sesión | semilla, variante, estado generado, respuestas, intentos y progreso |
| Seguimiento | procedencia, resultados y evidencia reproducible |

No puede haber dos propietarios mutables del mismo dato. Studio deja de ser propietario al publicar. Publicación no edita el payload. Runtime no corrige specs. Sesión no redefine contenido. Seguimiento registra evidencia y no altera ejecución.

## 16. Validación y errores

Niveles:

- Studio: handler seleccionado, pareja resoluble para nuevas publicaciones, editor de payload y mínimos presentes.
- Publicación: forma exacta, serializabilidad estricta, referencias locales, AST cerrado, manifiesto coherente y handler permitido.
- Activación: no ejecuta handlers; puede rechazar manifiesto estructuralmente inválido cuando el contrato esté disponible.
- Runtime: versión contractual soportada, handler exacto disponible, `validateSpec()` exitoso, materialización completa y forma Runtime válida.

Una publicación activa incompatible produce ERROR; nunca fallback legacy.

| Código contractual | Productor/fase | Condición | Efecto | Recuperación | Prueba futura |
|---|---|---|---|---|---|
| `MISSION_SPEC_INVALID` | Publicación/Runtime, validación | forma o referencias inválidas | rechazo total | corregir y republicar | formas, referencias y extras |
| `MISSION_HANDLER_ID_MISSING` | Studio/Publicación | ID ausente o vacío | no publicar | seleccionar handler | campo omitido/vacío |
| `MISSION_HANDLER_VERSION_MISSING` | Studio/Publicación | versión ausente | no publicar | seleccionar versión | campo omitido/vacío |
| `MISSION_HANDLER_NOT_FOUND` | Publicación/Runtime | pareja no registrada | no publicar o ERROR Runtime | instalar handler exacto/republicar | registry sin pareja |
| `MISSION_HANDLER_VERSION_UNSUPPORTED` | Publicación/Runtime | ID existe, versión no soportada | rechazo | conservar/instalar versión | versión distinta sin fallback |
| `MISSION_HANDLER_DUPLICATE` | Registry/bootstrap | misma pareja registrada dos veces | bootstrap falla | corregir bundle | doble registro |
| `MISSION_HANDLER_REPLACEMENT_FORBIDDEN` | Registry/bootstrap | intento de reemplazo | operación rechazada | nueva versión | reemplazo tras registro |
| `MISSION_PAYLOAD_INVALID` | Handler/validación | tipos, no finitos, AST o tokens inválidos | no materializa | corregir payload | tipos y operadores prohibidos |
| `MISSION_PAYLOAD_INCOMPLETE` | Handler/validación | falta dato requerido | no materializa | completar y republicar | cada campo obligatorio |
| `MISSION_MATERIALIZATION_FAILED` | Handler/Runtime | excepción o salida parcial | ERROR Runtime | corregir handler/spec | fallo inyectado |
| `MATERIALIZED_MISSION_INVALID` | Runtime/postmaterialización | forma ejecutable incompleta | ERROR Runtime | nueva versión/corrección | quitar cada campo/función |
| `EXECUTION_MANIFEST_INVALID` | Publicación/Activación/Runtime | conteo, orden o handlers no coinciden | rechazo | corregir y republicar | incoherencias individuales |
| `RUNTIME_CONTRACT_VERSION_UNSUPPORTED` | Runtime | versión contractual desconocida | ERROR Runtime | actualizar Runtime/republicar | versión desconocida |
| `NONDETERMINISTIC_GENERATION_UNDECLARED` | Publicación/Handler | generación usa fuente no declarada | rechazo | declarar política compatible | acceso a `Math.random`/contexto |
| `LEGACY_CONTENT_MIX_FORBIDDEN` | Runtime/materialización | intento de completar desde legacy | ERROR Runtime | republicar spec autosuficiente | spy sobre registro legacy |

Todos son contractuales y todavía no están implementados.

## 17. Migración

| Misión | Datos serializables actuales | Datos dentro de funciones | Handler propuesto | Payload propuesto | Cambios en Studio | Cambios en Runtime | Estado |
|---|---|---|---|---|---|---|---|
| `energy` | metadatos, mapa, narrativa, clasificación | cinco listas, derivados este, fórmula, required, pista, texto, pregunta, escena rectangular y daño | `crios.geometry.declarative-area` `1.0.0` | variables `totalW,height,west,damageW,damageH`; derivado `east`; AST esperado; operandos; plantillas; escena | editor/adapter de spec y handler | registry + materializador | REQUIERE_EXTRACCION_DE_PAYLOAD; REQUIERE_HANDLER_NUEVO; REQUIERE_CAMBIO_DE_STUDIO; REQUIERE_POLITICA_DE_SEMILLA |
| `greenhouse` | metadatos, mapa, narrativa, clasificación | seis listas, fórmula triángulo/ajustes, required, pista, texto, pregunta y escena | mismo handler si soporta AST y escena declarativa sin defaults pedagógicos | variables `width,height,base,triH,loss,recovered`; AST; operandos; plantillas; escena triangular | igual | igual | REQUIERE_EXTRACCION_DE_PAYLOAD; REQUIERE_HANDLER_NUEVO; REQUIERE_CAMBIO_DE_STUDIO; REQUIERE_POLITICA_DE_SEMILLA |
| `ice` | metadatos, mapa, narrativa, clasificación | cuatro listas, radio, constante pi=3, fórmula, required alternativo, pista, texto, pregunta y escena circular | mismo handler con constantes, derivados y alternativas declarativas | variables `side,diam,recovered,sealed`; constante `pi`; derivado `rad`; AST; dos operand sets; escena circular | igual | igual | REQUIERE_EXTRACCION_DE_PAYLOAD; REQUIERE_HANDLER_NUEVO; REQUIERE_CAMBIO_DE_STUDIO; REQUIERE_POLITICA_DE_SEMILLA |
| `hangar` | metadatos, mapa, narrativa, clasificación | siete selecciones, dos derivados, fórmula, required, pista, texto, pregunta y escena en L | mismo handler solo si la escena completa es dato y el handler no codifica el hangar | variables `width,height,upper,lowerH,blockW,blockH,recovered`; derivados; AST; operandos; escena L | igual | igual | REQUIERE_EXTRACCION_DE_PAYLOAD; REQUIERE_HANDLER_NUEVO; REQUIERE_CAMBIO_DE_STUDIO; REQUIERE_POLITICA_DE_SEMILLA |

Publicables sin cambios: 0. Bloqueadas definitivamente: 0, sujeto a implementar la escena declarativa segura y modelar la evaluación final de campaña.

Las cuatro pueden compartir un handler porque el algoritmo genérico sería selección declarativa + AST cerrado + sustitución de plantillas + escena declarativa + evaluación numérica. No comparten hoy un algoritmo específico: cada fórmula y geometría difiere. Si A2-006B no logra una escena declarativa segura sin introducir branches por `missionId` o contenido oculto, debe crear handlers distintos por familia visual; nunca debe forzar el handler común mediante datos legacy.

## 18. Plan de implementación

`A2-006B — Especificaciones, handlers y materialización`:

- implementar modelos y validadores de `PublishedMissionSpec`;
- implementar registry versionado y cerrado;
- implementar AST aritmético, plantillas y escena segura;
- implementar handler(s) para las cuatro misiones;
- implementar materializador y pruebas aisladas con vectores conocidos;
- no conectar aún el arranque Runtime.

`A2-006C — Publicación de especificaciones ejecutables`:

- adaptar `CampaignDraft` y Studio para seleccionar handler y editar payload;
- validar handler, payload y manifiesto;
- incluir specs y manifiesto en `PublishedCampaign.content` y hash;
- definir la evaluación final de campaña como contenido publicado;
- migrar mediante republicación, no mutación de publicaciones existentes;
- ejecutar regresiones de Studio, Publicación, Activación y Persistencia.

`A2-006D — Resolución Runtime`:

- retomar reader, resolver, bridge, políticas LEGACY/PUBLISHED/ERROR y pinning;
- materializar exclusivamente desde envelope publicado;
- integrar mínimamente con `crios.js` e indicador visual;
- fallar cerrado ante handler/spec/manifiesto incompatibles;
- demostrar que no hay mezcla, escritura ni actualización en caliente.

`A2-007 — Provenance`:

- incorporar `publicationId`, versión, `contentHash`, identidad de handler y política/seed relevante;
- conservar estado generado, respuestas, resultados y evidencia en sesión/Seguimiento;
- no alterar la semántica de handlers ya publicados.

El plan es ejecutable en ese orden: A2-006D no debe comenzar hasta que A2-006C produzca publicaciones autosuficientes.

## 19. Integridad y límites

Recorrido inverso conceptual:

1. Desde `MaterializedRuntimeMission`, `handlerId` y `handlerVersion` localizan el handler exacto.
2. La pareja localiza la entrada exacta del registry, sin selección alternativa.
3. `missionId` más pareja localizan la `PublishedMissionSpec` dentro del orden publicado.
4. La spec localiza su `PublishedCampaign` contenedora.
5. La campaña localiza `contentHash`, que cubre spec y manifiesto.
6. Una consigna visible se rastrea a `payload.presentation.statementTemplate` y variables generadas.
7. Un número se rastrea a lista/constante/AST, algoritmo versionado y semilla de sesión.
8. Una evaluación se rastrea a `assessment`, lógica genérica del handler y estado de sesión.
9. Un error identifica código, fase y propietario según el catálogo.
10. El veredicto se rastrea al inventario individual de las cuatro misiones y su tabla de migración.

Límites no demostrables todavía:

- no existen modelos, registry, handlers ni materializador ejecutables;
- no existen specs migradas ni manifiesto publicado;
- no hay vectores de compatibilidad que inmovilicen semántica de handler;
- no hay `implementationHash` ni bundle retenido;
- Sesión aún no conserva seed, estado generado ni provenance;
- la evaluación final de campaña todavía vive en `crios.js` y debe publicarse en A2-006C;
- no se ejecutaron generadores en aislamiento por ausencia de Node y por evitar efectos del bootstrap real.

Este contrato no afirma compatibilidad Runtime actual. Define las condiciones verificables para alcanzarla sin mezclar contenido.

## 20. Veredicto

`PUBLISHABLE_MISSION_CONTRACT_READY`

Se inspeccionaron las cuatro misiones; se identificaron datos pedagógicos serializables y los embebidos en `generar()`/`contenido()`; se definieron spec autosuficiente, handler versionado, registry, misión efímera, manifiesto, reproducibilidad, errores y migración individual. No se propone `eval`, código publicado, recuperación por ID legacy ni fallback híbrido.

A2-006 permanece bloqueado hasta completar A2-006B y A2-006C. Una vez que existan handlers inmutables, specs publicadas completas, manifiesto coherente, política de semilla y evaluación final publicada, A2-006D puede retomar la resolución Runtime con política de falla cerrada.