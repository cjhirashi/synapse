from sqlalchemy import Column, DateTime, ForeignKey, Integer, String, text

from app.adapters.database import Base


class File(Base):
    """Metadatos de un archivo subido a MinIO (H-015).

    Los bytes viven en MinIO bajo `object_key` (`vaults/<vault_id>/<file_id>`, un solo bucket);
    aquí sólo los metadatos y el control de acceso. `vault_id` es el id de una bóveda de
    CouchDB (no hay FK: las bóvedas no viven en Postgres); el servicio valida en cada subida
    que la bóveda sea del usuario. `visibility` es `private` (por defecto) o `public`: privado
    exige ser el dueño; público abre sin sesión con la misma URL (C-3).
    """

    __tablename__ = "files"

    id = Column(String, primary_key=True)
    owner_id = Column(String, ForeignKey("users.id"), nullable=False, index=True)
    vault_id = Column(String, nullable=False, index=True)
    name = Column(String, nullable=False)
    content_type = Column(String, nullable=False)
    size = Column(Integer, nullable=False)
    visibility = Column(String, nullable=False, server_default=text("'private'"), default="private")
    object_key = Column(String, nullable=False)
    created_at = Column(DateTime, nullable=False)
