<!-- pdf:portada -->

# Manual de Operación - {{atributo:programa}}

## 07 - Plantillas

&nbsp;

&nbsp;

<div align="right">

**Autor:** {{atributo:autor}}

**Responsable:** {{atributo:responsable}}

</div>

<!-- /pdf:portada -->

<!-- pdf:indice -->

## Qué aprenderás

- Qué es una plantilla y para qué sirve.
- Dónde están y cómo crearla y leer sus cinco secciones.
- Cómo se ve un documento que usa una plantilla y cómo ligarlo a ella.
- Cómo se configuran el PDF y la publicación en la web.

## Antes de empezar

Conocer las propiedades de una nota (capítulo 06).

## Qué es una plantilla

Una **plantilla** es un molde para documentos del mismo tipo (un informe semanal, una receta, una ficha). Define de una vez:

- en qué carpetas se ofrece,
- qué datos extra (atributos) llevan,
- qué estados puede tener un documento y de qué color,
- cómo se ve su PDF,
- si sus documentos se pueden publicar en la web,
- con qué estructura nace cada documento nuevo.

**Por qué importa:** con plantilla, todos tus documentos del mismo tipo quedan iguales y completos, sin copiar y pegar.

## Dónde están las plantillas y cómo crear una

Las plantillas son notas especiales que viven en la carpeta **PLANTILLAS** de cada bóveda.

1. Con la carpeta **PLANTILLAS** seleccionada, pulsa «Nueva nota»: el cuadro se llama «Nueva plantilla» y su botón dice «Crear plantilla».
2. Escribe el nombre (por ejemplo «Informe semanal») y créala.
3. Ábrela: en lugar del editor verás su vista de plantilla, con un botón «Guardar plantilla» arriba.

Un aviso te recuerda: **editar una plantilla no cambia los documentos que ya nacieron de ella**; conservan sus valores.

## Paso a paso: las secciones de una plantilla

1. **Título** y **Descripción** arriba: nombre de la plantilla y para qué sirve.
2. **1. Dónde se usa** ①: elige «En toda la bóveda» o «Solo en estas carpetas» y marca las carpetas con sus botones.
3. **2. Atributos opcionales** ②: datos extra además de los generales (título, descripción, etiquetas, estado y fechas). Cada atributo tiene **Nombre**, **Tipo** (por ejemplo Texto o Número) y **Valor inicial**. «Añadir atributo» crea otro y el bote de basura lo quita. El nombre «sistema» está reservado por Synapse: no se puede usar como atributo.

<div align="center">

![Una plantilla abierta|50%](https://synapse.cjhirashi.com/files/811bf755-e23f-4e4a-ac1f-34c56e833916)

</div>

Los atributos se pueden citar en el texto del documento con `{{atributo:nombre}}` (capítulo 05), y también en el encabezado y el pie del PDF.

## Los estados con color

En **Estados del documento** ① defines los estados que puede tener un documento con esta plantilla, cada uno con su color (gris, azul, verde y más).

1. Pulsa «Añadir estado».
2. Escribe el nombre (por ejemplo «revisión»).
3. Elige su color.
4. Pulsa «Guardar plantilla».

Una plantilla sin estados deja sus documentos sin estado. Si un documento cambia a una plantilla que no tiene su estado, el estado se vacía.

<div align="center">

![Estados con color|50%](https://synapse.cjhirashi.com/files/4de337c3-51c9-42c8-8356-a037b76ce7d4)

</div>

## Un documento que usa la plantilla

Un documento ligado a una plantilla muestra en sus propiedades la **Plantilla** ① y el **Estado** ② con su color, y debajo un segundo recuadro con sus atributos propios (aquí «responsable» y «semana»). Arriba tiene dos botones extra: descargar como PDF y publicar en la web, porque la plantilla los permite.

Hay dos formas de ligar un documento a una plantilla:

1. **Al crearlo:** en el cuadro «Nueva nota» (capítulo 04) elige la plantilla en el selector **Plantilla**. Solo aparece si hay plantillas disponibles para esa carpeta.
2. **Después:** abre el documento, pulsa «Editar» y elige la plantilla en el selector **Plantilla** de sus propiedades.

<div align="center">

![Documento con plantilla|50%](https://synapse.cjhirashi.com/files/507b592b-1e8a-4427-8224-27c9acd93599)

</div>

## Diseño del PDF

La sección **3. Diseño del PDF** ① controla cómo se ve el documento al descargarlo:

1. Enciende «Permitir descargar los documentos de esta plantilla como PDF» ②. Los documentos mostrarán un botón «PDF» junto a «Editar».
2. En **Página** elige el tamaño (por ejemplo Carta) y los **Márgenes (mm)**: superior, inferior, izquierdo y derecho.
3. En **Color del documento** elige un color primario; Synapse calcula los demás para encabezados, enlaces, código, listas, citas y tablas.
4. En **Tipografía** elige la letra y el tamaño de los encabezados y del texto.
5. Más abajo, escribe el contenido del encabezado y del pie (por ejemplo «Página {{pagina}} de {{paginas}}»).
6. Si quieres, marca «Imprimir los atributos del documento al inicio».

La vista previa de la derecha muestra una hoja de ejemplo con sus márgenes punteados, el encabezado y el pie.

<div align="center">

![Diseño del PDF|50%](https://synapse.cjhirashi.com/files/758dc09a-1e46-4c61-b9b4-55e98f1a30a3)

</div>

## Publicación en la web

La sección **4. Publicación en la web** tiene un interruptor ①: «Permitir publicar los documentos de esta plantilla en la web». Con él encendido, sus documentos muestran el botón de publicar junto a «PDF». Cada documento se publica a mano, con confirmación, y es una copia fija (capítulo 12).

<div align="center">

![Interruptor de publicación en la web|50%](https://synapse.cjhirashi.com/files/d0fc9d8b-6318-47a4-bdf4-8ab8f1fa02f2)

</div>

## Estructura base

La sección **5. Estructura base** tiene dos partes: las **Instrucciones** de uso (solo para quien use la plantilla, no se copian al documento) y el Markdown con el que nace cada documento nuevo. Ahí puedes incluir la portada y el índice del PDF (capítulo 05) y citar atributos con `{{atributo:nombre}}`.

## Consejos

- Una plantilla por tipo de documento; si tienes dudas, empieza con pocos atributos.
- Escribe en las instrucciones cuándo usarla y cómo llenarla.

## Si algo no sale como esperas

- **No veo la plantilla al crear un documento:** revisa «Dónde se usa»; quizá la carpeta no está incluida.
- **No aparece el botón PDF o publicar:** la plantilla no lo permite; actívalo en la sección correspondiente.
- **Los documentos viejos no cambiaron:** es lo esperado; las plantillas solo afectan a lo nuevo.
- **Synapse rechaza un atributo llamado «sistema»:** es un nombre reservado; usa otro, por ejemplo «programa».
