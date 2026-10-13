from abc import ABC, abstractmethod


class VaultPort(ABC):
    """Documentos de una base CouchDB de usuario, con control por `_rev` (PLAN-0003 §2).

    Toda operación recibe la base (`synapse_user_{sub}`): el puerto nunca cruza bases.
    Errores: `RevisionConflict` cuando el almacén rechaza una escritura por `_rev`;
    `StorageUnavailable` cuando el almacén no responde o responde algo inesperado.
    """

    @abstractmethod
    def get(self, db: str, doc_id: str) -> dict | None:
        """El documento con su `_rev`, o `None` si no existe."""

    @abstractmethod
    def leaves(self, db: str, doc_id: str) -> list[dict]:
        """Todas las hojas vivas del documento, cada una con su `_revisions` (SPEC-0005 RF-008).

        Sin conflicto hay una; con ramas en conflicto (escritas por la sincronización) hay
        varias, y `get` sólo devolvería la ganadora. Las lápidas no cuentan. Documento
        inexistente o borrado → lista vacía. Orden no especificado.
        """

    @abstractmethod
    def put(self, db: str, doc: dict) -> str:
        """Crea (sin `_rev`) o reemplaza (con el `_rev` vigente) `doc`; devuelve el `_rev` nuevo.

        Lanza `RevisionConflict` si el `_rev` no es el vigente o si se crea un `_id` que ya existe.
        """

    @abstractmethod
    def delete(self, db: str, doc_id: str, rev: str) -> None:
        """Borra el documento en la revisión `rev`; si cambió o ya no existe, `RevisionConflict`."""

    @abstractmethod
    def list_page(
        self, db: str, deleted: bool, limit: int, after: tuple[str, str] | None
    ) -> list[dict]:
        """Hasta `limit` bóvedas (`type: "vault"`) borradas o no, según `deleted`.

        Orden: `created_at` descendente y, a igual fecha, `_id` descendente. `after` es la
        clave `(created_at, _id)` de la última bóveda ya vista: la página empieza justo
        después de ella, aunque esa bóveda haya cambiado o desaparecido entre páginas.
        """
