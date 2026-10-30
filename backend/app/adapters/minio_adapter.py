"""`ObjectStoragePort` sobre MinIO (H-015).

`minio` se importa DENTRO del constructor y de los métodos, nunca a nivel de módulo: así los
tests de servicio y de router usan un FAKE del puerto sin necesitar MinIO real ni el paquete
instalado en el host. Todo fallo del cliente (red caída, error S3) se eleva como
`StorageUnavailable` (503), igual que `VaultRepository` ante CouchDB. MinIO nunca se expone
directo: el acceso real lo controla siempre el backend.
"""
from io import BytesIO

from app.core.config import settings
from app.core.errors import StorageUnavailable
from app.core.ports.object_storage_port import ObjectStoragePort


class MinioObjectStorage(ObjectStoragePort):
    def __init__(
        self,
        endpoint: str | None = None,
        access_key: str | None = None,
        secret_key: str | None = None,
        bucket: str | None = None,
    ) -> None:
        # Import aislado (ver docstring del módulo): sólo se paga al construir el adaptador real.
        from minio import Minio

        self._bucket = bucket or settings.MINIO_BUCKET
        self._client = Minio(
            endpoint or settings.MINIO_ENDPOINT,
            access_key=access_key or settings.MINIO_ROOT_USER,
            secret_key=secret_key or settings.MINIO_ROOT_PASSWORD,
            # Endpoint interno (`synapse-minio:9000`): el backend habla HTTP dentro de la red;
            # MinIO nunca se expone directo a Internet.
            secure=False,
        )

    def put_object(self, key: str, data: bytes, content_type: str) -> None:
        try:
            self._client.put_object(
                self._bucket, key, BytesIO(data), length=len(data), content_type=content_type
            )
        except Exception as exc:  # noqa: BLE001 — cualquier fallo del cliente MinIO es 503
            raise StorageUnavailable(f"MinIO put_object falló: {exc}") from exc

    def get_object(self, key: str) -> bytes:
        response = None
        try:
            response = self._client.get_object(self._bucket, key)
            return response.read()
        except Exception as exc:  # noqa: BLE001
            raise StorageUnavailable(f"MinIO get_object falló: {exc}") from exc
        finally:
            if response is not None:
                response.close()
                response.release_conn()
