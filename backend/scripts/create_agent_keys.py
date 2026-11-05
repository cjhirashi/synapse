#!/usr/bin/env python3
"""H-030 E5: crea las claves por agente `op-<agente>` del dueño y escribe sus valores en un archivo 600.

Los valores son secretos: NUNCA se imprimen. El archivo tiene una línea `SYNAPSE_KEY_<AGENTE>=<valor>` por clave
creada. Una clave que ya existe vigente no se vuelve a crear (su valor no se puede recuperar): se informa y,
para rotarla, se crea otra con `--suffix` y se revoca la vieja después.

Uso (dentro del contenedor): python scripts/create_agent_keys.py --email correo --out /tmp/claves.env
       [--agents aira,liza,...] [--admin main] [--suffix -2]
"""
import argparse
import os

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

from h030_common import user_dbs

from app.adapters.agent_key_repository import AgentKeyRepository
from app.adapters.database import SessionLocal
from app.services.agent_key_service import AgentKeyService

DEFAULT_AGENTS = "aira,liza,emma,varela,salomon,turing,tukey,paulina,banzi,main"


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("--email", required=True)
    parser.add_argument("--out", required=True)
    parser.add_argument("--agents", default=DEFAULT_AGENTS)
    parser.add_argument("--admin", default="", help="ids que se crean con is_admin (Q2 pendiente: vacío por defecto)")
    parser.add_argument("--suffix", default="", help="sufijo del nombre, p. ej. -2 para una rotación")
    args = parser.parse_args()
    [(owner_id, _email, _db)] = user_dbs(args.email)
    admins = {a for a in args.admin.split(",") if a}
    lines, report = [], []
    with SessionLocal() as session:
        service = AgentKeyService(AgentKeyRepository(session))
        active = {k.label for k in service.list(owner_id) if k.revoked_at is None}
        for agent_id in [a for a in args.agents.split(",") if a]:
            label = f"op-{agent_id}{args.suffix}"
            if label in active:
                report.append(f"{label}: ya existe vigente; no se vuelve a crear")
                continue
            _key, raw = service.create(owner_id, label, agent_id=agent_id, is_admin=agent_id in admins)
            lines.append(f"SYNAPSE_KEY_{agent_id.upper().replace('-', '_')}{args.suffix.upper().replace('-', '_')}={raw}")
            report.append(f"{label}: creada (agente {agent_id}{', administrador' if agent_id in admins else ''})")
    fd = os.open(args.out, os.O_WRONLY | os.O_CREAT | os.O_TRUNC, 0o600)
    with os.fdopen(fd, "w") as handle:
        handle.write("\n".join(lines) + ("\n" if lines else ""))
    os.chmod(args.out, 0o600)
    print("\n".join(report))
    print(f"# {len(lines)} valores escritos en {args.out} (permisos 600)")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
