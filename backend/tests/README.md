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
- **Excepción declarada:** el control plane usa SQLite (`test.db`) en lugar de PostgreSQL
  (plan.md §7 de SPEC-0002); pasar a PostgreSQL real queda para una feature aparte.
