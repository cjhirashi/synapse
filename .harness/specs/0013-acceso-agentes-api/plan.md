---
id: PLAN-0013
tipo: plan
feature: 0013-acceso-agentes-api
estado: approved
aprobaciones:
  fase_2: { por: "Carlos Jiménez (cjhirashi, Telegram)", fecha: 2026-10-28, nota: "P-1…P-9 tal cual; P-10 ajustado a label único por usuario (no global); añadir sync.py/agent_keys.py/agent_key_port.py/agent_key_repository.py a covers de SPEC-0013 (§8)." }
actualizado: 2026-10-28
---

# PLAN-0013 · Acceso de agentes OpenClaw a bóvedas vía API key

> El *cómo* de SPEC-0013 en el patrón hexagonal por-capas con puertos (ADR-001), tal como lo
> aplican 0002 (auth) y 0003/0005 (datos). Es una feature de **credencial e identidad**: añade
> una segunda vía de autenticación que resuelve al **mismo** `current_user` que la cookie, sin
> tocar las reglas de negocio de bóvedas/notas (SPEC-0003/0005/0010). Las decisiones de producto
> de spec §6 (autenticar *como* el mismo usuario, `Bearer`, hash en reposo) **no se reabren**. Lo
> que este plan decide está en §7 (**P-1…P-10**).
>
> **Principio rector (AGENTS.md, P2/P3 — aislamiento por usuario):** la key no crea un usuario
> nuevo ni un permiso cruzado; autentica *como* su dueño. La base CouchDB sigue saliendo **sólo**
> del `sub` del principal resuelto (`synapse_user_{sub}`), exactamente igual que hoy
> (`vaults.py:43`, `sync.py:148`). Ningún dato de la petición elige la base.
>
> **Precedentes de código leídos para este plan (no se reinventan):**
> - Hash de secretos de **alta entropía** → `core/security.py:36` (`hash_refresh_token`, SHA-256).
>   Argon2 (`hash_password`) es sólo para contraseñas (baja entropía). Ver P-3.
> - Modelo de tabla del control plane → `core/models/refresh_token.py` (plantilla exacta).
> - Resolución de sesión → `core/dependencies.py:12` (`get_current_user`, devuelve `TokenPayload`).
> - Reutilización de la resolución en `/sync` → `routers/sync.py:122` (`get_sync_user`).
> - Base por token → `routers/vaults.py:43`, `routers/sync.py:148`.
> - 503 ante almacén caído → `core/errors.py:228` (`StorageUnavailable`), patrón de `vaults.py`.
> - Esquema del control plane en tests → `tests/conftest.py` (`Base.metadata.create_all`, SQLite;
>   excepción a P5 declarada en PLAN-0002 §7).

## 0. Gates de simplicidad
- [x] **Simplicity** — una tabla nueva (`agent_api_keys`), un router nuevo (`agent_keys.py`), un
  servicio/puerto/adaptador nuevos (calcados de `AuthService`/`AuthPort`/`AuthRepository`) y
  **una** dependencia nueva (`get_current_principal`). Reutiliza `TokenPayload` como forma del
  principal resuelto (P-5), el primitivo SHA-256 existente (P-3) y el patrón de la base por token.
  Sin caché de validez, sin cola asíncrona, sin TTL de key (la spec pide credencial de larga vida;
  la caducidad es la **revocación** explícita).
- [x] **Anti-Abstraction** — no se añade ninguna capa genérica nueva: el servicio de keys sigue
  1:1 el hexágono de auth. No se introduce un "motor de credenciales" ni un segundo estándar de
  hashing (P-3). La dependencia de datos reusa el cuerpo de `get_current_user` para la rama cookie
  (helper extraído), no lo duplica.
- [x] **Integration-First** — el contrato OpenAPI (§4) y los tests de BD real (§5) se escriben
  **antes** que el código. La frontera clave (una `Bearer` key lee las mismas bóvedas/notas que la
  cookie del dueño, y una revocada falla en la siguiente petición) se fija primero como test rojo.

