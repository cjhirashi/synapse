---
id: ADR-008
tipo: adr
estado: accepted          # H-036, plan aprobado por Carlos el 2026-11-13 (análisis y plan en la bóveda Proyectos, `H-036`)
fecha: 2026-11-13
---

# ADR-008 · PDF de documentos con el formato de la plantilla

## Contexto

Carlos pidió descargar un documento como PDF con formato: tipografías, tamaños y color de encabezados y texto, imagen y textos de encabezado y pie con
campos especiales (metadatos, fecha, numeración de páginas), todo definido en la plantilla con la que nació el documento, y un botón «PDF» junto a «Editar».

## Decisiones

1. **El PDF se genera en el servidor con WeasyPrint.** Soporta encabezado y pie de página repetidos con numeración (elementos corrientes y `counter(page)`/`counter(pages)`)
   y se ve igual en escritorio y en el móvil; imprimir desde el navegador depende de cada navegador. Se fija `weasyprint==70.0` (la 69.0 tenía los avisos PYSEC-2026-3940 y 4311)
   y la imagen añade Pango y las fuentes DejaVu y Liberation.
2. **El cliente manda el HTML ya dibujado.** El servidor no tiene intérprete de Markdown y escribir uno daría un PDF distinto del que la persona ve (tablas, wikilinks, bloques
   de código, HTML incrustado, Mermaid). El botón toma el HTML de la vista Lectura. Descartado: intérprete de Markdown en el servidor.
3. **El servidor no confía en ese HTML.** Lo vuelve a limpiar con `nh3` (lista cerrada de etiquetas y atributos; `img src` solo `data:` de imagen, `/files/<id>` o una URL http(s) sin
   credenciales; `a href` solo http(s), `mailto` o ancla) y WeasyPrint usa un `url_fetcher` cerrado: `data:` de imagen, archivos de imagen de la propia persona e imágenes públicas
   de la web. Cualquier otra URL se bloquea (SSRF, archivos locales).
3 bis. **Las imágenes externas sí se imprimen (decisión de Carlos, 2026-11-13: él responde de lo que carga en su documento).** El servidor las descarga (8 MB y 8 s cada una, hasta 60 y
   40 MB por PDF), pero solo se conecta a direcciones públicas: resuelve el nombre, exige que **todas** las IP sean globales (no loopback, privadas, enlace local, CGNAT ni metadatos de
   la nube), conecta a la IP ya comprobada (sin ventana de DNS rebinding) y reverifica cada redirección (hasta 3). Que el contenido sea de la persona no basta como control: un agente puede
   escribir en sus bóvedas, y una imagen apuntando a `synapse-couchdb` o `169.254.169.254` usaría al servidor para leer su red interna.
3 ter. **Los SVG animados se imprimen en su último fotograma (pedido de Carlos, 2026-11-13).** Antes de dibujar, `core/svg_freeze.py` lleva cada animación a su valor final: SMIL (`animate`, `set`,
   `animateTransform`, `animateMotion`) y CSS (`@keyframes` con `animation`/`animation-name`, en `<style>` o `style=""`; `reverse` queda en el primer fotograma). No cubre JavaScript ni
   `transform-origin` propio de CSS. Un SVG que no se puede interpretar (o trae entidades) se imprime como viene.
4. **Los estilos salen siempre de la plantilla**, leída por el servidor desde el atributo `plantilla` de la nota; la petición no puede mandar CSS. Una plantilla sin `estilo.pdf.activo`
   (o un documento sin plantilla) responde `409 pdf-not-enabled`.
5. **`estilo.pdf` tiene un esquema cerrado**, validado igual en servidor y cliente con los mismos casos (`tests/fixtures/plantilla_reglas.json`): tipografías de lista cerrada (no hay
   fuentes propias), página Carta o A4 con márgenes, colores `#rrggbb`, textos de hasta 200 caracteres con campos especiales conocidos. `estilo.publicar` sigue reservado para H-035.
