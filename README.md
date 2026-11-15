# Synapse

Almacén personal self-hosted de bóvedas de conocimiento: notas Markdown estilo Obsidian que
se editan sin conexión y se sincronizan, más archivos adjuntos. Sin IA interna: los agentes
externos (OpenClaw) acceden vía API REST con una API key.

**Stack:** FastAPI · PostgreSQL (control plane: usuarios, sesiones, API keys, metadatos de
archivos) · CouchDB/PouchDB (bóvedas y notas, offline-first) · MinIO (objetos de archivos) · React + TypeScript + Vite (app instalable, PWA con service worker propio y Web Push)  
**Despliegue:** Docker Compose en servidor local Ubuntu (self-hosted); dominio vía `SYNAPSE_DOMAIN`.

## Qué hace hoy

- **Bóvedas y notas** con árbol de carpetas, papelera, restauración, resolución de conflictos y
  sincronización PouchDB ↔ CouchDB (`/sync`). Cada bóveda tiene icono, color y un catálogo de
  atributos META propio (tipos fecha, select y multiselect).
- **Editor** con vistas Visual (Milkdown), Código (CodeMirror) y Lectura; wikilinks `[[Destino]]`
  con navegación y vista previa, bloques de código con resaltado, Mermaid, tablas, tareas, HTML
  incrustado en iframe aislado (diagramas Archify), gráficos Plotly (HTML) y vídeos de YouTube.
- **Archivos** (pestaña «Archivos» de cada bóveda): subida de imágenes (5 MB) y documentos (25 MB) a MinIO con visibilidad
  privada o pública, tipo verificado por firma de bytes, SVG saneado, carpeta opcional, renombrar
  y borrar.
- **Acceso de agentes:** API keys de agente (`/auth/agent-keys`, `Authorization: Bearer syn_ak_…`)
  para leer y escribir bóvedas, notas y archivos por REST. Guía en [`docs/API.md`](docs/API.md).
- **Gobierno de agentes:** cada bóveda trae carpetas de sistema en la raíz (`AG - SKILLS`,
  `AG - MENSAJES`, `AG - AGENTES`, `BITACORA`, `PLANTILLAS`). El servidor genera solo la **bitácora**
  diaria desde el registro de cambios, los **ÍNDICES** de cada carpeta y las propiedades selladas
  (fechas); `AG - AGENTES` registra qué agente escribe en qué carpeta (hoy en modo sombra:
  `AGENT_ACCESS_MODE=shadow`, registra sin bloquear) y `AG - MENSAJES` es el buzón entre agentes
  (conversaciones como carpetas, solo las escriben los agentes). Una **skill global** y una plantilla
  de sistema se publican en todas las bóvedas y no se pueden editar desde la plataforma
  (`backend/app/system_docs/`).
- **Tareas por bóveda (H-053):** pestaña «Tareas» con dos niveles (tarea y subtareas), asignables a la persona o a un
  agente, con inicio, vencimiento, hasta 5 recordatorios y una ruta indicativa a un documento o carpeta. Cuatro vistas:
  **Lista**, **Kanban** (arrastre entre columnas), **Calendario** (año, mes, semana y día) y **Línea de tiempo (Gantt)**, que solo
  dibuja las tareas con inicio y vencimiento y permite arrastrar sus barras. Cada tarea tiene detalle completo, filtros con
  contadores, permisos por agente y retención de 30 días tras cerrarse. La barra derecha del documento muestra su índice de
  encabezados y las tareas ligadas a él.
- **Avisos y app instalable (H-053):** bandeja de avisos (`/avisos`) por asignación, cambio de estado de un agente y
  vencimientos. Cada aviso es una tarjeta, agrupada por día, con el tipo y el evento, el título y la descripción de la tarea,
  su estado, su responsable (con nombre y foto), la prioridad, el vencimiento y la bóveda; se marca como leído con su casilla ✓ sin
  abrir la tarea, y hay filtro «Sin leer» y «Marcar todo como leído». Preferencias por tipo y horas silenciosas (22:00–07:00 por
  defecto, hora de México); la app se instala como PWA y envía Web Push (VAPID) con la misma estructura de la tarjeta (título
  «Tipo · evento» y, en el cuerpo, la tarea, su descripción, «estado · responsable · bóveda» y el vencimiento) y con aviso de versión nueva.
