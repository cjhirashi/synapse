
### A-20261114-SYNAPSE-H054-ESTADOS-PLANTILLA
- Fecha/hora: 2026-11-14 14:00 CDMX, pedido de Carlos (mensaje 2197)
- Actividad: H-054 ampliación (commit a5f319c): campo «Estados del documento» en los atributos de la plantilla (`estados`, validado en backend, cliente y fixture compartido, `plantilla:estados`); el documento con esa plantilla solo ofrece esos estados y no deja crear otros. Frontend 152 archivos / 3292 pruebas; backend 91 pruebas de reglas en la imagen 3.11; gate abierta. Desplegado (`compose build backend` + `up -d backend`, sin migraciones, `/health` 200, bundle y regla comprobados en el contenedor). Sin probar en navegador real.
