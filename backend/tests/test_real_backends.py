"""RNF-002 / P5: la suite debe ejercitar un CouchDB real, no un doble.

Excepción declarada (plan.md §7): el control plane usa SQLite en los tests en lugar de
PostgreSQL; la migración a PostgreSQL real queda para una feature aparte.
"""
import httpx

from app.core.config import settings


def test_rnf_002_couchdb_under_test_is_a_real_server():
    res = httpx.get(settings.COUCHDB_URL, timeout=5)
    assert res.status_code == 200
    assert res.json().get("couchdb") == "Welcome"


def test_rnf_002_couchdb_credentials_are_valid():
    res = httpx.get(
        f"{settings.COUCHDB_URL}/_all_dbs",
        auth=(settings.COUCHDB_USER, settings.COUCHDB_PASSWORD),
        timeout=5,
    )
    assert res.status_code == 200
