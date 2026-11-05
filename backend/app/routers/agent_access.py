"""Registro de agentes por bóveda y informe del modo sombra (H-030 E5/E6).

Lectura con cookie o API key; **escritura solo con sesión humana** (`get_current_user`): una key nunca
modifica el registro que la limita. El agente administrador edita el registro como nota (`AG - AGENTES/`),
no por aquí.
"""
import json
from datetime import datetime, timedelta

from fastapi import APIRouter, Depends, Path, Query, Response, status
from sqlalchemy import func
from sqlalchemy.orm import Session

from app.adapters.agent_key_repository import AgentKeyRepository
from app.adapters.database import get_db
from app.core.config import settings
from app.core.dependencies import get_current_principal, get_current_user, require_password_changed
from app.core.errors import (
    AgentOwnsSkills, NoteNotFound, NotePathTaken, PasswordChangeRequired, StorageUnavailable, ValidationFailed, VaultNotFound,
)
from app.core.json_body import DeepJsonRoute
from app.core.models.agent_access_log import AgentAccessLog
from app.core.problems import problem_responses
from app.core.agent_access import actor_of
from app.core.schemas import (
    AgentAccessEntryOut, AgentAccessKeyOut, AgentAccessOut, AgentAccessPut, AgentLeave, AgentLeaveOut, ShadowCountOut,
    ShadowDenyOut, ShadowReportOut, SkillAssign, SkillListOut, SkillOut, TokenPayload,
)
from app.routers.auth import SESSION_ERRORS
from app.routers.vaults import VaultId, get_vault_port
from app.core.ports.vault_port import VaultPort
from app.services.agent_registry_service import AgentRegistryService
from app.services.change_log_service import ChangeLogService
from app.services.skill_service import SkillInfo, SkillService

router = APIRouter(
    route_class=DeepJsonRoute,
    tags=["agent-access"],
    dependencies=[Depends(require_password_changed)],
    responses=problem_responses(*SESSION_ERRORS, PasswordChangeRequired),
)

_AGENT_ID = Path(pattern=r"^[a-z0-9][a-z0-9-]{0,31}$", description="Id del agente.")


def _active_keys(db: Session, owner_id: str):
    return [k for k in AgentKeyRepository(db).list_by_owner(owner_id) if k.revoked_at is None and k.agent_id]


def _registry(port: VaultPort, user: TokenPayload) -> AgentRegistryService:
    return AgentRegistryService(port, f"synapse_user_{user.sub}")


@router.get(
    "/vaults/{vault_id}/agent-access",
    response_model=AgentAccessOut,
    responses=problem_responses(VaultNotFound, StorageUnavailable),
)
def get_agent_access(
    vault_id: VaultId,
    user: TokenPayload = Depends(get_current_principal),
    port: VaultPort = Depends(get_vault_port),
    db: Session = Depends(get_db),
):
    """Quién está registrado en la bóveda, con el nombre de la clave (`op-…`) de cada agente."""
    if port.get(f"synapse_user_{user.sub}", f"vault:{vault_id}") is None:
        raise VaultNotFound(f"vault:{vault_id} not found")
    keys: dict[str, list[AgentAccessKeyOut]] = {}
    for key in _active_keys(db, user.sub):
        keys.setdefault(key.agent_id, []).append(AgentAccessKeyOut(label=key.label, is_admin=key.is_admin))
    entries = _registry(port, user).entries(vault_id)
    agents = [
        AgentAccessEntryOut(
            agent_id=agent_id, estado=entry.registration.estado, carpetas=list(entry.registration.carpetas),
            note_id=entry.note_id, keys=keys.get(agent_id, []))
        for agent_id, entry in sorted(entries.items())
    ]
    unregistered = sorted(set(keys) - set(entries))
    return AgentAccessOut(
        mode=settings.AGENT_ACCESS_MODE, agents=agents,
        unregistered_keys=[k for agent_id in unregistered for k in keys[agent_id]],
        unregistered_agent_ids=unregistered)


@router.put(
    "/vaults/{vault_id}/agent-access/{agent_id}",
    response_model=AgentAccessEntryOut,
    responses=problem_responses(VaultNotFound, ValidationFailed, NotePathTaken, AgentOwnsSkills, StorageUnavailable),
)
def put_agent_access(
    vault_id: VaultId,
    body: AgentAccessPut,
    agent_id: str = _AGENT_ID,
    user: TokenPayload = Depends(get_current_user),
    port: VaultPort = Depends(get_vault_port),
    db: Session = Depends(get_db),
):
    """Registra o reasigna un agente en la bóveda (solo sesión humana)."""
    labels = [k.label for k in _active_keys(db, user.sub) if k.agent_id == agent_id]
    entry = _registry(port, user).put(vault_id, agent_id, body.carpetas, body.estado, labels)
    return AgentAccessEntryOut(
        agent_id=agent_id, estado=entry.registration.estado, carpetas=list(entry.registration.carpetas),
        note_id=entry.note_id,
        keys=[AgentAccessKeyOut(label=k.label, is_admin=k.is_admin) for k in _active_keys(db, user.sub)
              if k.agent_id == agent_id])


@router.delete(
    "/vaults/{vault_id}/agent-access/{agent_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    response_class=Response,
    responses=problem_responses(NoteNotFound, VaultNotFound, AgentOwnsSkills, StorageUnavailable),
)
def delete_agent_access(
    vault_id: VaultId,
    agent_id: str = _AGENT_ID,
    user: TokenPayload = Depends(get_current_user),
    port: VaultPort = Depends(get_vault_port),
):
    """Quita el registro de un agente en la bóveda (solo sesión humana)."""
    _registry(port, user).remove(vault_id, agent_id)


