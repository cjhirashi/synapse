from abc import ABC, abstractmethod


class ObjectStoragePort(ABC):
    """Almacén de objetos por clave (H-015). La clave es `vaults/<vault_id>/<file_id>` en un
    único bucket; el aislamiento lógico lo da el prefijo, el acceso real lo controla siempre el
    backend (MinIO nunca se expone directo). Un fallo del almacén se eleva como
    `StorageUnavailable` (503), como hace `VaultPort` ante CouchDB."""

    @abstractmethod
    def put_object(self, key: str, data: bytes, content_type: str) -> None:
        """Guarda `data` bajo `key` con su `content_type`; reemplaza si la clave ya existía."""

    @abstractmethod
    def get_object(self, key: str) -> bytes:
        """Los bytes guardados bajo `key`. `StorageUnavailable` si el almacén no responde."""
