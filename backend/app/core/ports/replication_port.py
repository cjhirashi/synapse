from abc import ABC, abstractmethod
from collections.abc import AsyncIterator


class ReplicationPort(ABC):
    """Protocolo de replicación de CouchDB sobre una base de usuario (PLAN-0005 §2.2).

    Async a propósito: `_changes` en `longpoll` espera hasta 60 s y no debe ocupar un hilo
    del pool. Toda operación recibe la base (`synapse_user_{sub}`): el puerto nunca cruza
    bases ni decide qué se replica (eso es `services/sync_filter.py`); recibe parámetros y
    cuerpos ya filtrados y devuelve las respuestas de CouchDB tal cual.
    Errores: `StorageUnavailable` si el almacén no responde o responde algo inesperado.
    """

    @abstractmethod
    async def db_info(self, db: str) -> dict:
        """`GET /{db}` sin sanear."""

    @abstractmethod
    async def changes(self, db: str, query: dict[str, str], body: dict) -> AsyncIterator[bytes]:
        """Abre `POST /{db}/_changes` y devuelve su cuerpo como flujo de bytes.

        Un fallo al abrir se lanza aquí (antes de responder nada al cliente); un fallo a
        mitad del flujo se lanza al iterar. El flujo libera la conexión al terminar.
        """

    @abstractmethod
    async def revs_diff(self, db: str, body: dict[str, list[str]]) -> dict:
        """`POST /{db}/_revs_diff`."""

    @abstractmethod
    async def bulk_get(self, db: str, query: dict[str, str], body: dict) -> dict:
        """`POST /{db}/_bulk_get`."""

    @abstractmethod
    async def all_docs(self, db: str, query: dict[str, str], body: dict | None) -> dict:
        """`GET /{db}/_all_docs` (o `POST` con `keys` si hay cuerpo)."""

    @abstractmethod
    async def bulk_docs_replicated(self, db: str, docs: list[dict]) -> list[dict]:
        """`POST /{db}/_bulk_docs` con `new_edits: false`: guarda las revisiones tal cual.

        Así se escriben ramas en conflicto sin 409. Devuelve la lista de CouchDB (vacía si
        todo fue bien); un error por documento no se esconde: lo interpreta el llamador.
        """

    @abstractmethod
    async def get_local(self, db: str, local_id: str) -> dict | None:
        """`GET /{db}/_local/{local_id}`, o `None` si no existe."""

    @abstractmethod
    async def put_local(self, db: str, local_id: str, doc: dict) -> dict:
        """`PUT /{db}/_local/{local_id}`; devuelve `{"ok", "id", "rev"}` de CouchDB.

        CouchDB (3.x) no valida el `_rev` de un `_local`: gana la última escritura. El
        puerto no inventa conflictos que el servidor real no da (verificado contra 3.5.2).
        """
