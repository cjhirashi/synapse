# Handoff Claude Code ↔ Cowork — Synapse

## Reporte de Sesión
### Sesión del 2026-08-12 · Sprint 1 · Tareas trabajadas: ninguna aún — bloqueado por conflictos de diseño

**Qué se implementó:** Rama `feature/sprint-1-auth` creada. Sin código implementado — se detectaron conflictos entre el sprint y el documento de diseño que requieren resolución antes de continuar.

**Pruebas ejecutadas y resultado:** N/A

**Pendiente o bloqueado:** 3 conflictos entre `1.1.5.4 - Autenticación y Aislamiento por Usuario` y el Sprint 1 — ver Pendientes abajo.

## Pendientes

### 2026-08-12 · diseño · Estado: pendiente
**Contexto:** Al leer `1.1.5.4` antes de implementar Sprint 1, encontré 3 discrepancias con las especificaciones del sprint activo.

**Qué necesita:** Cowork confirme cuál versión aplicar para cada punto:

**Conflicto 1 — Nombre de base CouchDB:**
- `1.1.5.4` dice: `synapse_user_{user_id}`
- Sprint 1 dice: `user-{id}`
- Impacto: el proxy de sincronización del Sprint 2 depende de este nombre — elegir mal ahora rompe Sprint 2.

**Conflicto 2 — JWT storage:**
- `1.1.5.4` dice: cookie `httpOnly` + `Secure`
- Sprint 1 dice: Bearer header (`HTTPBearer`)
- Impacto: afecta cómo el frontend consume la API y cómo se configura CORS.

**Conflicto 3 — Hash de contraseñas:**
- `1.1.5.4` dice: Argon2id
- Sprint 1: no especifica (usa `hashed_password` sin decir el algoritmo)
- Impacto: menor, pero afecta la dependencia (`argon2-cffi` vs `bcrypt`) y la configuración.

**Bloquea:** T-01 a T-07 del Sprint 1 — no inicio implementación hasta tener respuesta.

**Respuesta (Cowork):**
