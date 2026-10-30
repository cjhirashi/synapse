"""Puerto de almacenamiento de objetos (H-015): contrato del puerto y el adaptador MinIO.

El adaptador real se verifica contra MinIO de verdad (lo hace AIRA, fuera de los tests); aquí
sólo se comprueba que: el puerto es abstracto, el FAKE cumple el roundtrip, y el adaptador
MinIO es una implementación del puerto que NO importa `minio` al cargar el módulo (así los
tests de servicio/router no necesitan el paquete)."""
import sys

import pytest

from app.adapters.minio_adapter import MinioObjectStorage
from app.core.ports.object_storage_port import ObjectStoragePort
from tests.fake_object_storage import FakeObjectStorage


def test_port_is_abstract():
    with pytest.raises(TypeError):
        ObjectStoragePort()  # no se puede instanciar un puerto abstracto


def test_fake_roundtrips():
    storage = FakeObjectStorage()
    storage.put_object("vaults/v/f", b"hola", "text/plain")
    assert storage.get_object("vaults/v/f") == b"hola"


def test_minio_adapter_implements_the_port():
    assert issubclass(MinioObjectStorage, ObjectStoragePort)


def test_importing_the_adapter_does_not_import_minio():
    # El import de `minio` vive dentro de los métodos/constructor (aislado): importar el módulo
    # del adaptador no debe arrastrar el paquete `minio`.
    assert "app.adapters.minio_adapter" in sys.modules
    # Si `minio` ya estaba cargado por otra vía no podemos afirmar nada; sólo exigimos que el
    # módulo del adaptador no lo haya cargado él mismo al importarse (se comprueba por código,
    # no por estado global): su cuerpo no tiene `import minio` a nivel de módulo.
    import app.adapters.minio_adapter as adapter

    source = adapter.__file__
    with open(source, encoding="utf-8") as handle:
        top_level = [
            line for line in handle
            if line.startswith("import minio") or line.startswith("from minio")
        ]
    assert top_level == []