def _skills(port: VaultPort, user: TokenPayload, with_log: bool = False) -> SkillService:
    """El servicio de skills con el actor de quien llama; con `with_log`, sus cambios constan en la BITACORA."""
    db = f"synapse_user_{user.sub}"
    actor = actor_of(user)
    return SkillService(port, db, actor=actor, changelog=ChangeLogService(port, db, user.sub, actor) if with_log else None)


def _skill_out(skill: SkillInfo) -> SkillOut:
    return SkillOut(
        note_id=skill.note_id, path=skill.path, titulo=skill.titulo, propietario=skill.propietario,
        agentes=skill.agentes, estado=skill.estado)


@router.get(
    "/vaults/{vault_id}/skills",
    response_model=SkillListOut,
    responses=problem_responses(VaultNotFound, StorageUnavailable),
)
def list_skills(
    vault_id: VaultId,
    user: TokenPayload = Depends(get_current_principal),
    port: VaultPort = Depends(get_vault_port),
):
    """Las skills de la bóveda con su propietario, sus invitados y su estado (H-041 E4). Las archivadas no tienen
    propietario; los documentos de sistema no se listan."""
    if port.get(f"synapse_user_{user.sub}", f"vault:{vault_id}") is None:
        raise VaultNotFound(f"vault:{vault_id} not found")
    return SkillListOut(skills=[_skill_out(s) for s in _skills(port, user).list_skills(vault_id)])


@router.post(
    "/vaults/{vault_id}/skills/{note_id}/assign",
    response_model=SkillOut,
    responses=problem_responses(VaultNotFound, NoteNotFound, ValidationFailed, StorageUnavailable),
)
def assign_skill(
    vault_id: VaultId,
    body: SkillAssign,
    note_id: str = Path(description="Id de la nota de la skill."),
    user: TokenPayload = Depends(get_current_user),
    port: VaultPort = Depends(get_vault_port),
):
    """Asigna la skill a un gestor activo (solo sesión humana): pasa a ser su propietario, sale de `agentes` si estaba y
    una skill archivada vuelve a `en revisión` (H-041 E4)."""
    if port.get(f"synapse_user_{user.sub}", f"vault:{vault_id}") is None:
        raise VaultNotFound(f"vault:{vault_id} not found")
    return _skill_out(_skills(port, user, with_log=True).assign(vault_id, note_id, body.propietario))


@router.post(
    "/vaults/{vault_id}/agent-access/{agent_id}/leave",
    response_model=AgentLeaveOut,
    responses=problem_responses(VaultNotFound, NoteNotFound, ValidationFailed, AgentOwnsSkills, StorageUnavailable),
)
def agent_leaves(
    vault_id: VaultId,
    body: AgentLeave,
    agent_id: str = _AGENT_ID,
    user: TokenPayload = Depends(get_current_user),
    port: VaultPort = Depends(get_vault_port),
    db: Session = Depends(get_db),
):
    """Quita o suspende a un gestor resolviendo antes cada skill de la que es propietario (solo sesión humana, H-041 E4):
    con invitados, asignarla a uno de ellos o eliminarla; sin invitados, eliminarla o archivarla. También lo quita de
    `agentes` de las skills que lo invitan. Si falta alguna resolución, 409 `agent-owns-skills` y no se toca nada."""
    if port.get(f"synapse_user_{user.sub}", f"vault:{vault_id}") is None:
        raise VaultNotFound(f"vault:{vault_id} not found")
    labels = [k.label for k in _active_keys(db, user.sub) if k.agent_id == agent_id]
    done = _skills(port, user, with_log=True).leave(vault_id, agent_id, body.modo, body.skills, labels)
    return AgentLeaveOut(
        asignadas=done.asignadas, eliminadas=done.eliminadas, archivadas=done.archivadas,
        invitaciones_quitadas=done.invitaciones_quitadas)


@router.get("/agent-access/shadow-report", response_model=ShadowReportOut)
def shadow_report(
    hours: int = Query(48, ge=1, le=720),
    user: TokenPayload = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Lo que el modo sombra registró: decisiones por agente y las últimas denegadas (solo sesión humana)."""
    since = datetime.utcnow() - timedelta(hours=hours)
    base = db.query(AgentAccessLog).filter(AgentAccessLog.owner_id == user.sub, AgentAccessLog.at >= since)
    rows = (
        db.query(AgentAccessLog.agent_id, AgentAccessLog.decision, AgentAccessLog.reason,
                 AgentAccessLog.declared, func.count())
        .filter(AgentAccessLog.owner_id == user.sub, AgentAccessLog.at >= since)
        .group_by(AgentAccessLog.agent_id, AgentAccessLog.decision, AgentAccessLog.reason, AgentAccessLog.declared)
        .all())
    denies = base.filter(AgentAccessLog.decision.like("deny%")).order_by(AgentAccessLog.at.desc()).limit(50).all()
    return ShadowReportOut(
        mode=settings.AGENT_ACCESS_MODE, hours=hours, total=sum(r[4] for r in rows),
        counts=[ShadowCountOut(agent_id=r[0], decision=r[1], reason=r[2], declared=bool(r[3]), count=r[4]) for r in rows],
        recent_denies=[ShadowDenyOut(at=d.at, vault_id=d.vault_id, agent_id=d.agent_id, op=d.op,
                                     paths=json.loads(d.paths), reason=d.reason) for d in denies])
