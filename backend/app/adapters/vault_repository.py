import json
from urllib.parse import quote

import httpx

from app.core.config import settings
from app.core.errors import RevisionConflict, StorageUnavailable
from app.core.ports.vault_port import VaultPort

# Índice de bóvedas (PLAN-0003 §3): clave `[borrada?1:0, created_at]`; CouchDB desempata
# por `_id`, lo que da el orden de RF-024 y una paginación por clave exacta.
DESIGN_DOC = {
    "views": {
        "by_created": {
            "map": (
                'function (doc) { if (doc.type === "vault") '
                "{ emit([doc.deleted_at ? 1 : 0, doc.created_at], null); } }"
            )
        }
    }
}

# Índice de notas (historia 0014, H-004.1): clave `[vault_id, borrada?1:0, created_at]`, el
# mismo esquema que `DESIGN_DOC` con `vault_id` como primer componente — nunca mezcla las
# notas de dos bóvedas de la misma base.
DESIGN_DOC_NOTES = {
    "views": {
        "by_created": {
            "map": (
                'function (doc) { if (doc.type === "note") '
                "{ emit([doc.vault_id, doc.deleted_at ? 1 : 0, doc.created_at], null); } }"
            )
        }
    }
}


def _json_param(value) -> str:
    return json.dumps(value, separators=(",", ":"))


class VaultRepository(VaultPort):
    """`VaultPort` sobre la API HTTP de CouchDB.

    `transport` sólo existe para inyectar respuestas en tests (p. ej. 5xx simulados).
    """

    def __init__(
        self,
        url: str | None = None,
        user: str | None = None,
        password: str | None = None,
        transport: httpx.BaseTransport | None = None,
    ):
        self._client = httpx.Client(
            base_url=url or settings.COUCHDB_URL,
            auth=(user or settings.COUCHDB_USER, password or settings.COUCHDB_PASSWORD),
            timeout=10,
            transport=transport,
        )
        # Bases cuyo `_design/vaults` (o `_design/notes`) ya se aseguró en este proceso.
        self._indexed: set[str] = set()
        self._notes_indexed: set[str] = set()

    def _request(self, method: str, path: str, expected: tuple[int, ...], **kwargs) -> httpx.Response:
        """Hace la petición; red caída o un estado fuera de `expected` → `StorageUnavailable`.

        `expected` incluye los estados que el llamador interpreta (404, 409): el resto
        (5xx, 401…) significa que el almacén no está disponible para esta operación.
        """
        try:
            response = self._client.request(method, path, **kwargs)
        except httpx.HTTPError as exc:
            raise StorageUnavailable(f"CouchDB inaccesible: {exc}") from exc
        if response.status_code not in expected:
            raise StorageUnavailable(f"CouchDB respondió {response.status_code} a {method} {path}")
        return response

    @staticmethod
    def _doc_path(db: str, doc_id: str) -> str:
        # Los `_id` llevan ':' ("vault:{uuid}"): se codifican enteros como un segmento.
        return f"/{db}/{quote(doc_id, safe='')}"

    # --- Documentos (T-014) ---

    def get(self, db: str, doc_id: str) -> dict | None:
        response = self._request("GET", self._doc_path(db, doc_id), (200, 404))
        return response.json() if response.status_code == 200 else None

    def leaves(self, db: str, doc_id: str) -> list[dict]:
        # `open_revs=all` con `Accept: application/json` da `[{"ok": doc}, ...]`, una por hoja
        # (vivas y lápidas); sin documento, 404.
        response = self._request(
            "GET", self._doc_path(db, doc_id), (200, 404),
            params={"open_revs": "all", "revs": "true"}, headers={"Accept": "application/json"},
        )
        if response.status_code == 404:
            return []
        return [
            entry["ok"] for entry in response.json()
            if "ok" in entry and not entry["ok"].get("_deleted")
        ]

    def put(self, db: str, doc: dict) -> str:
        response = self._request("PUT", self._doc_path(db, doc["_id"]), (201, 202, 409), json=doc)
        if response.status_code == 409:
            raise RevisionConflict(doc["_id"])
        return response.json()["rev"]

    def delete(self, db: str, doc_id: str, rev: str) -> None:
        # 404 = ya no existe: para quien tenía `rev` es lo mismo que un cambio intermedio.
        response = self._request(
            "DELETE", self._doc_path(db, doc_id), (200, 202, 404, 409), params={"rev": rev}
        )
        if response.status_code in (404, 409):
            raise RevisionConflict(doc_id)

    # --- Listado (T-015) ---

    def _ensure_index(self, db: str) -> None:
        """`PUT _design/vaults` la primera vez que se lista cada base; 409 = ya existía."""
        if db in self._indexed:
            return
        self._request("PUT", f"/{db}/_design/vaults", (201, 202, 409), json=DESIGN_DOC)
        self._indexed.add(db)

    def list_page(
        self, db: str, deleted: bool, limit: int, after: tuple[str, str] | None
    ) -> list[dict]:
        self._ensure_index(db)
        d = 1 if deleted else 0
        params = {"descending": "true", "include_docs": "true", "endkey": _json_param([d])}
        if after is None:
            params |= {"startkey": _json_param([d, {}]), "limit": limit}
        else:
            # Se empieza en la clave exacta de `after` y se descarta esa fila sólo si sigue
            # ahí: si la bóveda salió de la lista (papelera, restaurada, borrada), la primera
            # fila ya es la siguiente y un `skip=1` fijo se la saltaría.
            created_at, after_id = after
            params |= {
                "startkey": _json_param([d, created_at]),
                "startkey_docid": after_id,
                "limit": limit + 1,
            }
        response = self._request("GET", f"/{db}/_design/vaults/_view/by_created", (200,), params=params)
        rows = response.json()["rows"]
        if after is not None:
            if rows and rows[0]["id"] == after_id:
                rows = rows[1:]
            rows = rows[:limit]
        return [row["doc"] for row in rows]

    # --- Listado de notas (historia 0014, H-004.1) ---

    def _ensure_notes_index(self, db: str) -> None:
        """`PUT _design/notes` la primera vez que se lista cada base; 409 = ya existía."""
        if db in self._notes_indexed:
            return
        self._request("PUT", f"/{db}/_design/notes", (201, 202, 409), json=DESIGN_DOC_NOTES)
        self._notes_indexed.add(db)

    def list_notes(
        self, db: str, vault_id: str, deleted: bool, limit: int, after: tuple[str, str] | None
    ) -> list[dict]:
        self._ensure_notes_index(db)
        d = 1 if deleted else 0
        params = {
            "descending": "true", "include_docs": "true",
            "endkey": _json_param([vault_id, d]),
        }
        if after is None:
            params |= {"startkey": _json_param([vault_id, d, {}]), "limit": limit}
        else:
            created_at, after_id = after
            params |= {
                "startkey": _json_param([vault_id, d, created_at]),
                "startkey_docid": after_id,
                "limit": limit + 1,
            }
        response = self._request("GET", f"/{db}/_design/notes/_view/by_created", (200,), params=params)
        rows = response.json()["rows"]
        if after is not None:
            if rows and rows[0]["id"] == after_id:
                rows = rows[1:]
            rows = rows[:limit]
        return [row["doc"] for row in rows]
