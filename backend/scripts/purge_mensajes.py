#!/usr/bin/env python3
"""H-030 E7: purga de conversaciones cerradas de `AG - MENSAJES` (más de 15 días) y limpieza de volcados y de la
bitácora del modo sombra (más de 30 días).

Sin `--apply` solo informa (en seco). Con `--apply`, antes de borrar cada conversación escribe su volcado JSONL en
`--dump-dir/AAAAMMDD/` y anota la purga en la tabla `purge_log`. Pensado para correr a diario a las 03:30 CDMX
(09:30 UTC) con `docker exec`; es idempotente.

Uso (dentro del contenedor): python scripts/purge_mensajes.py [--apply] [--dump-dir /backups/synapse-purga]
"""
import argparse
import sys
from datetime import UTC, datetime, timedelta
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

from h030_common import active_vaults, user_dbs

from app.adapters.database import SessionLocal
from app.adapters.vault_repository import VaultRepository
from app.core.models.agent_access_log import AgentAccessLog
from app.core.models.purge_log import PurgeLog
from app.services import mensajes_purge


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("--apply", action="store_true")
    parser.add_argument("--dump-dir", default="/backups/synapse-purga")
    args = parser.parse_args()
    now = datetime.now(UTC)
    dump_root = Path(args.dump_dir)
    port = VaultRepository()
    total = 0
    for user_id, email, db in user_dbs():
        for vault in active_vaults(port, db):
            vault_id = vault["_id"].split(":", 1)[1]
            plan = mensajes_purge.plan(port, db, vault_id, now)
            for alert in plan.alerts:
                print(f"{alert} (bóveda {vault['name']}, usuario {email})", file=sys.stderr)
            for candidate in plan.candidates:
                label = f"{vault['name']}: {candidate.folder} (cerrada {candidate.closed_at:%Y-%m-%d}, {len(candidate.docs)} notas)"
                if not args.apply:
                    print(f"purgaría {label}")
                    continue
                dump_path = dump_root / f"{now:%Y%m%d}" / f"{vault_id}.jsonl"
                deleted = mensajes_purge.execute(port, db, user_id, vault_id, candidate, dump_path)
                with SessionLocal() as session:
                    session.add(PurgeLog(ran_at=now.replace(tzinfo=None), owner_id=user_id, vault_id=vault_id,
                                         conversation=candidate.folder, notes_deleted=deleted, dump_file=str(dump_path)))
                    session.commit()
                print(f"purgada {label}: {deleted} documentos; volcado {dump_path}")
                total += 1
    if args.apply:
        for removed in mensajes_purge.prune_dumps(dump_root, now):
            print(f"volcado de {removed} eliminado (más de 30 días)")
        with SessionLocal() as session:
            cutoff = now - timedelta(days=30)
            count = session.query(AgentAccessLog).filter(AgentAccessLog.at < cutoff.replace(tzinfo=None)).delete()
            session.commit()
            print(f"bitácora del modo sombra: {count} filas de más de 30 días eliminadas")
    print(f"# conversaciones {'purgadas' if args.apply else 'por purgar'}: {total if args.apply else '(ver líneas)'}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
