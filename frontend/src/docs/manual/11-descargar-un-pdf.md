<!-- pdf:portada -->

# Manual de Operación - {{atributo:programa}}

## 11 - Descargar un PDF

&nbsp;

&nbsp;

<div align="right">

**Autor:** {{atributo:autor}}

**Responsable:** {{atributo:responsable}}

</div>

<!-- /pdf:portada -->

<!-- pdf:indice -->

## Qué aprenderás

- Descargar un documento como PDF.
- Añadir portada, índice y saltos de página.
- Entender de dónde sale el diseño del PDF.

## Antes de empezar

El botón PDF solo aparece en los documentos que usan una **plantilla con el PDF activado** (capítulo 07, sección «Diseño del PDF»). Si no lo ves, pide a quien administra tus plantillas que lo active, o actívalo tú en la plantilla.

## Paso a paso: descargar el PDF

1. Abre el documento en lectura.
2. Pulsa el botón «Descargar como PDF» ① (la hoja con la flecha hacia abajo, junto al globo y al lápiz «Editar»).
3. Espera unos segundos: mientras se genera, el botón dice «Generando el PDF…».
4. El archivo se descarga en tu equipo con el título del documento como nombre.

<div align="center">

![Botón de descargar como PDF](https://synapse.cjhirashi.com/files/d8b1169f-fafc-46af-91b0-0445d1d9b233)

</div>

**Por qué importa:** el PDF se arma con el diseño de la plantilla (hoja, tipografías, encabezado y pie), así todos los documentos del mismo tipo se ven iguales.

## Portada, índice y saltos de página

Tú decides la estructura del PDF con tres botones de la barra de formato del editor (capítulo 05, «Páginas del PDF»):

- **Portada:** convierte lo seleccionado en la primera hoja del PDF, sin encabezado ni pie. Púlsalo otra vez para quitarla.
- **Índice:** pone, donde esté el cursor, una hoja con el índice de todos los encabezados y sus páginas.
- **Salto de página:** lo que sigue empieza en una hoja nueva.

En lectura, el índice y el salto aparecen como una franja con un aviso («Índice del PDF · aquí se arma el índice»); esa franja no sale en el PDF, solo marca el lugar.

El PDF del ejemplo tiene, en orden:

1. La **portada** con el título del informe.
2. La hoja de **índice**, con cada encabezado y su número de página.
3. Las hojas de **contenido**, con el encabezado (nombre del negocio y título del documento) y el pie («Página 1 de 2»).

<div align="center">

![Portada del PDF|50%](https://synapse.cjhirashi.com/files/4c31b3f5-730e-4c8b-8b5e-866a55ad9d7a)

</div>

<div align="center">

![Hoja de índice y hoja de contenido|50%](https://synapse.cjhirashi.com/files/0af620d9-2e74-474e-b04e-2d7b2456ba63)

</div>

Los **comentarios de revisión** (capítulo 05) no se imprimen: el PDF queda limpio. Los valores de atributos citados con `{{atributo:nombre}}` salen con su valor, sin marca.

## Consejos

- Pon un título claro en el primer encabezado: es el nombre del archivo y el de la portada.
- Revisa el PDF antes de enviarlo: ábrelo y confirma que el índice y las páginas son los que esperas.

## Si algo no sale como esperas

- **No aparece el botón PDF:** la plantilla del documento no lo permite.
- **El índice sale vacío:** el documento no tiene encabezados (H1 a H4).
- **Una imagen no sale en el PDF:** revisa que el archivo exista en la bóveda (capítulo 08).