- **Tareas de todas las bóvedas (H-056):** el riel de bóvedas tiene, arriba de «Papelera» y del usuario, la entrada «Tareas» (`/tareas`): las tareas de todas las bóvedas juntas, cada una con su bóveda, en Lista, Kanban, Calendario y Línea de tiempo, con filtro por bóveda, responsable, estado y vencimiento. Es solo una vista: desde ahí se cambia el estado o las fechas y «En la bóveda» abre la tarea en la suya; crear, editar o borrar se hace en cada bóveda. Las tareas de bóvedas distintas no se relacionan.
- **Proyectos (H-058):** cada bóveda tiene proyectos que agrupan sus tareas, como en Asana: título, descripción, responsable (la persona o un agente), estado (activo, en pausa, completado) y color. Se gestionan con el botón «Proyectos» de la pestaña Tareas; cada tarea raíz elige su proyecto (sus subtareas la siguen), la lista se agrupa por proyecto con su avance, y hay filtro por proyecto. Borrar un proyecto deja sus tareas sin proyecto. La ventana global de tareas muestra el proyecto de cada tarea y permite filtrar por él. Las tareas de bóvedas distintas siguen sin relacionarse.
- **Bloqueo entre tareas (H-057):** una tarea o subtarea puede esperar a otras de su misma bóveda (campo «Bloqueada por»). Puede ponerse en curso, pero no darse por hecha hasta que todas sus bloqueadoras estén hechas (una cancelada no la libera); sin ciclos, y no entre una raíz y sus subtareas. En la lista, el Kanban y el detalle se ve qué tarea está bloqueada, por quién y a quién bloquea; «Hecha» queda deshabilitada mientras haya bloqueo.
- **Índices con cápsulas de estado (H-055):** la vista de un INDICE lista subcarpetas y documentos con su descripción, tags, fecha y columnas adicionales, y el estado de cada documento va en una cápsula del color que le da su plantilla (gris si no tiene plantilla o su estado no figura en ella). El cuerpo que leen los agentes con `note_get` sigue siendo el markdown de siempre.
- **Índices en líneas propias y enlace al índice padre:** cada elemento de un INDICE se ve en cuatro líneas: título; estado (cápsula) con la fecha de actualización al lado; descripción; tags como cápsulas (las columnas adicionales debajo). Es solo la vista de la persona: el cuerpo Markdown que leen los agentes no cambia. Cada documento muestra, entre sus propiedades y el contenido, un enlace automático «Índice de <carpeta>» (o «de la bóveda» en la raíz) que abre el INDICE de su carpeta.
- **Plantilla en cada documento (H-054):** el formulario de atributos de un documento lleva el control **Plantilla** (obligatorio: «Sin plantilla»
  es un valor válido). Lista las plantillas de la bóveda cuyo alcance cubre la carpeta del documento. Con plantilla, el formulario muestra solo los
  atributos generales y los de la plantilla (siempre existen, pueden ir vacíos) y ya no permite crear atributos; los opcionales que el documento ya
  tenía quedan ocultos en `atributos_ocultos` y reaparecen al quitar la plantilla (si uno coincide en nombre y tipo con un atributo de la plantilla,
  pasa a ser ese atributo con su valor). Al asignar o cambiar la plantilla, la estructura de contenido se carga sola si el documento está vacío; si
  tiene contenido, un aviso pregunta si se actualiza (pierde el contenido actual) o se conserva. Borrar una plantilla deja sus documentos sin plantilla
  y sus atributos con contenido pasan a opcionales. La plantilla define sus propios **estados** (nombre y uno de cuatro colores: gris, azul, verde o rojo; no hay estados de serie): el selector de estado del documento muestra solo esos, y si el documento cambia a una plantilla que no tiene su estado, el estado queda vacío (un documento puede no tener estado). La sección «Estructura base» separa las **instrucciones** de uso de la plantilla (no se copian al documento) de la estructura Markdown con la que nace cada documento.
