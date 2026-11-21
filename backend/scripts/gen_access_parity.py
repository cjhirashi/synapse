"""Genera `frontend/src/sharing/accessParity.json`: nivel del servidor (`level_of`) para una tabla de concesiones y rutas.

El cliente porta `level_of`; su prueba compara contra este archivo y una prueba del servidor comprueba que el archivo sigue
siendo exactamente lo que el servidor calcula, de modo que ninguno de los dos lados puede cambiar sin que falle el otro.
"""
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.core.vault_access import Grant, MemberAccess, level_of  # noqa: E402

GRANTS = {
    "lectura-todo": [("*", "lectura")],
    "escritura-todo": [("*", "escritura")],
    "pub-lectura": [("Pub", "lectura")],
    "pub-escritura": [("Pub", "escritura")],
    "mixto": [("Pub", "lectura"), ("Docs/Sub", "escritura")],
    "todo-lectura-y-una-escritura": [("*", "lectura"), ("Docs", "escritura")],
    "acentos": [("Código/Ñandú", "escritura")],
    "ninguna": [],
}
PATHS = [
    "a.md", "Pub/a.md", "Pub/sub/b.md", "pub/a.md", "PUB/A.MD", "Pub.md", "Publico/a.md", "Priv/c.md", "Docs/b.md", "Docs/Sub/x.md",
    "Docs/Subtle/x.md", "Docs/sub/x.md", "Docs/INDICE.md", "INDICE.md", "Pub/INDICE.md", "Código/Ñandú/n.md", "CÓDIGO/ñandú/n.md",
    "Código/Ñandú/n.md", "BITACORA/2026-11-20.md", "bitacora/x.md", "AG - AGENTES/aira.md", "AG - SKILLS/s.md",
    "AG - MENSAJES/m.md", "ag - mensajes/m.md", "PLANTILLAS/t.md", "plantillas/t.md", "PLANTILLAS.md", "BITACORA.md", "Pub/BITACORA/x.md",
    "Docs/Sub/", "", "ｐub/a.md",
]


def build() -> dict:
    cases = []
    for name, grants in GRANTS.items():
        access = MemberAccess(tuple(Grant(f, lv) for f, lv in grants))
        for path in PATHS:
            cases.append({"grants": [{"folder": f, "level": lv} for f, lv in grants], "path": path, "level": level_of(access, path)})
    return {"cases": cases}


if __name__ == "__main__":
    out = Path(__file__).resolve().parents[2] / "frontend/src/sharing/accessParity.json"
    out.write_text(json.dumps(build(), ensure_ascii=False, indent=1) + "\n")
    print(f"escrito {out} ({len(build()['cases'])} casos)")
