"""Registro de agentes de una bóveda: las notas `AG - AGENTES/<id>.md` (H-030 E5).

Sirve a la interfaz de asignación y a la herramienta de carga: escribe el registro con el formato que valida
`core/agent_access.py`. Siempre como sesión humana (sin cumplimiento de agentes): la autoridad de quién puede
tocar el registro está en la ruta.
"""
from typing import NamedTuple

from app.core import ag_rules
from app.core.agent_access import Registration, parse_registration, registration_path
from app.core.errors import NoteNotFound
from app.core.note_prefix import view_key
from app.core.ports.vault_port import VaultPort
from app.core.schemas import NoteCreate, NoteUpdate
from app.services.agent_access_guard import invalidate_registry
from app.services.note_content_service import NoteContentService


class RegistryEntry(NamedTuple):
    note_id: str
    registration: Registration


def _frontmatter(agent_id: str, carpetas: list[str], estado: str, key_labels: list[str]) -> dict:
    clave = ", ".join(key_labels) if key_labels else "sin clave asignada"
    return {
        "titulo": f"{agent_id} ({clave})",
        "descripcion": f"Registro del agente {agent_id} en esta bóveda: carpetas donde puede escribir y su estado.",
        "tags": ["agente"],
        "estado": estado,
        "agente": agent_id,
        "clave": clave,
        "carpetas": carpetas,
    }


def _body(agent_id: str, carpetas: list[str], estado: str, key_labels: list[str]) -> str:
    keys = ", ".join(f"`{label}`" for label in key_labels) or "_sin clave asignada_"
    folders = "\n".join(f"- `{c}`" for c in carpetas) or "- _ninguna_"
    return (f"# {agent_id}\n\n- Clave: {keys}\n- Estado: {estado}\n\nEscribe en:\n\n{folders}\n\n"
            "Edítala desde la pantalla de asignaciones o cambiando `carpetas` y `estado` en los atributos.\n")


class AgentRegistryService:
    def __init__(self, port: VaultPort, db: str, actor=None, changelog=None):
        self._port = port
        self._db = db
        self._contents = NoteContentService(port, db, actor=actor, changelog=changelog)

    def entries(self, vault_id: str) -> dict[str, RegistryEntry]:
        """Registros válidos de la bóveda por id de agente (lectura directa, sin caché)."""
        found: dict[str, RegistryEntry] = {}
        after = None
        while True:
            docs = self._port.list_notes_by_prefix(
                self._db, vault_id, False, view_key(ag_rules.AG_AGENTES), 100, after)
            for doc in docs:
                registration = parse_registration(doc["path"], doc.get("frontmatter"))
                if registration is not None:
                    found[registration.agent_id] = RegistryEntry(doc["_id"].split(":")[2], registration)
            if len(docs) < 100:
                return found
            after = (view_key(docs[-1]["path"]), docs[-1]["_id"])

    def put(self, vault_id: str, agent_id: str, carpetas: list[str], estado: str, key_labels: list[str]) -> RegistryEntry:
        frontmatter = _frontmatter(agent_id, carpetas, estado, key_labels)
        content = _body(agent_id, carpetas, estado, key_labels)
        existing = self.entries(vault_id).get(agent_id)
        if existing is None:
            created = self._contents.create(
                vault_id, NoteCreate(path=registration_path(agent_id), content=content, frontmatter=frontmatter))
            note_id = created.note.id
        else:
            note_id = existing.note_id
            current = self._contents.get(vault_id, note_id)
            self._contents.update(
                vault_id, note_id, NoteUpdate(content=content, frontmatter=frontmatter), current.etag)
        invalidate_registry(self._db, vault_id)
        return RegistryEntry(note_id, Registration(agent_id, tuple(carpetas), estado))

    def remove(self, vault_id: str, agent_id: str) -> None:
        existing = self.entries(vault_id).get(agent_id)
        if existing is None:
            raise NoteNotFound(f"no registration for {agent_id}")
        current = self._contents.get(vault_id, existing.note_id)
        self._contents.delete(vault_id, existing.note_id, current.etag)
        invalidate_registry(self._db, vault_id)
