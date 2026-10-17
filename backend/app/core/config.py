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

    model_config = {"env_file": ".env", "extra": "ignore"}


settings = Settings()
