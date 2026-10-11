import os

# Entorno de prueba: debe fijarse antes de importar la app (Settings no tiene defaults).
os.environ.setdefault("DATABASE_URL", "sqlite:///./test.db")
os.environ.setdefault("COUCHDB_URL", "http://localhost:15984")
os.environ.setdefault("COUCHDB_USER", "admin")
os.environ.setdefault("COUCHDB_PASSWORD", "testpass")
os.environ.setdefault("JWT_SECRET", "test-secret-not-for-production")
os.environ.setdefault("ADMIN_EMAIL", "cjhirashi@gmail.com")
os.environ.setdefault("ADMIN_PASSWORD", "admin1234")

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from app.adapters.database import Base, SessionLocal, get_db
from app.main import app

TEST_DATABASE_URL = "sqlite:///./test.db"

engine = create_engine(TEST_DATABASE_URL, connect_args={"check_same_thread": False})
TestingSessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)


def override_get_db():
    db = TestingSessionLocal()
    try:
        yield db
    finally:
        db.close()


@pytest.fixture(autouse=True)
def setup_db():
    Base.metadata.create_all(bind=engine)
    db = TestingSessionLocal()
    from app.core.models.role import Role
    if not db.query(Role).first():
        db.add(Role(id="admin-role-id", name="admin"))
        db.add(Role(id="guest-role-id", name="guest"))
        db.commit()
    db.close()
    yield
    Base.metadata.drop_all(bind=engine)


@pytest.fixture
def client():
    app.dependency_overrides[get_db] = override_get_db
    app.state.session_factory = TestingSessionLocal
    with TestClient(app, raise_server_exceptions=True, base_url="https://testserver") as c:
        yield c
    app.dependency_overrides.clear()
    app.state.session_factory = SessionLocal


SEED_EMAIL = "cjhirashi@gmail.com"
SEED_PASSWORD = "admin1234"


def login(client, email=SEED_EMAIL, password=SEED_PASSWORD):
    return client.post("/auth/login", json={"email": email, "password": password})


@pytest.fixture
def admin_user(client):
    """El admin sembrado en el arranque (ADMIN_EMAIL / ADMIN_PASSWORD)."""
    return {"email": SEED_EMAIL, "password": SEED_PASSWORD}


@pytest.fixture
def auth_cookies(client, admin_user):
    login(client)
    return client.cookies


@pytest.fixture
def ready_admin(client, db):
    """Admin autenticado con el cambio de contraseña obligatorio ya resuelto."""
    from app.core.models.user import User

    db.query(User).filter(User.email == SEED_EMAIL).update({"must_change_password": False})
    db.commit()
    assert login(client).status_code == 200
    return client


@pytest.fixture
def db():
    session = TestingSessionLocal()
    try:
        yield session
    finally:
        session.close()


@pytest.fixture(autouse=True)
def clean_test_couchdb():
    """Borra las bases synapse_user_* del CouchDB de pruebas (sólo si es local)."""
    yield
    import httpx
    from app.core.config import settings

    if not any(h in settings.COUCHDB_URL for h in ("localhost", "127.0.0.1")):
        return
    auth = (settings.COUCHDB_USER, settings.COUCHDB_PASSWORD)
    try:
        names = httpx.get(f"{settings.COUCHDB_URL}/_all_dbs", auth=auth, timeout=5).json()
        for name in names:
            if name.startswith("synapse_user_"):
                httpx.delete(f"{settings.COUCHDB_URL}/{name}", auth=auth, timeout=5)
    except httpx.HTTPError:
        pass
