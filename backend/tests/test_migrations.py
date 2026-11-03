"""Migración 007 (H-025): la columna `folder` de `files` aparece, no rompe filas previas y se revierte."""
import sqlite3
from pathlib import Path

import pytest
from alembic import command
from alembic.config import Config

BACKEND = Path(__file__).resolve().parents[1]


def _config(url: str) -> Config:
    cfg = Config(str(BACKEND / "alembic.ini"))
    cfg.set_main_option("script_location", str(BACKEND / "alembic"))
    cfg.set_main_option("sqlalchemy.url", url)
    return cfg


@pytest.fixture
def sqlite_url(tmp_path, monkeypatch):
    url = f"sqlite:///{tmp_path / 'm.db'}"
    monkeypatch.setenv("DATABASE_URL", url)
    return url


def _columns(db: Path) -> list[str]:
    with sqlite3.connect(db) as con:
        return [r[1] for r in con.execute("PRAGMA table_info(files)")]


def test_migracion_007_agrega_folder_conserva_filas_y_se_revierte(sqlite_url, tmp_path):
    db = tmp_path / "m.db"
    cfg = _config(sqlite_url)
    command.upgrade(cfg, "e2f5b7d9c3a1")
    assert "folder" not in _columns(db)
    command.upgrade(cfg, "f3a6c8e1b4d2")
    assert "folder" in _columns(db)
    with sqlite3.connect(db) as con:
        info = {r[1]: r for r in con.execute("PRAGMA table_info(files)")}
    assert info["folder"][3] == 0  # notnull = 0: opcional
    command.downgrade(cfg, "e2f5b7d9c3a1")
    assert "folder" not in _columns(db)
