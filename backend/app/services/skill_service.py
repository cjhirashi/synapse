"""Skills de bóveda: listado, asignación de propietario y el flujo del gestor que sale (H-041 E4).

Escribe por `NoteContentService` con el actor de quien llama (la sesión humana: es el usuario quien resuelve), de modo que
valen las mismas reglas de siempre (forma `skill:*`, gestores) y cada cambio consta en la BITACORA a su nombre.

Una skill **activa nunca queda sin propietario**: quitar o suspender a un gestor que posee skills activas exige resolver
cada una antes (`leave`). Con invitados: asignarla a uno de ellos o eliminarla. Sin invitados: eliminarla o archivarla.
Archivada = en su carpeta, inactiva, sin propietario ni invitados, hasta que el usuario la asigne a un gestor.
"""
from typing import NamedTuple

from app.core import skill_rules
from app.core.agent_access import Actor, Registration
from app.core.errors import AgentOwnsSkills, NoteNotFound, ValidationFailed
from app.core.ag_rules import AG_SKILLS
from app.core.note_prefix import in_folder, view_key
from app.core.ports.vault_port import VaultPort
from app.core.schemas import NoteUpdate, SkillResolution
from app.services.agent_access_guard import invalidate_registry, read_registry
from app.services.agent_registry_service import AgentRegistryService
from app.services.change_log_service import ChangeLogService
from app.services.note_content_service import NoteContentService


class SkillInfo(NamedTuple):
    note_id: str
    path: str
    titulo: str | None
    propietario: str | None
    agentes: list[str]
    estado: str | None
    etag: str
    frontmatter: dict


class LeaveResult(NamedTuple):
    asignadas: int
    eliminadas: int
    archivadas: int
    invitaciones_quitadas: int


def _info(doc: dict) -> SkillInfo:
    fm = doc.get("frontmatter") or {}
    titulo = fm.get("titulo")
    estado = fm.get("estado")
    return SkillInfo(
        doc["_id"].split(":")[2], doc["path"], titulo if isinstance(titulo, str) else None, skill_rules.owner_of(fm),
        skill_rules.guests_of(fm), estado if isinstance(estado, str) else None, f'"{doc["_rev"]}"', fm)


def _invalid(pointer: str, code: str) -> ValidationFailed:
    return ValidationFailed(errors=[{"pointer": pointer, "detail": code}])