## 1. Cumplimiento constitucional
| Artículo | Cómo lo respeta este plan |
|---|---|
| Art. 1–2 (patrón hexagonal) | Dominio en `services/agent_key_service.py` tras `core/ports/agent_key_port.py`; adaptador `adapters/agent_key_repository.py` (SQLAlchemy). El router sólo orquesta (ruta → validar → procesar → responder). La dependencia `get_current_principal` vive en `core/dependencies.py`, junto a `get_current_user`. |
| Art. 3 (testing, P5) | Tests con BD real: control plane **SQLite** (excepción P5 declarada, PLAN-0002 §7; `Base.metadata.create_all`) y CouchDB **real** para los tests de aislamiento de datos que ya exige la suite. Nada de repos mockeados. El secreto en claro **nunca** se escribe en un fixture: se captura en runtime de la respuesta de creación (§5.3, P5 del enunciado). |
| Art. 5 (seguridad, P1–P4) | **P2/P3:** la key resuelve **sólo** al `owner_id` que la creó (RF-006); el listado/revocación se filtran por `owner_id` del principal; una key ajena/inexistente en `DELETE` → 404 (`AgentKeyNotFound`), no revela existencia. **P4:** sólo se persiste el hash (SHA-256); el valor plano se devuelve una vez y no se guarda. **RNF-002:** ni el hash ni el valor plano entran en logs ni en cuerpos de error. Lookup por hash exacto indexado (sin comparación de secretos en memoria). |
| Art. 6 (contratos/errores RFC 9457) | Nuevos errores de dominio en `core/errors.py` (`AgentKeyNotFound`); el resto reusa `NotAuthenticated`/`InvalidToken`/`StorageUnavailable`/`ValidationFailed` ya existentes. Todo 401/404/503/422 sale como Problem Details por `core/problems.py` (sin `HTTPException`). Contrato propio en `contracts/openapi.yaml`. |
| Art. 9 (trazabilidad) | Cada test anotado con su `RF-`. §9 mapea RF↔archivo↔test fila por fila. |
| Art. 10 (raíz, no parches) | 503 ante Postgres caído (RF-008) se resuelve en el **camino nuevo** envolviendo la consulta de resolución, no con un `try/except` defensivo global. `last_used_at` best-effort (RF-009) se resuelve por diseño (commit propio aislado), no con un `TODO`. |
| Art. 11 (docs) | §8: `docs/API.md`, READMEs por capa, notas de re-anclaje. |
| Art. 12 | Sin artefactos nuevos del arnés. Las constantes de formato de la key viven una vez en `core/security.py`. |

## 2. Arquitectura de la feature (hexagonal por-capas)

### 2.1 Núcleo (dominio)
| Módulo | Cambio | RF |
|---|---|---|
| `core/security.py` | `API_KEY_PREFIX = "syn_ak_"`; `generate_api_key() -> str` (prefijo + `secrets.token_urlsafe(32)`); `hash_api_key(raw) -> str` (SHA-256 hex, **mismo primitivo** que `hash_refresh_token`, P-3); `is_well_formed_api_key(raw) -> bool` (prefijo + charset + longitud, para rechazo barato previo a la BD, RF-003). | RF-001, RF-003 |
| `core/models/agent_api_key.py` (nuevo) | Modelo `AgentApiKey` calcado de `RefreshToken`: `id` (uuid str, PK), `owner_id` (FK `users.id`, index), `label` (String), `key_hash` (String, **unique**, index; SHA-256, nunca el valor en claro), `created_at`, `last_used_at` (nullable), `revoked_at` (nullable). Relación `owner = relationship("User")`. **P-10:** unicidad de `(owner_id, label)` se aplica sólo entre filas vigentes — ver índice parcial en la migración (§3), no `UniqueConstraint` de tabla completa (eso bloquearía reusar un label tras revocar). La capa de servicio además revalida antes de insertar (mensaje de dominio claro; la constraint de BD es el cinturón de seguridad, no el mensaje al usuario). | RF-001, RF-004…RF-006, P-10 |
| `core/models/__init__.py` | Alta de `AgentApiKey` en imports y `__all__` (lo lee `alembic/env.py:18` y `Base.metadata` de los tests). | RF-001 |
| `core/errors.py` | `AgentKeyNotFound(DomainError)`: `slug="agent-key-not-found"`, `status=404`, para `DELETE` de una key ajena o inexistente (no revela existencia, P3). `AgentKeyLabelTaken(DomainError)` (**nuevo, P-10**): `slug="agent-key-label-taken"`, `status=409`, cuando `create` choca con el índice único del mismo dueño — **sólo cuenta otra key vigente** (`revoked_at IS NULL`) con ese label; una revocada no bloquea reutilizar su nombre (rotación: revocar la vieja y crear la nueva con el mismo label queda permitido). | RF-005, RF-010 (P-10) |

Regla de dominio (en el servicio): **una key resuelta debe estar no revocada y su dueño activo**;
en cualquier otro caso la resolución devuelve `None` → 401 con el mismo cuerpo que una cookie
inválida (RF-003/RF-007: 401, nunca 403).

