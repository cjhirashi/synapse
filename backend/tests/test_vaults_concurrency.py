"""Peticiones simultáneas con el mismo nombre contra CouchDB real (SPEC-0003 RF-021).

Dos clientes del mismo usuario lanzan la petición a la vez desde dos hilos (una barrera
las suelta juntas): sea cual sea el entrelazado, sólo una puede quedarse el nombre.
"""
import threading

from fastapi.testclient import TestClient

from app.main import app
from tests.conftest import login
from tests.test_vaults_api import create, stored_vaults, user_db


def _twin(client) -> TestClient:
    twin = TestClient(app, base_url=str(client.base_url))
    assert login(twin).status_code == 200
    return twin


def _simultaneously(*calls):
    barrier = threading.Barrier(len(calls))
    results = [None] * len(calls)

    def run(i, call):
        barrier.wait()
        results[i] = call()

    threads = [threading.Thread(target=run, args=(i, c)) for i, c in enumerate(calls)]
    for thread in threads:
        thread.start()
    for thread in threads:
        thread.join()
    return results


def test_rf_021_two_simultaneous_creates_with_the_same_name(ready_admin, db):
    twin = _twin(ready_admin)
    results = _simultaneously(lambda: create(ready_admin, name="Notas"),
                              lambda: create(twin, name="NOTAS"))
    assert sorted(r.status_code for r in results) == [201, 409]
    assert len(stored_vaults(user_db(db))) == 1
    twin.close()


def test_rf_021_two_simultaneous_renames_to_the_same_name(ready_admin, db):
    twin = _twin(ready_admin)
    first, second = create(ready_admin, name="Uno"), create(ready_admin, name="Dos")

    def rename(client, created):
        return client.patch(f"/vaults/{created.json()['id']}", json={"name": "Mismo"},
                            headers={"If-Match": created.headers["etag"]})

    results = _simultaneously(lambda: rename(ready_admin, first), lambda: rename(twin, second))
    assert sorted(r.status_code for r in results) == [200, 409]
    names = sorted(v["name"] for v in stored_vaults(user_db(db)))
    assert names in (["Dos", "Mismo"], ["Mismo", "Uno"])
    twin.close()
