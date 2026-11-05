"""Documentos de sistema (H-041): skills y plantillas que publica Synapse en todas las bóvedas. Reglas puras.

La fuente de verdad es el repositorio: `app/system_docs/manifest.json` (ruta, metadatos y versión de cada
documento) y un `.md` por documento con el cuerpo. Un documento es «de sistema» por su **ruta**, no por lo que
traiga la nota: el atributo `sistema: true` se estampa al publicar para que clientes y agentes lo vean, pero nunca
da ni quita el bloqueo. Solo el publicador (`services/system_docs_service.py`) escribe estos documentos.
"""
import hashlib
import json
from pathlib import Path
from typing import NamedTuple

from app.core.note_rules import path_key

DIR = Path(__file__).resolve().parents[1] / "system_docs"
ATTR = "sistema"
# Los sella el servidor en cada escritura: no cuentan para saber si una copia difiere del repositorio.
_STAMPED_KEYS = ("fecha_creacion", "fecha_actualizacion")


class SystemDoc(NamedTuple):
    path: str
    frontmatter: dict  # incluye `sistema: true` y `version`
    content: str
    sha256: str  # el del manifiesto (lo fija `stamp`); `content_hash` lo recalcula


def content_hash(frontmatter: dict | None, content: str) -> str:
    """Huella del documento: cuerpo y metadatos sin las fechas que sella el servidor."""
    clean = {k: v for k, v in (frontmatter or {}).items() if k not in _STAMPED_KEYS}
    raw = json.dumps({"frontmatter": clean, "content": content}, ensure_ascii=False, sort_keys=True,
                     separators=(",", ":"))
    return hashlib.sha256(raw.encode("utf-8")).hexdigest()


def load(directory: Path = DIR) -> tuple[SystemDoc, ...]:
    manifest = json.loads((directory / "manifest.json").read_text(encoding="utf-8"))
    docs = []
    for entry in manifest["documents"]:
        content = (directory / entry["body"]).read_text(encoding="utf-8")
        docs.append(SystemDoc(entry["path"], {**entry["frontmatter"], ATTR: True}, content, entry.get("sha256", "")))
    return tuple(docs)


def stamp(directory: Path = DIR) -> list[str]:
    """Recalcula el `sha256` de cada documento en el manifiesto (lo ejecuta quien sube una versión)."""
    manifest_path = directory / "manifest.json"
    manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
    changed = []
    for entry, doc in zip(manifest["documents"], load(directory), strict=True):
        digest = content_hash(doc.frontmatter, doc.content)
        if entry.get("sha256") != digest:
            entry["sha256"] = digest
            changed.append(entry["path"])
    manifest_path.write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    return changed


DOCS = load()
_BY_KEY = {path_key(doc.path): doc for doc in DOCS}


def system_doc_for(path: str | None) -> SystemDoc | None:
    return None if path is None else _BY_KEY.get(path_key(path))


def is_system_path(path: str | None) -> bool:
    return system_doc_for(path) is not None