### 2.2 Servicio y puerto
| Módulo | Cambio |
|---|---|
| `core/ports/agent_key_port.py` (nuevo) | `AgentKeyPort(ABC)`: `create(id, owner_id, label, key_hash, created_at) -> AgentApiKey`; `get_active_by_hash(key_hash) -> AgentApiKey \| None`; `list_by_owner(owner_id) -> list[AgentApiKey]`; `get_owned(owner_id, key_id) -> AgentApiKey \| None`; `revoke(key, revoked_at) -> None`; `touch_last_used(key_id, when) -> None`; `commit()`; `rollback()`. Mismo contrato "flush sin confirmar, el llamante hace commit" que `AuthPort`. |
| `adapters/agent_key_repository.py` (nuevo) | `AgentKeyRepository(AgentKeyPort)` sobre `Session`, calcado de `AuthRepository`. `get_active_by_hash` filtra `key_hash == ?` **y** `revoked_at IS NULL` (lookup indexado, O(1)). `touch_last_used` es un `UPDATE … WHERE id = ?`. |
| `services/agent_key_service.py` (nuevo) | `AgentKeyService(repo: AgentKeyPort)`. Métodos: `create(owner_id, label) -> (AgentApiKey, raw)` (genera, hashea, persiste; devuelve el plano **una vez**); `resolve(raw) -> AgentApiKey \| None` (valida forma → hashea → `get_active_by_hash` → comprueba dueño activo; **best-effort** `touch_last_used` en commit propio, P-7); `list(owner_id)`; `revoke(owner_id, key_id)` (lanza `AgentKeyNotFound` si no es del dueño). Sin dependencia de CouchDB. |

### 2.3 Coordinación: resolución del principal (`core/dependencies.py`)
Dos dependencias, sin duplicar la validación JWT (**P-4**):

| Dependencia | Credencial | Devuelve | Quién la usa |
|---|---|---|---|
| `get_current_user` (intacta) | **sólo** cookie `access_token` (JWT) | `TokenPayload` | superficie de **cuenta/gestión**: `/auth/me`, `/auth/change-password`, `require_admin`, y el router de gestión de keys (§2.5) |
| `get_current_principal` (**nueva**) | cookie **primero**, si no hay → `Authorization: Bearer <key>` | `TokenPayload` | superficie de **datos**: `/vaults`, `/sync` |

- Se extrae un helper privado `_principal_from_cookie(request, db) -> TokenPayload | None` con el
  cuerpo actual de `get_current_user` (líneas 13-24): devuelve el payload si hay cookie válida,
  `None` si no hay cookie, y re-lanza `InvalidToken` si la cookie está mal. `get_current_user`
  pasa a ser un wrapper que exige cookie (si `None` → `NotAuthenticated`), **con el mismo
  comportamiento y contrato de hoy** (cero cambio para quien ya lo usa).
- `get_current_principal(request, db)`:
  1. si hay cookie → `_principal_from_cookie` (camino humano, el dominante; evita tocar la BD de
     keys cuando hay sesión web);
  2. si no hay cookie pero hay `Authorization: Bearer` → `AgentKeyService(AgentKeyRepository(db))
     .resolve(raw)`; si resuelve, construye `TokenPayload(sub=key.owner_id, role=owner.role.name,
     ver=owner.token_version, exp=<sintético>)` (P-5); si no, `NotAuthenticated` (RF-003/RF-007);
  3. ni cookie ni header → `NotAuthenticated`.
- `require_password_changed` cambia su `Depends(get_current_user)` por `Depends(get_current_principal)`:
  la compuerta de cambio-de-contraseña de la **superficie de datos** debe ver el principal (una
  petición por key no trae cookie). `require_admin` sigue en `get_current_user` (admin es cookie-only).

**RF-008 (503):** la rama `Bearer` envuelve la consulta de resolución; ante
`sqlalchemy.exc.OperationalError` (Postgres no disponible) lanza `StorageUnavailable` (503), mismo
patrón que `vaults.py` ante CouchDB caído. Sólo en el camino nuevo (no cambia el camino cookie).

### 2.4 Repunte de las rutas de datos a `get_current_principal`
| Archivo | Cambio | ¿en `covers`? |
|---|---|---|
| `routers/vaults.py` | `get_vault_service` y `create_vault`: `Depends(get_current_user)` → `Depends(get_current_principal)`. El router ya depende de `require_password_changed` (que ahora resuelve el principal). | **sí** |
| `routers/sync.py` | `get_sync_user` (línea 136) llama `require_password_changed(get_current_user(request, db), db)` → `require_password_changed(get_current_principal(request, db), db)`. `SyncRoute.limited` (línea 110) lo invoca en threadpool: sin cambios de firma. | **no** → ver §8 y P-4 (marcador de alcance para Gate 2) |

### 2.5 Router de gestión de keys (`routers/agent_keys.py`, nuevo)
- `APIRouter(prefix="/auth/agent-keys", tags=["auth"], route_class=DeepJsonRoute,
  dependencies=[Depends(get_current_user)])` — **sólo cookie** (spec §3: "requiere sesión cookie";
  una key no acuña más keys ni cambia la contraseña del humano → contención de privilegio **por
  construcción**, no con un guard extra, P-4/P-9).
- Endpoints (ruta → validar → procesar → responder, como el resto del repo):
  - `POST ""` → 201, `AgentKeyCreated` (incluye el valor plano, **sólo aquí**, RF-001).
  - `GET ""` → `list[AgentKeyOut]` (sin `key` ni `key_hash`, RF-004/RNF-002).
  - `DELETE "/{key_id}"` → 204; `AgentKeyNotFound` si no es del dueño (RF-005, P3).
