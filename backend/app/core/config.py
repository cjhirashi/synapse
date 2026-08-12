from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    DATABASE_URL: str = "postgresql://synapse:synapse@postgres:5432/synapse_control"
    COUCHDB_URL: str = "http://couchdb:5984"
    COUCHDB_USER: str = "admin"
    COUCHDB_PASSWORD: str = "password"
    JWT_SECRET: str = "changeme"

    model_config = {"env_file": ".env", "extra": "ignore"}


settings = Settings()
