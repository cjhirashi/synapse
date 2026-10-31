#!/usr/bin/env python3
"""Generar contrato OpenAPI para h016"""
import json
import importlib.util
import os
import sys
from pathlib import Path

# Setup
ROOT = Path(__file__).parent
os.environ.setdefault("DATABASE_URL", "sqlite://")
os.environ.setdefault("COUCHDB_URL", "export-only")
os.environ.setdefault("COUCHDB_USER", "export-only")
os.environ.setdefault("COUCHDB_PASSWORD", "export-only")
os.environ.setdefault("JWT_SECRET", "export-only")
os.environ.setdefault("ADMIN_EMAIL", "export-only")
os.environ.setdefault("ADMIN_PASSWORD", "export-only")

sys.path.insert(0, str(ROOT / "backend"))

# Load the app and exporter
from app.main import app

spec = importlib.util.spec_from_file_location("export_openapi", ROOT / "backend/scripts/export_openapi.py")
exporter = importlib.util.module_from_spec(spec)
spec.loader.exec_module(exporter)

# Generate and save the contract
import yaml
feature = "h016-archivos-pantalla-y-tipos"
app_spec = json.loads(json.dumps(app.openapi()))
contract = exporter.contract_for(app_spec, feature)

target = ROOT / ".harness/specs" / feature / "contracts/openapi.yaml"
target.parent.mkdir(parents=True, exist_ok=True)
target.write_text(yaml.safe_dump(contract, sort_keys=True, allow_unicode=True))
print(f"escrito {target}")
