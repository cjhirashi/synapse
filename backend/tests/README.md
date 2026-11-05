# backend/tests/

Tests del backend. Ejecutar antes de abrir cualquier PR:

```bash
docker compose exec backend pytest -v
docker compose exec backend pytest --cov=app   # umbral 80 % (RNF-001)
```

- **CouchDB real (P5):** la suite se detiene si no alcanza el CouchDB de `COUCHDB_URL`
  (por defecto `http://localhost:15984`, `admin`/`testpass`). Para un CouchDB desechable:
  `docker run -d --name synapse-test-couchdb -p 127.0.0.1:15984:5984 -e COUCHDB_USER=admin -e COUCHDB_PASSWORD=testpass couchdb:3`.
  Tras cada test se borran las bases `synapse_user_*` (sólo si el CouchDB es local).
- **`icon` de bóveda (SPEC-0009):** los casos de `icon` (válidos e inválidos, también `null`, salto de
  línea final y Unicode) viven en `fixtures/vault_rules_cases.json`; los recorren
  `test_sync_rules_mirror.py` (reglas del servidor) y, desde el cliente, `vaultRules.test.ts`.
  `test_vault_schemas.py` fija además los `examples` y el patrón de
  `contracts/vault-icon.schema.json` frente a `VaultIcon`.
- **No compartas el CouchDB de pruebas con otra suite:** esa limpieza borra las bases de usuario de
  quien lo use a la vez (p. ej. `npm run test:visual`, que acepta otro con `COUCHDB_URL`).
- **Excepción declarada:** el control plane usa SQLite (`test.db`) en lugar de PostgreSQL
  (plan.md §7 de SPEC-0002); pasar a PostgreSQL real queda para una feature aparte.

- **Wikilinks y carpetas (H-039):** `test_wikilink_rewrite.py` (regla pura sobre `fixtures/wikilink_rewrite_cases.json`, que el
  cliente podrá recorrer también), `test_wikilink_rewrite_service.py` (doble en memoria: reintento por `_rev`, `pending`),
  `test_folder_service.py` (doble en memoria), `test_note_rewrite_api.py` y `test_folder_move_api.py` (API y CouchDB reales).
- **ETag (H-038):** `test_etag.py` (`core/etag.py::etag_matches`: fuerte, débil `W/`, distinto, sin comillas, vacío, `*`).
- **INDICES (H-031):** `test_index_rules.py` y `test_index_body.py` (sobre `fixtures/indice_cuerpo.json`, que el cliente también recorre) y `test_index_protection.py` (REST y sync) y `test_migrate_indices.py` (herramienta `scripts/migrate_indices.py`: en seco por defecto, `--apply` borra la lista de `--ids` a la papelera y crea el INDICE de cada carpeta).
- **H-030b:** `test_h030b_rules.py` (reglas puras: nombres en MAYÚSCULAS, qué se registra, día por zona horaria, texto del día, plantillas,
  skill de cajón) y `test_h030b_api.py` (REST y `/sync` con CouchDB real: registro antes de escribir, 503 sin registro, idempotencia por
  `_rev`, documentos diarios, BITACORA de solo lectura, plantilla inexistente y en uso, skill de cajón). `test_h030b_migrate.py` (herramienta `scripts/h030b_migrate.py`: conversión de plantillas heredadas, en seco, aplicar y revertir). `conftest.py` apaga
  `BITACORA_DOCS` (los documentos diarios); el módulo de H-030b los activa.
- **H-041:** `test_h041_system.py` (documentos de sistema: huella del manifiesto y versión, bloqueo por todas las rutas REST y `/sync` con humano, agentes y los tres modos, publicador: crear, idempotencia, actualizar en sitio conservando el id, revertir, conflicto, papelera, BITACORA con autor `sistema`, `sync_all` y que la purga no los alcanza) y `fixtures/sistema_reglas.json` (rutas de sistema, espejo del manifiesto; el cliente también lo recorre). `conftest.py` apaga `SYSTEM_DOCS_SYNC`. `test_h041_leave.py` (el gestor que sale: listado, resoluciones, 409 mientras posea skills, ficha editada a mano o por `/sync`, invitados, archivadas, reasignar y BITACORA). `test_h041_skills.py` (propietario, invitados y gestores: forma sobre `fixtures/skills_reglas.json`, `decide_skill`, sellado, sombra frente a `enforce`, usuario y `/sync`). `test_h041_names.py` (nombres canónicos: reglas sobre `fixtures/nombres_reglas.json` y REST, sync y mover carpeta de punta a punta).
- **Notas (SPEC-0008):** `test_note_rules.py` (reglas puras sobre la batería compartida
  `fixtures/note_rules_cases.json`, que el cliente también recorre), `test_note_contract.py`
  (`note.schema.json` frente a `core/note_rules.py`; SPEC-0010 añade a `note_rules_cases.json` los casos de `path` `X/.md`, `X/.MD`, `.md`, `X/ .md` (inválidos) y `X/a.md`, `.md/a.md` (válidos) y el patrón del esquema), `test_reservations.py` y
  `test_note_service.py` (reservas de ruta), `test_note_sync_push.py` (push de notas: cada
  código de rechazo, bóveda antes que nota, liberar al renombrar o borrar),
  `test_note_sync_filter.py`, `test_note_sync_api.py` (ninguna ruta devuelve `note-path:*`) y
  `test_note_sync_isolation.py` (aislamiento entre usuarios).