- **Plantillas y descarga en PDF (H-036):** cada plantilla (`PLANTILLAS/plantilla-<nombre>.md`) define dónde se ofrece, sus
  atributos y, en «Diseño del PDF», el formato con el que se descargan sus documentos: hoja Carta o A4 y márgenes, tipografía, tamaño y
  color por nivel de encabezado (H1 a H4) y para el texto, un **color primario** del que el servidor calcula el secundario y el
  terciario y los colores de negrita, cursiva, enlaces, código, listas, citas y tablas (la misma regla del Markdown), una imagen de
  membrete como fondo de cada página (816 × 1056 px en Carta, 794 × 1123 px en A4), y encabezado y pie con fuente, línea y posición
  propias y campos automáticos (`{{titulo}}`, `{{fecha}}`, `{{pagina}}`, `{{paginas}}`, `{{atributo:x}}`). El documento muestra el botón «PDF» junto
  a «Editar»; el PDF sale del mismo HTML que se ve en Lectura (tablas y citas redondeadas, casillas de tareas, imágenes propias, privadas incluidas,
  imágenes públicas de la web y SVG animados en su último fotograma) y lo genera el servidor con WeasyPrint. El documento puede llevar **portada**
  (`<!-- pdf:portada -->`…`<!-- /pdf:portada -->`), **índice** automático (`<!-- pdf:indice -->`), **saltos de página** (`<!-- pdf:salto -->`),
  **alineación** (`<div align="center">`) y **columnas** (`<div class="cols-2">`), con botones en la barra del editor; la portada y el índice tienen
  fondo propio en la plantilla (color o imagen, con estilos de encabezados y texto propios o los del documento) y la numeración empieza después de ellos. Los **comentarios de revisión** (`<div class="comentario" data-autor="…">`) se ven como ventanas grises con la foto y el nombre del autor en Lectura y edición, y nunca salen en el PDF. Detalle en [`docs/API.md`](docs/API.md)
  (sección «PDF de documentos») y en el ADR-008.
- **Agentes con nombre y foto:** cada agente tiene nombre visible y foto editables desde API keys; aparecen en tareas, bitácora
  y listas.
- **Propiedades de las notas:** metadatos tipados (texto, fecha, selección, selección múltiple)
  separados del cuerpo, sin YAML en el texto.
- **Cuenta:** login con cookie + refresh, cambio forzado de contraseña, gestión de API keys en
  `/settings/api-keys`, administración de agentes en `/settings/agent-access`, notificaciones en
  `/settings/notifications`, tema claro/oscuro/sistema. Ajustes es una pantalla aparte, con «Volver a bóvedas».

## Estructura

```
synapse/
├── backend/          # FastAPI — Arquitectura Hexagonal
│   ├── app/
│   │   ├── core/     # Config, seguridad, errores (RFC 9457), reglas de notas/atributos/archivos
│   │   │   ├── ports/    # Interfaces abstractas (Protocols)
│   │   │   └── models/   # Tablas del control plane (usuarios, tokens, API keys, archivos)
│   │   ├── services/ # Lógica de negocio
│   │   ├── adapters/ # Implementaciones concretas (CouchDB, Postgres, MinIO)
│   │   └── routers/  # Endpoints FastAPI (adaptadores primarios)
│   ├── alembic/      # Migraciones del control plane (001…017)
│   ├── scripts/      # Operación: migraciones de datos, claves por agente, purga, publicación de la skill global (ver scripts/README.md)
│   └── tests/
├── frontend/         # React + TypeScript + PouchDB (SPA offline-first)
├── docs/API.md       # Guía de la API para consumidores (agentes)
├── diseño/           # Documentación de diseño del producto (solo en el árbol principal; ignorada por git, fuera de los worktrees)
└── .harness/         # Arnés de desarrollo (Slice Development): método, backlog, historias, gate
```

## Inicio rápido

```bash
# Infraestructura compartida primero
cd ~/infraestructura && docker compose up -d

# Synapse — desarrollo (backend, CouchDB, PostgreSQL y MinIO)
cd /mnt/disco2/cjhirashi-data/proyectos/synapse
cp .env.example .env   # rellena credenciales, JWT_SECRET, ADMIN_EMAIL/ADMIN_PASSWORD y SYNAPSE_DOMAIN
docker compose -f docker-compose.yml -f docker-compose.dev.yml up

# Verificar
curl http://localhost:8000/health
```

Tests y comandos de cada parte: [`backend/README.md`](backend/README.md) y
[`frontend/README.md`](frontend/README.md); operación: [`backend/scripts/README.md`](backend/scripts/README.md).
Cómo se trabaja y qué sigue: `AGENTS.md` y `.harness/backlog.md`. Estado a 2026-11-13: en producción.

## Licencia

Este proyecto se distribuye bajo la [PolyForm Noncommercial License 1.0.0](LICENSE): se puede ver, estudiar y usar con fines no comerciales. **No se permite su uso comercial** sin autorización escrita del autor. Copyright 2026 Carlos Jiménez Hirashi.
