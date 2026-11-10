"""Test de migración 011: user profile (display_name, avatar).

RF-028: Las columnas de perfil existen en el modelo User.
"""

from pathlib import Path

from alembic import command
from alembic.config import Config
from alembic.script import ScriptDirectory
from sqlalchemy import create_engine, inspect

from app.core.models.user import User

BACKEND_DIR = Path(__file__).resolve().parents[1]
PROFILE_COLUMNS = {"display_name", "avatar_content_type", "avatar_version"}
HEAD_011 = "d6e9f1a3b5c7"
PREVIOUS_HEAD = "c5d8e0f2a4b6"


def _user_columns(engine) -> set[str]:
    return {col["name"] for col in inspect(engine).get_columns("users")}


def test_migration_011_round_trip_upgrade_downgrade_upgrade(tmp_path, monkeypatch):
    """EARS: Given una BD vacía, When se aplica `alembic upgrade head`, Then `users` tiene las
    columnas de perfil; When se hace `downgrade c5d8e0f2a4b6`, Then desaparecen; y al volver a subir
    reaparecen. Demuestra que la migración es reversible de verdad, no sólo que el modelo cambió.
    """
    # env.py lee DATABASE_URL del entorno en cada ejecución (ignora el de la Config): la BD es un
    # archivo temporal para no tocar ./test.db, que comparte el resto de la suite.
    url = f"sqlite:///{tmp_path / 'migration_011.db'}"
    monkeypatch.setenv("DATABASE_URL", url)
    cfg = Config(str(BACKEND_DIR / "alembic.ini"))
    cfg.set_main_option("script_location", str(BACKEND_DIR / "alembic"))

    # Una sola cabeza: si alguien añade otra migración sin encadenarla, este test lo avisa.
    assert ScriptDirectory.from_config(cfg).get_current_head() == HEAD_011

    engine = create_engine(url)
    try:
        command.upgrade(cfg, "head")
        assert PROFILE_COLUMNS <= _user_columns(engine)

        command.downgrade(cfg, PREVIOUS_HEAD)
        assert not (PROFILE_COLUMNS & _user_columns(engine))

        command.upgrade(cfg, "head")
        assert PROFILE_COLUMNS <= _user_columns(engine)
    finally:
        engine.dispose()


def test_migration_011_model_has_profile_columns():
    """EARS: Given el modelo User de ORM, When se inspecciona,
    Then existen las propiedades display_name, avatar_content_type, avatar_version.
    """
    # Act: inspeccionar el modelo User.
    mapper = inspect(User)
    columns = {col.name for col in mapper.columns}

    # Assert: verificar que las columnas de perfil existen.
    assert "display_name" in columns, "display_name debe existir en el modelo User"
    assert "avatar_content_type" in columns, "avatar_content_type debe existir en el modelo User"
    assert "avatar_version" in columns, "avatar_version debe existir en el modelo User"


def test_migration_011_model_display_name_nullable():
    """EARS: Given el modelo User, When se inspecciona display_name,
    Then es nullable.
    """
    mapper = inspect(User)
    display_name_col = mapper.columns["display_name"]

    assert display_name_col.nullable, "display_name debe ser nullable"


def test_migration_011_model_avatar_version_not_null():
    """EARS: Given el modelo User, When se inspecciona avatar_version,
    Then no es nullable y tiene default 0.
    """
    mapper = inspect(User)
    avatar_version_col = mapper.columns["avatar_version"]

    assert not avatar_version_col.nullable, "avatar_version no debe ser nullable"
    assert avatar_version_col.server_default is not None, "avatar_version debe tener server_default"
