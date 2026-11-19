
### A-20261114-SYNAPSE-H054-ESTADOS-PLANTILLA
- Fecha/hora: 2026-11-14 14:00 CDMX, pedido de Carlos (mensaje 2197)
- Actividad: H-054 ampliación (commit a5f319c): campo «Estados del documento» en los atributos de la plantilla (`estados`, validado en backend, cliente y fixture compartido, `plantilla:estados`); el documento con esa plantilla solo ofrece esos estados y no deja crear otros. Frontend 152 archivos / 3292 pruebas; backend 91 pruebas de reglas en la imagen 3.11; gate abierta. Desplegado (`compose build backend` + `up -d backend`, sin migraciones, `/health` 200, bundle y regla comprobados en el contenedor). Sin probar en navegador real.

### A-20261119-SYNAPSE-ATRIBUTOS-PLANTILLA-MENSAJE
- Fecha/hora: 2026-11-19 00:47 CDMX, pedido de Carlos (mensaje 2556)
- Actividad: Carlos no pudo guardar un atributo de plantilla sin valor. No se reprodujo: backend y cliente aceptan `valor` ausente en los 5 tipos; lo que fallaba era el nombre y el aviso culpaba al valor. `TemplateView.tsx` (commit b3576a5) valida el nombre antes de guardar y dice el motivo; prueba nueva con los 5 tipos sin valor; frontend 50/50 en los archivos tocados. Desplegado desde worktree limpio (imagen previa `synapse-backend:pre-attr-msg`), `/health` 200, bundle nuevo. Manual cap. 7 y README actualizados; ficha del portafolio sin cambios (no es una capacidad nueva). Sin probar en navegador real; sin push.