- Registro en `main.py` junto a los demás routers (antes de `install_spa`).

### 2.6 Esquemas (`core/schemas.py`)
- `AgentKeyLabel = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=64)]`.
- `AgentKeyCreate(BaseModel)` (`extra="forbid"`): `label: AgentKeyLabel`.
- `AgentKeyCreated(BaseModel)`: `id`, `label`, `key` (plano, sólo en la creación), `created_at`.
- `AgentKeyOut(BaseModel)`: `id`, `label`, `created_at`, `last_used_at`, `revoked_at` — **sin**
  `key` ni `key_hash`.

## 3. Modelo de datos — migración Alembic 005
Nueva migración `backend/alembic/versions/<rev>_005_agent_api_keys.py`, `down_revision =
'c9e3f5a7b2d4'` (head actual = 004). Estilo calcado de la 002 (`create_table` de `refresh_tokens`):

```python
def upgrade() -> None:
    op.create_table('agent_api_keys',
        sa.Column('id', sa.String(), nullable=False),
        sa.Column('owner_id', sa.String(), nullable=False),
        sa.Column('label', sa.String(), nullable=False),
        sa.Column('key_hash', sa.String(), nullable=False),
        sa.Column('created_at', sa.DateTime(), nullable=False),
        sa.Column('last_used_at', sa.DateTime(), nullable=True),
        sa.Column('revoked_at', sa.DateTime(), nullable=True),
        sa.ForeignKeyConstraint(['owner_id'], ['users.id'], ),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint('key_hash'),
    )
    op.create_index(op.f('ix_agent_api_keys_owner_id'), 'agent_api_keys', ['owner_id'], unique=False)
    op.create_index(op.f('ix_agent_api_keys_key_hash'), 'agent_api_keys', ['key_hash'], unique=True)
    # P-10 (Gate 2): label único por dueño, sólo entre keys vigentes — índice parcial, portable
    # entre SQLite y PostgreSQL 15 (ambos soportan `CREATE UNIQUE INDEX ... WHERE`).
    op.create_index(
        'uq_agent_api_keys_owner_label_active', 'agent_api_keys', ['owner_id', 'label'],
        unique=True, postgresql_where=sa.text('revoked_at IS NULL'), sqlite_where=sa.text('revoked_at IS NULL'),
    )

def downgrade() -> None:
    op.drop_index('uq_agent_api_keys_owner_label_active', table_name='agent_api_keys')
    op.drop_index(op.f('ix_agent_api_keys_key_hash'), table_name='agent_api_keys')
    op.drop_index(op.f('ix_agent_api_keys_owner_id'), table_name='agent_api_keys')
    op.drop_table('agent_api_keys')
```

Ronda de ida y vuelta en SQLite y PostgreSQL 15 real (backlog 3 del `state.md`: toda migración se
prueba en ambos). `revoked_at IS NULL` = key vigente (evita un booleano redundante: la fecha de
revocación es a la vez la marca y la bitácora).

## 4. Contratos
| Archivo en `contracts/` | Frontera | Gate(s) de CI |
|---|---|---|
| `contracts/openapi.yaml` | `POST`/`GET /auth/agent-keys`, `DELETE /auth/agent-keys/{id}` y la vía `Authorization: Bearer` documentada como `securityScheme` en `/vaults` y `/sync` | `ContractGuard` («emitido ⊆ declarado», ya activo en toda la suite, `conftest.py`); respuestas de error como `Problem` (SPEC-0004) |

El contrato declara `AgentKeyCreated`/`AgentKeyOut` y las respuestas 401/404/503/422 por referencia
al `Problem` compartido. La vía `Bearer` se declara como esquema de seguridad alternativo a la
cookie en las rutas de datos.

## 5. Estrategia de pruebas (por zona del patrón)

