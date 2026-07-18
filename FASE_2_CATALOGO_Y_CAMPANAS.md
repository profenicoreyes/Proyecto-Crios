# Fase 2 — Catálogo, clasificación y campañas

## Objetivo

Separar las misiones del motor para que puedan agregarse, organizarse y reutilizarse sin modificar `crios.js`.

## Clasificación actual

Todas las misiones de esta campaña están clasificadas como:

- Materia: Matemática
- Tema: Geometría
- Subtema: Cálculo de áreas

La ambientación narrativa no determina la clasificación académica.

## Componentes agregados

### Taxonomía

`js/datos/taxonomia.js` define las materias, temas y subtemas admitidos.

### Campañas

`js/datos/campanas.js` define recorridos ordenados. La campaña actual es `reactivacion-base-antartica` y contiene las cuatro misiones existentes.

### Registro de misiones

`js/nucleo/registro-misiones.js` valida y registra cada misión. También permite:

- obtener una misión por identificador;
- listar todas las misiones;
- filtrar por materia, tema, subtema, tipo o etiqueta;
- obtener las misiones de una campaña.

### Misiones independientes

Cada misión vive en su propio archivo dentro de:

`js/misiones/matematica/geometria/areas/`

## Cómo agregar una misión

1. Crear un archivo nuevo en la carpeta académica correspondiente.
2. Registrar la misión mediante `REGISTRO_MISIONES.registrar({...})`.
3. Completar su clasificación, narrativa, etiquetas, generación de datos y contenido.
4. Agregar su identificador a la campaña deseada en `js/datos/campanas.js`.
5. Agregar la etiqueta `<script>` del archivo antes de `js/crios.js` en `index.html`.

Los identificadores históricos de las cuatro misiones actuales se conservaron para no invalidar partidas guardadas.