5 bis. **La imagen del encabezado es el fondo de la página y el pie no lleva imagen (pedidos de Carlos, 2026-11-14).** Se pone como fondo de cada hoja, desde su esquina superior izquierda, con el **ancho de la hoja elegida** (Carta 816 px, A4 794 px, a 96 ppp) y la altura proporcional, sin deformar ni repetir; los textos del encabezado van encima. El formulario de la plantilla muestra esas medidas junto al selector de la imagen para que se suba del tamaño justo (816 × 1056 px en Carta, 794 × 1123 px en A4); una imagen más ancha se corta por la derecha. Descartado: tamaño real a 96 ppp (la imagen de Carlos, 1080×1350 px sin resolución, salía más grande que la hoja; WeasyPrint tampoco lee la resolución de la imagen) y un ancho fijo de 816 px (cortaba 22 px en A4). WeasyPrint posiciona el fondo de `@page` desde el área de contenido, así que se compensa con los márgenes izquierdo y superior. El pie ya no tiene imagen: `pie.imagen` solo admite `null`, lo que mantiene válidas las plantillas guardadas antes.
5 ter. **Tipografía por nivel, fuente y línea de las bandas, y posición (pedido de Carlos, 2026-11-14).** `estilo.pdf.encabezados` pasa a tener `h1` a `h4`, cada uno con su fuente, tamaño y color (H5 y H6 usan H4). El encabezado y el pie de página llevan `fuente`, `linea` (activa, color, grosor), `distancia_mm` al borde de la hoja y `sangria_mm` lateral. **Compatibilidad:** las plantillas guardadas antes siguen válidas y se ven igual: `encabezados` plano vale para H1 y se derivan los demás niveles con las mismas proporciones del CSS anterior; la fuente de las bandas parte de la del texto a 0,82; el pie conserva su línea y el encabezado no la tiene. Cliente y servidor derivan igual (`pdfStyle.ts` / `pdf_style.py`), así la vista previa coincide con el PDF. Las bandas usan una tabla de tres columnas: un `display: flex` anidado dentro del cuadro de margen de WeasyPrint estira la banda y aleja la línea del texto (medido con un PDF real).
5 quater. **Tema de color a partir de un primario (pedido de Carlos, 2026-11-14).** `estilo.pdf.tema.primario` activa una paleta calculada con la misma regla del tema claro del Markdown del editor (`editor.css`): secundario = primario +30° y terciario = +60° en OKLCH; encabezados con los tonos 600 y 400; negrita, cursiva, enlaces y código mezclando secundario o terciario con el texto (`color-mix` en sRGB); marcadores, citas y tablas con el primario y el secundario. **El editor tiene los tonos 600/400 en una tabla fija de Tailwind para sus 17 colores**: para un color cualquiera se calculan imitándola (400 a luminosidad 0,72-0,86; 600 baja 0,16 y sube la intensidad hasta el 93 % de la que cabe en sRGB; un primario ya oscuro es su propio 600). Se contrastó contra Tailwind (violeta, lima y verde azulado casi iguales; azul y naranja más apagados). **Dos implementaciones, un contrato:** `color_theme.py` y `colorTheme.ts` pasan los mismos casos (`tema_colores.json`), así la muestra del formulario coincide con el PDF. Sin tema nada cambia; con tema, un color de encabezado fijado a mano manda y «automático» (sin `color` guardado) sigue al tema. El encabezado y el pie de página conservan sus colores propios (Carlos: «está bien como ya está»).
6. **Interactivos como recuadro.** Iframes (Archify, Plotly, YouTube), videos y audio no se imprimen: el PDF muestra un recuadro con el título y el enlace.
7. **Solo la persona (sesión) genera PDF**; una API key de agente recibe 401.
8. **Límites:** HTML de hasta 5 MB, 60 s por PDF, 2 a la vez (un tercero espera 5 s y recibe `503 pdf-busy`). Se genera al pedirlo, sin cola.

## Consecuencias

- La imagen del backend crece (Pango y fuentes) y tarda más en construirse; las pruebas que dibujan un PDF se corren dentro de la imagen.
- Un documento con imágenes grandes da un PDF pesado; cada imagen ya tiene su tope de 5 MB al subirse.
- El PDF necesita conexión con el servidor: sin ella el botón avisa.
- Hallazgo ajeno: `cjhirashi-career` fija `weasyprint==69.0`, con los dos avisos arriba; se debe subir a 70.0 en ese proyecto.
