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
    "0003-vault-crud": {"paths": ("/vaults",), "schemas": ()},
    "0004-api-problem-details": {"paths": (), "schemas": ("Problem",)},
    "0005-sync": {"paths": ("/sync",), "schemas": ()},
    "0013-acceso-agentes-api": {"paths": ("/auth/agent-keys",), "schemas": ()},
    "0014-acceso-agentes-notas": {"paths": ("/vaults/{vault_id}/notes",), "schemas": ()},
    # H-015 (historia del arnés): las rutas de archivos. El contrato se exporta al mismo árbol
    # `.harness/specs/<feature>/contracts/` que las features de SDD Anchored (un canon por hecho).
    "h015-archivos-imagenes-minio": {"paths": ("/files",), "schemas": ()},
}

_REF_PREFIX = "#/components/"


def owns_path(feature: str, path: str) -> bool:
    """Una ruta pertenece a la feature con el prefijo **más específico** (más largo) que la
    cubre. Así `/auth/agent-keys` es de 0013 y `/auth/login` de 0002, y cada ruta sigue
    teniendo un único dueño (lo exige test_contract.py). Dos prefijos distintos no pueden
    empatar en longitud siendo ambos prefijo de la misma ruta."""
    candidates = [
        (len(p), f)
        for f in FEATURES
        for p in FEATURES[f]["paths"]
        if path == p or path.startswith(p + "/")
    ]
    return bool(candidates) and max(candidates)[1] == feature


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
