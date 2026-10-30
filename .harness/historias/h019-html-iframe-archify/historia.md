---
id: H-019
titulo: HTML subido incrustado en los documentos (iframe aislado) — diagramas Archify
estado: draft # Carlos pidió (2026-10-30) que se haga YA, junto con H-016, para subir Archify. Falta su visto bueno de C-1..C-9.
covers:
  - frontend/src/editor/MilkdownView.tsx
  - frontend/src/editor/markdown/
  - frontend/src/editor/securityGuard.test.ts
  - backend/app/routers/files.py
  - backend/app/core/file_safety.py
origen: backlog
---

# H-019 — HTML incrustado (iframe aislado)

## 1. Intención

Que un diagrama Archify (HTML interactivo con zoom, panel y búsqueda) subido a Synapse se vea dentro del
documento y siga siendo interactivo, sin abrir un hueco de seguridad. Depende de H-016 (subir y servir HTML).

## 2. Decisiones ya tomadas (Carlos, 2026-10-30)

- HTML saneado en el markdown con lista blanca + `iframe` restringido (reemplaza la prohibición de HTML crudo
  de RNF-003). Etiquetas de formato permitidas: `br sub sup mark kbd small del ins span div details summary`.
- El iframe sólo apunta a archivos HTML de Synapse (nunca a sitios externos).
- `files-synapse.cjhirashi.com` se usa para HTML público; el privado se sirve desde el dominio principal.
- No hay publicación sin confirmación (H-016 C-8).
- **Quién sube HTML (Carlos, 2026-10-30):** sólo el usuario o agentes autorizados con API key. **Quien sube el HTML es responsable de que no traiga vulnerabilidades** (lo mismo para un agente: lo que sube lo revisa su operador). Esto es una política de uso; el sistema NO la da por cumplida y mantiene el aislamiento de §3 como red de seguridad (un agente puede incorporar contenido ajeno por inyección de instrucciones, y el aislamiento no cuesta nada al usuario).

## 3. Diseño de seguridad (AIRA; sustituye la nota «requiere prueba real» del backlog)

Archify es interactivo, así que el iframe necesita `allow-scripts`. Se hace seguro así:
- `sandbox="allow-scripts"` **sin** `allow-same-origin`: el HTML corre en un origen opaco, sin cookies, sin
  acceso a `localStorage` ni al documento padre ni a la API de Synapse con la sesión del usuario.
- El servidor responde el HTML con `Content-Security-Policy: sandbox allow-scripts; default-src 'none';
  script-src 'unsafe-inline'; style-src 'unsafe-inline'; img-src data: blob:; font-src data:; connect-src 'none'`
  y `X-Content-Type-Options: nosniff`. Así, aunque se abra el link directo, el HTML queda aislado y no puede
  hacer peticiones de red. **Ajuste por la política de arriba:** como el que sube es de confianza, la CSP admite
  además `https:` para imágenes, hojas de estilo y fuentes (un Archify con fuentes o iconos externos se ve
  completo); `connect-src 'none'` y la ausencia de `allow-same-origin` se mantienen. Scripts externos (CDN)
  quedan fuera por defecto; si el primer Archify real los necesita se decide con Carlos con evidencia.
- Para HTML público se usa además el dominio `files-synapse.cjhirashi.com` (sin cookies de Synapse).
- El iframe del documento admite sólo URLs `https://synapse.cjhirashi.com/files/<id>` o
  `https://files-synapse.cjhirashi.com/...`; cualquier otro `src` se descarta.
- El saneo del HTML del markdown usa DOMPurify con lista blanca y retorna un fragmento DOM (sin asignar
  `innerHTML`; `securityGuard.test.ts` debe seguir verde).

## 4. Criterios de aceptación (EARS booleano)

- **C-1:** CUANDO un documento contiene `<iframe src="…/files/<id>">` de un HTML de Synapse, la vista DEBE
  mostrarlo como iframe con `sandbox="allow-scripts"` (sin `allow-same-origin`), tamaño razonable y sin
  scroll de página propio innecesario.
- **C-2:** Un `iframe` con `src` externo o con esquema distinto de `https` DEBE descartarse (no se pinta).
- **C-3:** Etiquetas fuera de la lista blanca, atributos `on*` y `javascript:` en el markdown DEBEN eliminarse.
- **C-4:** `GET /files/<id>` de un HTML DEBE llevar la CSP descrita y `nosniff`, tanto privado (dominio
  principal, con sesión) como público.
- **C-5:** Un HTML privado DEBE verse dentro del iframe en el documento de su dueño y NO ser accesible sin
  sesión.
- **C-6:** El HTML incrustado NO DEBE poder leer cookies, `localStorage` ni el DOM de la app, ni hacer
  peticiones de red (verificado en navegador real con un HTML de prueba que lo intente).
- **C-7:** El botón «Adjuntar archivo» DEBE insertar el HTML subido como incrustado en el cursor; el link
  copiado desde la pantalla de archivos DEBE ofrecer «Copiar incrustado».
- **C-8:** Un diagrama Archify real DEBE seguir siendo interactivo dentro del iframe (zoom, búsqueda).
- **C-9:** La edición (Visual/Código) conserva el iframe al guardar y recargar sin alterarlo.

## 5. Plan (borrador)

Backend: cabeceras por tipo HTML en `get_file`. Frontend: saneador con DOMPurify (dependencia nueva, a pasar por
OSV-Scanner), nodo `iframe` en el esquema de Milkdown (y su ida y vuelta a markdown), ajustes en
`MilkdownView`/`NoteEditor`. Verificación real: HTML hostil de prueba (intenta leer cookies, fetch a la API,
`window.top`) y un Archify real.

## 6. Tabla de cobertura

(por llenar al implementar)

## 7. Checkpoint demostrable

Carlos sube un Archify, lo ve interactivo dentro de un documento y comprueba que el link sin sesión no abre
si es privado.
