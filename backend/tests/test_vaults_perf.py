"""Rendimiento del listado de bóvedas contra CouchDB real (SPEC-0003 RNF-001, T-034).

Marcado `perf`: no corre por defecto; se ejecuta con `pytest -m perf`.
"""
import statistics
import time

import pytest

from app.adapters.vault_repository import VaultRepository
from app.core.models.user import User
from app.core.schemas import VaultCreate
from app.services.vault_service import VaultService
from tests.conftest import SEED_EMAIL

pytestmark = pytest.mark.perf

VAULTS = 1_000
SAMPLES = 50
P95_BUDGET_MS = 300


def _seed(db) -> None:
    """Crea las bóvedas con el servicio y el adaptador reales: documentos y reservas
    idénticos a los de producción, sin el coste de 1 000 peticiones HTTP."""
    user = db.query(User).filter(User.email == SEED_EMAIL).one()
    service = VaultService(VaultRepository(), user.couchdb_name)
    for n in range(VAULTS):
        service.create(VaultCreate(name=f"Bóveda {n:04d}"), user.id)


def test_rnf_001_first_page_p95_under_300_ms_with_1000_vaults(ready_admin, db):
    _seed(db)
    # La primera lectura crea `_design/vaults` y CouchDB construye la vista: es un coste
    # único por base, no el de una lectura normal, así que no entra en la muestra.
    warm_up = ready_admin.get("/vaults", params={"limit": 50})
    assert warm_up.status_code == 200 and len(warm_up.json()["items"]) == 50

    samples_ms = []
    for _ in range(SAMPLES):
        start = time.perf_counter()
        response = ready_admin.get("/vaults", params={"limit": 50})
        samples_ms.append((time.perf_counter() - start) * 1000)
        assert response.status_code == 200 and len(response.json()["items"]) == 50

    p95 = statistics.quantiles(samples_ms, n=20)[18]  # percentil 95
    print(f"\nRNF-001: p95 = {p95:.1f} ms · mediana = {statistics.median(samples_ms):.1f} ms")
    assert p95 < P95_BUDGET_MS