### 5.1 Tabla por zona
| Zona | Qué se prueba | Herramienta / archivo |
|---|---|---|
| modelo (BD real SQLite) | tabla y columnas de `agent_api_keys`; FK a `users`; `key_hash` único | `tests/test_models.py` (amplía) |
| seguridad/formato | `generate_api_key` da prefijo `syn_ak_` + longitud/charset esperados; `hash_api_key` determinista y = SHA-256; `is_well_formed_api_key` rechaza prefijo/charset/longitud malos; el plano nunca es el hash | `tests/test_security.py` (amplía) |
| servicio (BD real) | `create` persiste hash (no el plano) y devuelve el plano una vez; `resolve` acepta vigente, rechaza revocada/inexistente/mal formada; `list`/`revoke` scoped a `owner_id`; revocar una no afecta a las demás (RF-005); `resolve` de dueño inactivo → `None` | `tests/test_agent_api_key_service.py` (nuevo) |
| dependencia | `get_current_principal`: cookie válida = `get_current_user` (sin regresión); sin cookie + `Bearer` válido → principal del dueño; `Bearer` revocada/mal formada/ausente → 401; `require_admin` sigue rechazando keys | `tests/test_agent_api_key_deps.py` (nuevo) |
| router de gestión | `POST` 201 con plano una vez; `GET` sin `key`/`key_hash`; `DELETE` 204 y luego 401 al usar la key; `DELETE` de key ajena → 404; **gestión sólo cookie**: una `Bearer` key contra `/auth/agent-keys` → 401 | `tests/test_agent_api_key_api.py` (nuevo) |
| acceso de datos con key (BD real + CouchDB real) | una `Bearer` key lee **las mismas** bóvedas (`GET /vaults`) y la **misma** base de sync (`synapse_user_{owner}`) que la cookie del dueño (RF-002); nunca la de otro usuario (RF-006, P2); key revocada → 401 en la siguiente petición (RNF-001) | `tests/test_agent_api_key_access.py` (nuevo); se apoya en los patrones de `test_vaults_isolation.py`/`test_sync_isolation.py` |
| errores | key revocada → 401 no 403 (RF-007); control plane caído → 503 (RF-008, simulando `OperationalError` en el `Session`); `last_used_at` best-effort: si su escritura falla la petición sigue 200 (RF-009) | `tests/test_agent_api_key_errors.py` (nuevo) |
| contrato | el `openapi.yaml` de la feature contra el emitido; `ContractGuard` en toda la suite | `tests/test_problem_contract.py`/`test_contract.py` (patrón existente) |
| no regresión | suites de 0002/0003/0005/0008/0010 en verde (el repunte a `get_current_principal` no rompe el camino cookie) | `pytest` completo |

Anotación: cada test lleva su `RF-` en el nombre o en un comentario (Art. 9).

### 5.2 Aislamiento (el test que más importa, RF-006/P2)
Con dos usuarios reales (admin sembrado + un guest), una key del usuario A **nunca** debe:
- aparecer en el `GET /auth/agent-keys` de B;
- ser revocable por B (`DELETE` → 404);
- resolver a la base `synapse_user_{B}` ni leer bóvedas/notas de B.
Recorre REST (`/vaults`) y canal (`/sync`) con la key en el header, comparando contra lo que ve la
cookie de cada dueño.

### 5.3 Sin secretos en fixtures (P5 del enunciado)
El valor plano **sólo** existe en memoria del test: se obtiene del cuerpo de `POST /auth/agent-keys`
(con la cookie del dueño, sesión real) y se usa acto seguido en `Authorization: Bearer`. **Nunca**
se escribe una key ni un hash literal en `tests/fixtures/` (P4). Un helper de test
`create_agent_key(client, label) -> str` encapsula el alta y devuelve el plano.

## 6. Secuenciación de archivos (tests antes que código)
> Orden test-first por bloques; de la base de datos hacia afuera. tasks.md (Fase 3) se deriva de
> aquí, **no se genera en este turno**.

0. **Preparación.** CouchDB real disponible (lo exige `conftest.py`); confirmar head de Alembic
   (`004`/`c9e3f5a7b2d4`) antes de crear la 005.
1. **A · Modelo + migración.** `test_models.py` (tabla/columnas/FK/único, rojo) → `AgentApiKey`
   + alta en `models/__init__.py` + migración 005. Ida y vuelta en SQLite y PostgreSQL 15.
2. **B · Formato + hash.** `test_security.py` (prefijo, charset, longitud, SHA-256 determinista,
   `is_well_formed_api_key`, rojo) → `API_KEY_PREFIX`, `generate_api_key`, `hash_api_key`,
   `is_well_formed_api_key` en `core/security.py`.
3. **C · Puerto + adaptador + servicio.** `test_agent_api_key_service.py` (create/resolve/list/
   revoke, revocación aislada, dueño inactivo, `last_used_at`; BD real, rojo) → `AgentKeyPort`,
   `AgentKeyRepository`, `AgentKeyService`, `AgentKeyNotFound`.
4. **D · Dependencia del principal.** `test_agent_api_key_deps.py` (cookie sin regresión; Bearer
   válido/revocado/mal formado; admin cookie-only; rojo) → `_principal_from_cookie`,
   `get_current_principal`, repunte de `require_password_changed`.
5. **E · Router de gestión.** `test_agent_api_key_api.py` (POST plano una vez, GET sin secreto,
   DELETE revoca, gestión sólo cookie; rojo) → `schemas` + `routers/agent_keys.py` + alta en
   `main.py`.
6. **F · Acceso de datos con key.** `test_agent_api_key_access.py` + `test_agent_api_key_errors.py`
   (misma bóveda/base que la cookie, aislamiento RF-006, revocada→401 inmediata RNF-001, 503
   RF-008, best-effort RF-009; rojo) → repunte de `vaults.py` y `sync.py` a `get_current_principal`.
