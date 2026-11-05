#!/usr/bin/env python3
"""H-030 E5: siembra el registro `AG - AGENTES/<id>.md` de cada bóveda según `agent_registry_seed.json`.

Sin `--apply` solo informa. No pisa registros que ya existen (los que Carlos reasignó a mano): los deja como
están y lo dice. Las bóvedas del archivo se buscan por nombre (sin distinguir mayúsculas ni acentos).

Uso (dentro del contenedor): python scripts/seed_agent_registry.py [--apply] [--email correo]
"""
import argparse
import json
import sys
import unicodedata
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

from h030_common import active_vaults, user_dbs

from app.adapters.agent_key_repository import AgentKeyRepository
from app.adapters.database import SessionLocal
from app.adapters.vault_repository import VaultRepository
from app.services.agent_registry_service import AgentRegistryService


def _norm(text: str) -> str:
    return "".join(c for c in unicodedata.normalize("NFD", text.casefold()) if not unicodedata.combining(c))


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("--apply", action="store_true")
    parser.add_argument("--email")
    args = parser.parse_args()
    seed = json.loads((Path(__file__).parent / "agent_registry_seed.json").read_text())["bóvedas"]
    wanted = {_norm(name): agents for name, agents in seed.items()}
    port = VaultRepository()
    out, matched = [], set()
    for user_id, email, db in user_dbs(args.email):
        with SessionLocal() as session:
            labels: dict[str, list[str]] = {}
            for key in AgentKeyRepository(session).list_by_owner(user_id):
                if key.revoked_at is None and key.agent_id:
                    labels.setdefault(key.agent_id, []).append(key.label)
        registry = AgentRegistryService(port, db)
        for vault in active_vaults(port, db):
            agents = wanted.get(_norm(vault["name"]))
            if agents is None:
                out.append({"vault": vault["name"], "result": "sin sembrado"})
                continue
            matched.add(_norm(vault["name"]))
            vault_id = vault["_id"].split(":", 1)[1]
            existing = registry.entries(vault_id)
            for agent_id, carpetas in agents.items():
                if agent_id in existing:
                    out.append({"vault": vault["name"], "agent": agent_id, "result": "ya registrado, se conserva"})
                    continue
                if args.apply:
                    registry.put(vault_id, agent_id, carpetas, "activo", labels.get(agent_id, []))
                out.append({"vault": vault["name"], "agent": agent_id, "carpetas": carpetas,
                            "result": "registrado" if args.apply else "se registraría"})
    out += [{"vault": name, "result": "bóveda del sembrado no encontrada"} for name in wanted if name not in matched]
    print(json.dumps(out, ensure_ascii=False, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
