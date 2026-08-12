import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from app.adapters.database import Base, get_db
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
    with TestClient(app, raise_server_exceptions=True, base_url="https://testserver") as c:
        yield c
    app.dependency_overrides.clear()


@pytest.fixture
def admin_user(client):
    client.post("/auth/register", json={"email": "admin@test.com", "password": "secret"})


@pytest.fixture
def auth_cookies(client, admin_user):
    client.post("/auth/login", json={"email": "admin@test.com", "password": "secret"})
    return client.cookies
