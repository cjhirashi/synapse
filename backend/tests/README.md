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

- **Notas (SPEC-0008):** `test_note_rules.py` (reglas puras sobre la batería compartida
  `fixtures/note_rules_cases.json`, que el cliente también recorre), `test_note_contract.py`
  (`note.schema.json` frente a `core/note_rules.py`), `test_reservations.py` y
  `test_note_service.py` (reservas de ruta), `test_note_sync_push.py` (push de notas: cada
  código de rechazo, bóveda antes que nota, liberar al renombrar o borrar),
  `test_note_sync_filter.py`, `test_note_sync_api.py` (ninguna ruta devuelve `note-path:*`) y
  `test_note_sync_isolation.py` (aislamiento entre usuarios).