7. **G · Contrato + docs.** `contracts/openapi.yaml`; `docs/API.md`; READMEs (§8).
8. **H · Sistema / no regresión.** Suite backend completa en verde (nota operativa: la suite
   completa tarda ~13 min y **no** se cuelga, `state.md` backlog 10; usar `timeout` desde el inicio,
   nunca `pkill`). Notas de re-anclaje de cierre (§8).

## 7. Decisiones para el GATE 2 y seguimiento de complejidad
| Decisión | Justificación | Alternativa descartada | Recomendación |
|---|---|---|---|
| **P-1 · `agent_api_keys` en el control plane Postgres** (migración 005, junto a `users`/`refresh_tokens`) | Es una credencial de identidad del mismo plano que `refresh_tokens`; la autenticación **no puede** vivir en la base CouchDB `synapse_user_{id}`, porque esa base la **elige** la propia autenticación (dependencia circular). El control plane ya resuelve identidad. | Guardar la key en el CouchDB del usuario | Aceptar. |
| **P-2 · Formato `syn_ak_` + `secrets.token_urlsafe(32)`** (prefijo visible fijo + ~256 bits) | El prefijo hace reconocible el **tipo** de credencial en logs/filtraciones sin exponer el secreto y permite rechazar lo mal formado (RF-003) **antes** de tocar la BD. 256 bits de entropía (del mismo orden que `token_urlsafe(64)` de los refresh). | UUID como key (122 bits, menos margen); sin prefijo (no reconocible, no rechazo barato) | Aceptar. |
| **P-3 · Hash SHA-256 (reusa el primitivo de `hash_refresh_token`), no argon2** | Una key de 256 bits aleatorios **no** es fuerza-bruteable: argon2 (KDF lento con sal por fila) está pensado para contraseñas de baja entropía y **además impide el lookup por índice** (sal distinta por hash → un `SELECT … WHERE key_hash=?` sería imposible, habría que recorrer y verificar fila a fila). SHA-256 determinista permite el lookup O(1) indexado, **exactamente** como los refresh tokens hoy. No es un segundo estándar: ES el estándar existente para secretos de alta entropía. | argon2 (lento, sin beneficio de seguridad real aquí, y escaneo de tabla por petición) | Aceptar; compartir el primitivo SHA-256 con `hash_refresh_token` (factorizar si procede). |
| **P-4 · Dos dependencias: `get_current_user` (cookie-only, intacta) + `get_current_principal` (cookie→Bearer), los routers eligen** — **no** extender `get_current_user` para ambas vías | Spec §3 exige que la gestión de keys y la cuenta (`/auth/me`, `/auth/change-password`) sean **sólo cookie**: una key no debe acuñar más keys ni rotar la contraseña del humano. Si `get_current_user` aceptara keys, toda esa superficie quedaría abierta y habría que re-cerrarla con guards cookie-only (frágil, fácil de olvidar). Con dos dependencias la contención de privilegio es **estructural**. La validación JWT **no se duplica**: `get_current_principal` reusa `_principal_from_cookie` (cuerpo de `get_current_user`) para la rama cookie. | Una sola dependencia cookie-primero-header que usen todos (sobre-amplía la superficie sensible) | Aceptar. **Marcador de alcance:** repuntar a `get_current_principal` toca `routers/sync.py`, que **no** está en `covers` de SPEC-0013 (sí `vaults.py` y `dependencies.py`). En Gate 2, añadir `backend/app/routers/sync.py` a `covers` y re-anclar 0005 (advisory). No edito la spec aprobada este turno. |
| **P-5 · El principal resuelto desde una key reutiliza `TokenPayload`** (`sub=owner_id`, `role`, `ver`, `exp` sintético) | Downstream (`get_vault_service` `vaults.py:38`, `get_sync_db` `sync.py:146`) sólo consume `.sub` y `.role`. Reusar `TokenPayload` deja ese código **intacto**; introducir un tipo `Principal` nuevo obligaría a cambiar firmas en 0003/0005 (código cerrado) sin ganancia. `TokenPayload` pasa a ser "el principal resuelto", sea cual sea la credencial. | Tipo `Principal` nuevo + cambiar todo el downstream | Aceptar. |
| **P-6 · Servicio + puerto + adaptador propios** (`AgentKeyService`/`AgentKeyPort`/`AgentKeyRepository`), calcados de auth | Mantiene el hexágono (Art. 1-2) y la testabilidad; la lógica no trivial (formato, hash, revocación, best-effort) no debe vivir en la dependencia. Mismo patrón visual que el resto del repo (AGENTS.md "mismo tipo = mismo patrón"). | Resolver la key con ORM directo dentro de `get_current_principal` (mezcla dominio y transporte) | Aceptar. |
| **P-7 · `last_used_at` best-effort en commit propio (RF-009)** | Un `UPDATE … WHERE id=?` por PK es barato; se hace en un commit aislado envuelto en `try/except` que **traga** el fallo (sólo registra sin exponer el hash) para no tumbar la petición. "Asíncrono" real (BackgroundTask) añade acoplamiento sin beneficio a esta escala. | `BackgroundTask` de FastAPI; o escribir en la misma transacción (un fallo ahí sí tumbaría la petición) | Aceptar. |
| **P-8 · 503 ante Postgres caído sólo en el camino nuevo (RF-008)** | La rama Bearer envuelve la consulta de resolución y traduce `OperationalError` → `StorageUnavailable` (503), como `vaults.py` ante CouchDB. No se toca el camino cookie (que hoy daría 500 ante Postgres caído: residual conocido, fuera de alcance de esta feature). | `try/except` global amplio (ocultaría otros fallos) | Aceptar. |
| **P-9 · Router propio `agent_keys.py` con prefijo `/auth/agent-keys`** (no dentro de `auth.py`) | El prefijo lo fija spec §3. `auth.py` es login/sesión; la gestión de keys es su propia responsabilidad → su propio router, como `vaults.py`/`sync.py`. | Añadir las rutas a `auth.py` (engorda y mezcla responsabilidades) | Aceptar. |
| **P-10 · `label` único por usuario** (`UNIQUE(owner_id, label)`; global no, por dueño sí) — **ajustado en Gate 2** | Carlos usa un label por agente/plataforma (`aira`, `liza`, `main`, `n8n`) para distinguirlas en `GET /auth/agent-keys`; dos keys del mismo dueño con el mismo label serían indistinguibles en el listado. La unicidad es **por dueño**, no global: dos usuarios distintos sí pueden llamar una key "aira" cada uno. | `label` libre repetible (propuesta original del plan; descartada en Gate 2 porque degrada el caso de uso real: distinguir agente/plataforma de un vistazo) | **Aceptado en Gate 2 (2026-10-28).** Rotación con el mismo nombre lógico: revocar la vieja antes de crear la nueva con igual label (o usar un label distinto temporalmente), nunca coexisten dos iguales del mismo dueño. |

