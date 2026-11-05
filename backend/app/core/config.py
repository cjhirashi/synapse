from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    """Toda la configuración viene del entorno; nada tiene valor por defecto (P4)."""

    DATABASE_URL: str
    COUCHDB_URL: str
    COUCHDB_USER: str
    COUCHDB_PASSWORD: str
    JWT_SECRET: str
    ADMIN_EMAIL: str
    ADMIN_PASSWORD: str

    # Almacén de objetos MinIO (H-015). Las credenciales salen del `.env` (sin default, P4);
    # el endpoint y el bucket, ya acordados con la infraestructura, traen default.
    MINIO_ENDPOINT: str = "synapse-minio:9000"
    MINIO_ROOT_USER: str
    MINIO_ROOT_PASSWORD: str
    MINIO_BUCKET: str = "synapse-files"

    # H-030 E6: `shadow` (por defecto) solo registra lo que el registro de `AG - AGENTES` decidiría; `enforce`
    # rechaza con 403; `off` ni evalúa. El corte (E9) es pasar a `enforce`.
    AGENT_ACCESS_MODE: str = "shadow"
    # H-030 E3: las bóvedas nuevas nacen con las carpetas reservadas (INDICES de `AG - *`, BITACORA y
    # PLANTILLAS). Interruptor para desactivarlo sin tocar código; la suite de pruebas lo apaga por defecto.
    SEED_AG_FOLDERS: bool = True

    # H-030b: genera los documentos diarios de BITACORA a partir del registro de cambios. El registro (`change_log`)
    # se escribe siempre; esto solo apaga los documentos (la suite de pruebas los apaga por defecto, como el sembrado).
    BITACORA_DOCS: bool = True
    # H-030b: zona horaria de respaldo del propietario (hora de la bitácora y corte de día). Cada usuario tiene la suya
    # en `users.timezone`; esta solo se usa si la suya falta o es inválida.
    DEFAULT_TIMEZONE: str = "America/Mexico_City"

    model_config = {"env_file": ".env", "extra": "ignore"}


settings = Settings()
