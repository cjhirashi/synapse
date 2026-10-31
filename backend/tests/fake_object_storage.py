"""FAKE en memoria del `ObjectStoragePort` (H-015/H-016).

Lo usan los tests de servicio y de router para no necesitar MinIO real ni el paquete `minio`
instalado: guarda los objetos en un dict por clave. `missing` simula un objeto ausente."""
from app.core.errors import StorageUnavailable
from app.core.ports.object_storage_port import ObjectStoragePort


class FakeObjectStorage(ObjectStoragePort):
    def __init__(self) -> None:
        self.objects: dict[str, tuple[bytes, str]] = {}

    def put_object(self, key: str, data: bytes, content_type: str) -> None:
        self.objects[key] = (data, content_type)

    def get_object(self, key: str) -> bytes:
        if key not in self.objects:
            raise StorageUnavailable(f"objeto ausente: {key}")
        return self.objects[key][0]

    def delete_object(self, key: str) -> None:
        if key not in self.objects:
            raise StorageUnavailable(f"objeto ausente: {key}")
        del self.objects[key]