class SkillService:
    def __init__(self, port: VaultPort, db: str, actor: Actor | None = None, changelog: ChangeLogService | None = None):
        self._port = port
        self._db = db
        self._contents = NoteContentService(port, db, actor=actor, changelog=changelog)
        self._registry = AgentRegistryService(port, db, actor=actor, changelog=changelog)

    # --- Lectura ---

    def list_skills(self, vault_id: str) -> list[SkillInfo]:
        """Las skills vivas de la bóveda (notas planas de `AG - SKILLS`, sin los documentos de sistema), por ruta."""
        found, after = [], None
        while True:
            docs = self._port.list_notes_by_prefix(self._db, vault_id, False, view_key(AG_SKILLS), 100, after)
            found += [_info(d) for d in docs if in_folder(d["path"], AG_SKILLS) and skill_rules.is_skill_path(d["path"])]
            if len(docs) < 100:
                return sorted(found, key=lambda s: s.path)
            after = (view_key(docs[-1]["path"]), docs[-1]["_id"])

    def owned_active(self, vault_id: str, agent_id: str) -> list[SkillInfo]:
        return [s for s in self.list_skills(vault_id) if s.propietario == agent_id and s.estado != skill_rules.ARCHIVED]

    # --- Escritura de una skill ---

    def _skill(self, vault_id: str, note_id: str) -> SkillInfo:
        doc = self._port.get(self._db, f"note:{vault_id}:{note_id}")
        if doc is None or doc.get("deleted_at") or not skill_rules.is_skill_path(doc["path"]):
            raise NoteNotFound(f"skill {note_id} not found")
        return _info(doc)

    def _write(self, vault_id: str, skill: SkillInfo, frontmatter: dict) -> None:
        self._contents.update(vault_id, skill.note_id, NoteUpdate(frontmatter=frontmatter), skill.etag)

    def assign(self, vault_id: str, note_id: str, owner: str) -> SkillInfo:
        """Asigna la skill a un gestor (la reasigna el usuario; una archivada vuelve a `en revisión`)."""
        skill = self._skill(vault_id, note_id)
        if not skill_rules.is_manager(read_registry(self._port, self._db, vault_id), owner):
            raise _invalid("#/propietario", skill_rules.SKILL_OWNER)
        self._write(vault_id, skill, skill_rules.assign_owner(skill.frontmatter, owner))
        return self._skill(vault_id, note_id)

    # --- El gestor que sale ---

    def _plan(self, vault_id: str, agent_id: str, resolutions: list[SkillResolution]) -> list[tuple[SkillInfo, SkillResolution]]:
        """Valida que cada skill activa del gestor tenga una resolución permitida; si falta alguna, `AgentOwnsSkills`."""
        owned = {s.note_id: s for s in self.owned_active(vault_id, agent_id)}
        chosen: dict[str, SkillResolution] = {}
        for index, res in enumerate(resolutions):
            if res.note_id not in owned or res.note_id in chosen:
                raise _invalid(f"#/skills/{index}/note_id", "leave:skill")
            skill = owned[res.note_id]
            allowed = ("assign", "delete") if skill.agentes else ("delete", "archive")
            if res.accion not in allowed:
                raise _invalid(f"#/skills/{index}/accion", "leave:accion")
            if res.accion == "assign" and res.a not in skill.agentes:
                raise _invalid(f"#/skills/{index}/a", "leave:a")  # solo a uno de sus invitados (que son gestores)
            chosen[res.note_id] = res
        if any(note_id not in chosen for note_id in owned):
            raise AgentOwnsSkills(f"{agent_id} owns skills without a resolution")
        return [(owned[note_id], chosen[note_id]) for note_id in owned]

    def leave(
        self, vault_id: str, agent_id: str, modo: str, resolutions: list[SkillResolution], key_labels: list[str],
    ) -> LeaveResult:
        """Resuelve las skills del gestor, lo quita de las que lo invitan y por último quita o suspende su registro."""
        entry = self._registry.entries(vault_id).get(agent_id)
        if entry is None:
            raise NoteNotFound(f"no registration for {agent_id}")
        plan = self._plan(vault_id, agent_id, resolutions)
        assigned = deleted = archived = 0
        for skill, res in plan:
            fresh = self._skill(vault_id, skill.note_id)
            if res.accion == "delete":
                self._contents.delete(vault_id, fresh.note_id, fresh.etag)
                deleted += 1
            elif res.accion == "archive":
                self._write(vault_id, fresh, skill_rules.archive(fresh.frontmatter))
                archived += 1
            else:
                self._write(vault_id, fresh, skill_rules.assign_owner(fresh.frontmatter, res.a))
                assigned += 1
        dropped = self.drop_guest_everywhere(vault_id, agent_id)
        if modo == "quitar":
            self._registry.remove(vault_id, agent_id)
        else:
            self._registry.put(vault_id, agent_id, list(entry.registration.carpetas), "suspendido", key_labels)
        return LeaveResult(assigned, deleted, archived, dropped)

    def drop_guest_everywhere(self, vault_id: str, agent_id: str) -> int:
        """Quita a `agent_id` de `agentes` de todas las skills donde figura como invitado."""
        count = 0
        for skill in self.list_skills(vault_id):
            if agent_id in skill.agentes:
                self._write(vault_id, skill, skill_rules.drop_guest(skill.frontmatter, agent_id))
                count += 1
        return count

    def reconcile_guests(self, vault_id: str) -> int:
        """Quita de `agentes` a quien ya no es gestor (activo) de la bóveda. Idempotente; lo llama toda escritura del
        registro, así un gestor que sale por cualquier vía (la página, la edición de su ficha) deja de figurar."""
        invalidate_registry(self._db, vault_id)
        registry: dict[str, Registration] = read_registry(self._port, self._db, vault_id)
        count = 0
        for skill in self.list_skills(vault_id):
            gone = [g for g in skill.agentes if not skill_rules.is_manager(registry, g)]
            if gone:
                self._write(vault_id, skill, {**skill.frontmatter, skill_rules.GUESTS: [g for g in skill.agentes if g not in gone]})
                count += 1
        return count
