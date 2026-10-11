---
ultima_actualizacion: 2026-10-11
fase: Sprint 2 — 0002-auth implementada, pendiente de verificación
arquitectura_verificada: True
sprint_actual: 2
---

# State — Synapse

## Correcciones del usuario (lo primero)

- **Synapse = almacén de bóvedas puro.** Sin IA interna (sin RAG, LangGraph, LiteLLM,
  Ollama). Los agentes OpenClaw (AIRA, Paulina, Liza, main…) acceden vía API.
- **Fuente de verdad:** este `state.md` y las specs, por encima de la cola de Cowork y de
  `TAREAS.md` (que se corrige para alinearse con las specs).
- **Auth (decisiones del usuario, SPEC-0002):** JWT 24 h; admin sembrado desde entorno
  (`ADMIN_EMAIL=cjhirashi@gmail.com`, `ADMIN_PASSWORD`); contraseña semilla `admin1234`
  sólo en `.env` local; el admin crea guests con la misma semilla y **todos** deben
  cambiarla en el primer ingreso; sección "Cambiar contraseña" en el frontend; se
  mantiene `argon2-cffi` + `PyJWT`; sin registro público.
- **Patrón:** monolito modular por capas con puertos (ADR-001).
- **Rama de trabajo:** `feature/sprint-1-auth` (no `dev`).

## Reglas vigentes (P1–P5)

| Regla | Qué |
|---|---|
| P1 | Gate siempre primero |
| P2 | Datos aislados por `user_id` (identidad sólo del token) |
| P3 | Validación de permisos en todo endpoint |
| P4 | Ningún secreto en el repo; config sensible sin defaults |
| P5 | Tests con BD real — **excepción declarada:** control plane en SQLite (plan 0002 §7) |

## Estado de las features

| Feature | Estado | Notas |
|---|---|---|
| 0002-auth | `implemented` (sin verificar) | T-001–T-058 hechas · backend 77 tests, cov 97 % · frontend 13 tests · contrato en `specs/0002-auth/contracts/openapi.yaml` · **enmienda del spec (V-1/V-2/V-3/G-1) pendiente de aprobación del usuario** |
| 0003-vault-crud | sin spec | T-002 de `TAREAS.md` |

## Backlog / deuda conocida

1. **Aprobación de la enmienda de SPEC-0002** (RF-005/012/013/019) y del PR #3; re-verificación (nada está `verified`).
   Residuales del verificador sin abordar: R-1 access tokens válidos tras cambiar contraseña,
   R-2 sin rotación de refresh, R-3 sin enlace a "Cambiar contraseña" en la UI, R-4 el frontend
   no llama `/auth/refresh`, R-5 sin botón de logout, R-6 test de aislamiento casi vacío.
2. **`docker-compose.yml`** aún declara Qdrant y Gotenberg (contradice "almacén puro"),
   el backend depende de `qdrant`, y `frontend/` no tiene `Dockerfile`. Requiere decisión
   (fuera del alcance de 0002).
3. Migraciones 002 y 003 probadas en SQLite y PostgreSQL 15 real (round-trip; 003 aborta si hay duplicados por mayúsculas).
4. **Tests del control plane en PostgreSQL real** (cierra la excepción a P5) — feature aparte.
5. `.harness/gate/services.txt` vacío (bloque por perfil inactivo); `spectral` no instalado (lint de contrato omitido).
6. `datetime.utcnow()` deprecado en `auth_service`/`auth_repository` (avisos, no fallos).

## Hazards conocidos

1. Conflictos PouchDB ↔ CouchDB — tests de sync + documentación.
2. Usuario A ve datos de B — validación en todo endpoint (test de aislamiento en 0002).
3. Offline → datos obsoletos — UI clara de estado.
4. Borrar bóveda sin backup — soft delete + 30 días de gracia.

## Próximo paso inmediato

Revisión/verificación de 0002-auth y PR de `feature/sprint-1-auth` (cuando el usuario lo
pida). Después: decidir la limpieza de `docker-compose.yml` y abrir **0003-vault-crud**
(Fase 1 Specify).
