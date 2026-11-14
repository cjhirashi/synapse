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
3. **El servidor no confía en ese HTML.** Lo vuelve a limpiar con `nh3` (lista cerrada de etiquetas y atributos; `img src` solo `data:` de imagen o `/files/<id>`; `a href` solo
   http(s), `mailto` o ancla) y WeasyPrint usa un `url_fetcher` cerrado: solo `data:` de imagen y archivos de imagen de la propia persona. Cualquier otra URL se bloquea, así el servidor
   no sirve para leer direcciones internas (SSRF) ni archivos locales.
4. **Los estilos salen siempre de la plantilla**, leída por el servidor desde el atributo `plantilla` de la nota; la petición no puede mandar CSS. Una plantilla sin `estilo.pdf.activo`
   (o un documento sin plantilla) responde `409 pdf-not-enabled`.
5. **`estilo.pdf` tiene un esquema cerrado**, validado igual en servidor y cliente con los mismos casos (`tests/fixtures/plantilla_reglas.json`): tipografías de lista cerrada (no hay
   fuentes propias), página Carta o A4 con márgenes, colores `#rrggbb`, textos de hasta 200 caracteres con campos especiales conocidos. `estilo.publicar` sigue reservado para H-035.
6. **Interactivos como recuadro.** Iframes (Archify, Plotly, YouTube), videos y audio no se imprimen: el PDF muestra un recuadro con el título y el enlace.
7. **Solo la persona (sesión) genera PDF**; una API key de agente recibe 401.
8. **Límites:** HTML de hasta 5 MB, 60 s por PDF, 2 a la vez (un tercero espera 5 s y recibe `503 pdf-busy`). Se genera al pedirlo, sin cola.

## Consecuencias

- La imagen del backend crece (Pango y fuentes) y tarda más en construirse; las pruebas que dibujan un PDF se corren dentro de la imagen.
- Un documento con imágenes grandes da un PDF pesado; cada imagen ya tiene su tope de 5 MB al subirse.
- El PDF necesita conexión con el servidor: sin ella el botón avisa.
- Hallazgo ajeno: `cjhirashi-career` fija `weasyprint==69.0`, con los dos avisos arriba; se debe subir a 70.0 en ese proyecto.
