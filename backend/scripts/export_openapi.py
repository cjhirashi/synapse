"""Exporta el contrato OpenAPI de la app a .harness/specs/0002-auth/contracts/openapi.yaml.

Uso (desde backend/, con el entorno requerido definido): python scripts/export_openapi.py
"""
import json
import os
import sys
from pathlib import Path

import yaml

# El esquema no depende de los valores: placeholders sólo para poder importar la app.
for _k in ("DATABASE_URL","COUCHDB_URL","COUCHDB_USER","COUCHDB_PASSWORD","JWT_SECRET","ADMIN_EMAIL","ADMIN_PASSWORD"):
    os.environ.setdefault(_k, "sqlite://" if _k == "DATABASE_URL" else "export-only")

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.main import app  # noqa: E402

TARGET = (
    Path(__file__).resolve().parents[2]
    / ".harness/specs/0002-auth/contracts/openapi.yaml"
)

if __name__ == "__main__":
    spec = json.loads(json.dumps(app.openapi()))
    TARGET.parent.mkdir(parents=True, exist_ok=True)
    TARGET.write_text(yaml.safe_dump(spec, sort_keys=True, allow_unicode=True))
    print(f"escrito {TARGET}")