### Riesgos
- **R-1 · Repunte de rutas cerradas.** `vaults.py` (covers) y `sync.py` (fuera de covers, P-4)
  cambian su dependencia. Mitigación: la no-regresión (§6 H) corre las suites de 0003/0005/0008/0010
  enteras; nota de re-anclaje en 0005 (`strict`) al inicio para que el gate no cierre por *drift*.
- **R-2 · `must_change_password` del dueño bloquea la key.** Como las rutas de datos pasan por
  `require_password_changed`, una key cuyo dueño aún deba cambiar la contraseña recibe 403. Es
  **comportamiento consistente** (RF-002: idéntico alcance que la sesión del dueño) y el dueño de
  los agentes (`cjhirashi`) ya cambió la suya. No es parche ni ambigüedad de producto; se documenta.
- **R-3 · Enumeración por tiempos.** El rechazo barato por forma (`is_well_formed_api_key`) sale
  antes del hash/BD; una key bien formada pero inexistente sí hace el lookup. El riesgo es bajo
  (401 idéntico en ambos casos, RF-003/RF-007) y no se añade *timing equalization* (complejidad sin
  amenaza real a 256 bits de entropía). Aceptado y anotado.
- **R-4 · `exp` sintético en el `TokenPayload` de una key.** No se valida downstream (sólo `.sub`/
  `.role`), pero se fija a un valor coherente para no confundir a quien lea el objeto. La caducidad
  real de una key es la **revocación**, no `exp`.
- **R-5 · Migración 005 en Postgres real.** Igual que 002/003/004 (backlog 3): ida y vuelta en
  SQLite **y** PostgreSQL 15 antes de cerrar.

## 8. Impacto en documentación (Art. 11)
| Documento | Qué cambia | Acción |
|---|---|---|
| `docs/API.md` | Nueva sección "API keys de agente": alta/listado/revocación bajo `/auth/agent-keys` (sólo cookie) y uso de `Authorization: Bearer` en `/vaults` y `/sync`; el plano se muestra una vez | actualizar |
| `backend/README.md` | Nota breve: segunda vía de auth por `Bearer` que resuelve al mismo `current_user`; tabla `agent_api_keys` en el control plane | actualizar |
| `backend/app/core/README.md`, `routers/README.md`, `services/README.md` | Alta de `agent_key_service`/`agent_key_port`/`agent_keys.py` y de `get_current_principal` | actualizar |
| `SPEC-0013 spec.md` (`covers`) | **Gate 2:** añadir `backend/app/routers/sync.py` y `backend/app/routers/agent_keys.py` + `backend/app/core/ports/agent_key_port.py` + `backend/app/adapters/agent_key_repository.py` a `covers` (hoy sólo están los centrales). No lo edito este turno (spec aprobada en fase 1). | marcar para Gate 2 |
| `0005-sync spec.md` | nota de re-anclaje (advisory): `sync.py` repuntado a `get_current_principal`, sin cambio de RF | actualizar en implementación |
| `.harness/memory/state.md` | estado de 0013 | actualizar en el cierre |
| `ARCHIFY.md` / diagramas | nueva arista "agente → Bearer → API" en el flujo de auth | actualizar si aplica |

