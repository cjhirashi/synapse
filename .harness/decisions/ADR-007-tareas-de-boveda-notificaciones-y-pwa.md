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

## Fases siguientes (mismo ADR, se amplía al ejecutarlas)

Notificaciones en la app (tabla `notifications`, campana), vencimientos, PWA instalable con service worker `NetworkOnly` para
todo lo que no sea el shell, y Web Push con VAPID y horas silenciosas. El orden lo fijó Carlos: tareas, luego notificaciones,
al final PWA y push.
