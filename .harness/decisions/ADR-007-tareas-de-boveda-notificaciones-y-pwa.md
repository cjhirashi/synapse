---
id: ADR-007
tipo: adr
estado: accepted          # H-053, aprobado por Carlos el 2026-11-12 (análisis y plan en la bóveda Proyectos, `H-053`)
fecha: 2026-11-12
---

# ADR-007 · Tareas de bóveda, notificaciones y PWA

## Contexto

Carlos pidió un gestor de tareas por bóveda (dos niveles, asignable a él o a sus agentes, con una ruta indicativa a un
documento o carpeta), con notificaciones que lleguen al dispositivo, y convertir la app en PWA. Se revisó cómo lo resolvió
`cjhirashi-career` (tabla única con `parent_id`, bandeja de avisos con campana): sirve la forma, pero su planificador de
agentes ya está retirado y no tiene PWA ni push.

## Decisiones (fase 1: tareas)

1. **PostgreSQL, no CouchDB** (tabla `vault_tasks`, migración 012), como los metadatos de archivos: consultas por asignado,
   estado y vencimiento sin pasar por el modelo de documentos. Contrapartida: las tareas se editan solo con conexión.
2. **Una tabla, dos niveles:** una subtarea es una fila con `parent_id`; no tiene hijas (lo garantiza `TaskService`). Se borra
   en cascada con su raíz.
3. **Estado de la raíz derivado** de sus subtareas, calculado al escribir (sin planificador); una raíz con subtareas no admite
   un cambio directo de estado. No hay bloqueo entre subtareas (`is_blocking` de career queda fuera de v1).
4. **Ruta indicativa:** texto normalizado sin comprobar su existencia; nunca bloquea.
5. **Permisos por agente** (`task_rules.decide_task`, mismo interruptor `AGENT_ACCESS_MODE` que el resto): lee todo; crea tareas
   y subtareas; cambia `status` y `notes` de lo asignado a él; edita, reasigna o borra solo lo que creó. Sin registro,
   suspendido o clave general: solo lectura. Asignar a un agente exige que esté registrado y activo en la bóveda.
6. **Concurrencia:** `version` entera como ETag y `If-Match` opcional.
7. **Retención:** una raíz cerrada (hecha o cancelada) se elimina con sus subtareas 30 días después de cerrarse
   (`TASKS_RETENTION_DAYS`), en un ciclo de fondo del proceso; sin papelera. Una subtarea nunca se elimina sola (cambiaría el
   estado derivado de su raíz). Reabrir reinicia la cuenta.

## Decisiones (fase 2: notificaciones en la app)

8. **Tabla `notifications` general** (`kind`, `resource_type`, `url`, `dedupe_key` única) y `notification_prefs` (tipos apagados),
   migración 013. Solo sesión humana: un agente no lee ni marca los avisos de la persona.
9. **Se generan al escribir** (misma transacción que el cambio): un agente asigna una tarea a la persona; un agente cambia el
   estado de una tarea que creó la persona. La persona nunca se avisa de su propia acción.
10. **Vencimientos** en el ciclo de fondo del proceso (`task_jobs.py`, cada 5 min, junto con la retención): avisos a 24 h, a 1 h y al
    vencer (hasta 7 días después), solo la ventana vigente, idempotentes por `dedupe_key` (id, `due_at`, ventana).
11. **Pantalla de avisos en el riel** (`/avisos`) con contador consultado cada 45 s con la pestaña visible, en vez de un menú
    emergente dentro del riel angosto. La ruta de la API es `/notifications` (la de la app, en español, para no chocar con ella).

## Fase 3: PWA y Web Push

12. **Service worker propio y mínimo** (`public/sw.js`, sin Workbox: cero dependencias nuevas). Guarda solo los assets con huella
    (`/assets/*`, inmutables) y la pantalla de arranque para abrir sin red; todo lo demás (`/vaults`, `/files`, `/sync`, `/auth`,
    `/admin`, `/tasks`, `/notifications`) va directo a la red: el service worker nunca guarda datos de la persona. La réplica
    local de notas sigue siendo PouchDB. Se registra solo en producción.
13. **Actualización con aviso, sin recarga automática**: la versión nueva queda en espera y un banner ofrece «Actualizar»; así no se
    pierde un borrador abierto. Convive con `reloadOnStaleChunk`. `spa.py` sirve `/sw.js` con `Cache-Control: no-cache` y
    `Service-Worker-Allowed: /`, y el manifest como `application/manifest+json`.
14. **Manifest instalable**: `id`, `start_url=/vaults`, `scope=/`, `display=standalone`, `lang=es`, iconos `any` y `maskable`, atajo «Avisos».
15. **Web Push con VAPID** (`pywebpush==2.5.0`, auditada con OSV-Scanner el 2026-11-12: 20 paquetes, 0 hallazgos). Las claves viven en
    `.env` (modo 600, fuera del repo); sin ellas el push queda apagado y la bandeja sigue funcionando. Solo `adapters/web_push.py`
    importa la librería. Las suscripciones solo se aceptan hacia servicios de push conocidos y por https (sin SSRF).
16. **Cola en la tabla**: `notifications.pushed_at` NULL = pendiente. Un hilo despachador (`push_dispatcher.py`) se despierta al crear
    un aviso (y cada 30 s), lo marca revisado *antes* de enviar (a lo sumo una vez), lo envía con un payload mínimo
    (`title`, `body` ≤140, `url`, `tag`) y borra la suscripción si el servicio responde 404/410. Un aviso con más de 24 h no se envía.
17. **Horas silenciosas** por persona (por defecto 22:00–07:00, America/Mexico_City, pueden cruzar la medianoche): suprimen el push,
    no el aviso en la bandeja. Un aviso generado en ese horario no se envía después (decisión de simplicidad; un resumen matutino
    queda como mejora posible).
18. **Permiso solo tras un clic** (Ajustes → Notificaciones → «Activar notificaciones»), con «Enviar aviso de prueba» para validar
    cada dispositivo. Dispositivos previstos: laptop y Android (sin iPhone).

**Sustituye a D-11 de la spec 0011** («la app no se vuelve instalable ni offline»): esa decisión dejaba la PWA fuera hasta contar con una
spec propia, y por orden de Carlos (2026-11-12) este ADR es esa spec. Por eso `brandAssets.test.ts` ya no exige un manifest sin
`start_url`, `scope` ni `display`.

## Perfil de agente

19. **Nombre visible y foto por `agent_id`** (tabla `agent_profiles`, migración 015, por persona), editables desde API keys («Personalizar»)
    una vez creada la key. Identifican las huellas del agente: bitácora, creador y asignado de las tareas, API keys y Agentes por bóveda.
    El `agent_id` técnico no cambia, y la bitácora conserva el id (el servidor no escribe nombres: un cambio de nombre se aplica también a
    los registros viejos). Una key general (sin `agent_id`) no tiene perfil.
20. **La bitácora se decora al mostrarla**: la app sustituye `aira (agente)` por `Nombre (aira, agente)` y antepone la foto con una imagen
    Markdown hacia la ruta exacta `/agent-profiles/<id>/photo?v=N`, única ruta relativa que el editor admite como imagen y que pinta como
    avatar pequeño, sin pantalla completa. El documento guardado no se modifica.