## 9. Implementación por requisito
### RF-001 (crear key, plano una vez)
- `core/security.py` (`generate_api_key`/`hash_api_key`), `services/agent_key_service.py` (`create`),
  `routers/agent_keys.py` (`POST`), `schemas.AgentKeyCreate`/`AgentKeyCreated`, modelo + migración 005.
- Tests: `test_agent_api_key_service.py` (plano devuelto una vez, hash persistido), `test_agent_api_key_api.py` (201).

### RF-002 (Bearer resuelve al mismo `current_user`, mismo alcance)
- `get_current_principal` (`dependencies.py`), repunte de `vaults.py`/`sync.py`; base por `sub` sin cambios.
- Tests: `test_agent_api_key_access.py` (misma bóveda/base que la cookie del dueño, REST y `/sync`).

### RF-003 (key inválida/mal formada/revocada → 401)
- `is_well_formed_api_key` + `resolve` → `None` → `NotAuthenticated` en la dependencia.
- Tests: `test_agent_api_key_deps.py`, `test_agent_api_key_errors.py`.

### RF-004 (listar sin exponer plano ni hash)
- `services.list`, `routers.GET`, `schemas.AgentKeyOut` (sin `key`/`key_hash`).
- Tests: `test_agent_api_key_api.py` (el cuerpo no trae `key` ni `key_hash`).

### RF-005 (revocar propia; no afecta a las demás)
- `services.revoke` (scoped a `owner_id`; `AgentKeyNotFound` si ajena), `routers.DELETE`.
- Tests: `test_agent_api_key_service.py` (revocar una deja vivas las otras), `test_agent_api_key_api.py` (204 y luego 401; ajena → 404).

### RF-006 (nunca resuelve a otro `owner_id` — P2/P3)
- `resolve` carga el dueño por `owner_id` de la propia fila; base = `synapse_user_{owner_id}`.
- Tests: `test_agent_api_key_access.py` §5.2 (aislamiento entre A y B en REST y `/sync`).

### RF-007 (revocada → 401 no 403)
- `get_active_by_hash` filtra `revoked_at IS NULL`; una revocada no se encuentra → 401 idéntico.
- Tests: `test_agent_api_key_errors.py`.

### RF-008 (control plane caído → 503)
- Rama Bearer envuelve la consulta → `StorageUnavailable` (P-8).
- Tests: `test_agent_api_key_errors.py` (simula `OperationalError`).

### RF-009 (`last_used_at` best-effort)
- `resolve` hace `touch_last_used` en commit propio con `try/except` (P-7).
- Tests: `test_agent_api_key_errors.py` (si la escritura de `last_used_at` falla, la petición sigue 200).

### RNF-001 (revocar surte efecto en la siguiente petición)
- Sin caché de validez: cada petición hace el lookup (`get_active_by_hash`).
- Tests: `test_agent_api_key_access.py` (revocar y, acto seguido, la misma key → 401).

### RF-010 (label único por dueño entre keys vigentes — Gate 2)
- `services.create` revalida contra `list_by_owner` activo antes de insertar (mensaje de dominio
  claro) y el índice parcial `uq_agent_api_keys_owner_label_active` (§3) es el cinturón de
  seguridad ante condición de carrera; ambos traducen a `AgentKeyLabelTaken` (409).
- Tests: `test_agent_api_key_service.py` (crear con label repetido vigente → `AgentKeyLabelTaken`;
  revocar y repetir el mismo label → éxito), `test_agent_api_key_api.py` (`POST` duplicado → 409
  Problem Details, cuerpo sin el plano de la key existente).

### RNF-002 (hash nunca en logs ni en errores)
- `AgentKeyOut` sin `key_hash`; errores de dominio sin interpolar el secreto; lookup por hash exacto (sin comparación en memoria).
- Tests: `test_agent_api_key_api.py` (cuerpos sin hash), revisión de que ningún `detail` lleva la key.

## Marcadores abiertos
(ninguno — `[NEEDS CLARIFICATION] = 0`. **GATE 2 aprobado por Carlos Jiménez (cjhirashi) el
2026-10-28 por Telegram:** P-1…P-9 tal cual; P-10 resuelto a label único por dueño entre keys
vigentes (RF-010, añadido a SPEC-0013); `covers` de SPEC-0013 ampliado con `sync.py`,
`agent_keys.py`, `agent_key_port.py`, `agent_key_repository.py`, `agent_key_service.py` (§8).
Pasa a Fase 3/4 (Driver/Navigator, §6 de este plan, bloques A→H).)
