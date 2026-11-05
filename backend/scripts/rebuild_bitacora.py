#!/usr/bin/env python3
"""H-030b: regenera los documentos diarios de BITACORA desde la tabla `change_log` (la fuente de verdad).

Sirve para reparar días que no se escribieron (la escritura es de mejor esfuerzo) o tras cambiar el texto del día.
Es idempotente: un día cuyo contenido no cambió no se reescribe. Sin `--apply` solo cuenta los días con cambios.

Uso (dentro del contenedor): python scripts/rebuild_bitacora.py [--apply] [--email correo]
"""
import argparse
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

from h030_common import active_vaults, user_dbs

from app.adapters.vault_repository import VaultRepository
from app.services.change_log_service import SYSTEM, ChangeLogService, ChangeLogStore


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("--apply", action="store_true", help="escribe; sin esto solo informa")
    parser.add_argument("--email", help="limita a un usuario")
    args = parser.parse_args()
    port, store, total = VaultRepository(), ChangeLogStore(), 0
    for user_id, email, db in user_dbs(args.email):
        service = ChangeLogService(port, db, user_id, None, via="system", author=SYSTEM)
        for vault in active_vaults(port, db):
            vault_id = vault["_id"].split(":", 1)[1]
            if args.apply:
                days = service.rebuild(vault_id)
            else:
                tz = service._owner()[1]
                from app.core.bitacora_rules import local_date
                days = sorted({local_date(at, tz) for at in store.days(vault_id)})
            total += len(days)
            if days:
                print(f"{email} · {vault['name']}: {len(days)} días ({days[0]} … {days[-1]})")
    print(f"# días {'escritos' if args.apply else 'con cambios'}: {total}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
