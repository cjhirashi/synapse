"""Exporta el contrato OpenAPI de la app repartido por feature (un canon por hecho, Art. 12).

Cada feature recibe en `.harness/specs/<feature>/contracts/openapi.yaml` sólo sus rutas
(por prefijo) y sus esquemas raíz, más los `components` que referencian (recorrido de
`$ref`), así cada contrato es autocontenido y se puede validar suelto.

Uso (desde backend/, con el entorno requerido definido): python scripts/export_openapi.py
"""
import json
import os
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]

# Rutas (prefijos) y esquemas raíz de cada feature. Toda ruta de la app debe pertenecer a
# exactamente una feature (lo exige test_contract.py).
FEATURES: dict[str, dict[str, tuple[str, ...]]] = {
    "0002-auth": {"paths": ("/auth", "/admin", "/health"), "schemas": ()},
    "0004-api-problem-details": {"paths": (), "schemas": ("Problem",)},
}

_REF_PREFIX = "#/components/"


def owns_path(feature: str, path: str) -> bool:
    return any(path == p or path.startswith(p + "/") for p in FEATURES[feature]["paths"])


def _refs(node) -> set[str]:
    """Todas las referencias internas (`#/components/...`) dentro de un nodo."""
    if isinstance(node, dict):
        found = set()
        for key, value in node.items():
            if key == "$ref" and isinstance(value, str) and value.startswith(_REF_PREFIX):
                found.add(value)
            else:
                found |= _refs(value)
        return found
    if isinstance(node, list):
        return set().union(*(_refs(item) for item in node)) if node else set()
    return set()


def contract_for(spec: dict, feature: str) -> dict:
    paths = {p: op for p, op in spec.get("paths", {}).items() if owns_path(feature, p)}
    pending = _refs(paths) | {
        f"{_REF_PREFIX}schemas/{name}" for name in FEATURES[feature]["schemas"]
    }
    components: dict[str, dict] = {}
    seen: set[str] = set()
    while pending:
        ref = pending.pop()
        if ref in seen:
            continue
        seen.add(ref)
        section, name = ref[len(_REF_PREFIX):].split("/", 1)
        node = spec["components"][section][name]
        components.setdefault(section, {})[name] = node
        pending |= _refs(node)

    contract = {"openapi": spec["openapi"], "info": spec["info"]}
    if paths:
        contract["paths"] = paths
    if components:
        contract["components"] = components
    return contract


def target(feature: str) -> Path:
    return ROOT / ".harness/specs" / feature / "contracts/openapi.yaml"


def main() -> None:
    import yaml

    # El esquema no depende de los valores: placeholders sólo para poder importar la app.
    for key in ("DATABASE_URL", "COUCHDB_URL", "COUCHDB_USER", "COUCHDB_PASSWORD",
                "JWT_SECRET", "ADMIN_EMAIL", "ADMIN_PASSWORD"):
        os.environ.setdefault(key, "sqlite://" if key == "DATABASE_URL" else "export-only")
    sys.path.insert(0, str(ROOT / "backend"))
    from app.main import app

    spec = json.loads(json.dumps(app.openapi()))
    for feature in FEATURES:
        path = target(feature)
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(yaml.safe_dump(contract_for(spec, feature), sort_keys=True, allow_unicode=True))
        print(f"escrito {path}")


if __name__ == "__main__":
    main()
