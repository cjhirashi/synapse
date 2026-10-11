import httpx

from app.core.config import settings
from app.core.errors import ProvisioningError
from app.core.ports.couchdb_port import CouchDBPort


class CouchDBAdapter(CouchDBPort):
    def __init__(self, url: str | None = None, user: str | None = None, password: str | None = None):
        self.url = url or settings.COUCHDB_URL
        self.auth = (user or settings.COUCHDB_USER, password or settings.COUCHDB_PASSWORD)

    def ensure_user_db(self, name: str) -> None:
        try:
            response = httpx.put(f"{self.url}/{name}", auth=self.auth, timeout=10)
        except httpx.HTTPError as exc:
            raise ProvisioningError(f"CouchDB inaccesible: {exc}") from exc
        # 201/202 = creada; 412 = ya existía (idempotente)
        if response.status_code not in (201, 202, 412):
            raise ProvisioningError(f"CouchDB respondió {response.status_code} al crear {name}")
