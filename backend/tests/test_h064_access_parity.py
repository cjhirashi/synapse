"""El archivo de paridad del cliente es exactamente lo que calcula el servidor (H-064 F7d)."""
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "backend"))

from scripts.gen_access_parity import build  # noqa: E402


def test_the_client_parity_file_matches_what_the_server_computes():
    committed = json.loads((ROOT / "frontend/src/sharing/accessParity.json").read_text())
    assert committed == build(), "regenera con `python backend/scripts/gen_access_parity.py`: el motor de permisos cambió"


def test_the_table_covers_every_outcome_and_the_tricky_names():
    cases = build()["cases"]
    assert {c["level"] for c in cases} == {"escritura", "lectura", None}
    paths = {c["path"] for c in cases}
    assert {"PUB/A.MD", "bitacora/x.md", "PLANTILLAS/t.md", "BITACORA.md", "Pub/BITACORA/x.md"} <= paths
