"""Gestión de API keys de agente (SPEC-0013, P-9).

Router propio (no dentro de `auth.py`): `auth.py` es login/sesión, esto es su propia
responsabilidad. **Sólo cookie** por construcción (`dependencies=[Depends(get_current_user)]`):
una key no acuña ni revoca keys ni cambia la contraseña del humano (contención de privilegio
estructural, P-4). Ruta → validar → procesar → responder, como el resto del repo.
"""
from fastapi import APIRouter, Depends, Path, Response, status
from sqlalchemy.orm import Session

from app.adapters.agent_key_repository import AgentKeyRepository
from app.adapters.database import get_db
from app.core.dependencies import get_current_user
from app.core.errors import AgentKeyLabelTaken, AgentKeyNotFound
from app.core.json_body import DeepJsonRoute
from app.core.problems import problem_responses
from app.core.schemas import AgentKeyCreate, AgentKeyCreated, AgentKeyOut, TokenPayload
from app.routers.auth import SESSION_ERRORS
from app.services.agent_key_service import AgentKeyService

router = APIRouter(
    prefix="/auth/agent-keys",
    tags=["auth"],
    route_class=DeepJsonRoute,
    dependencies=[Depends(get_current_user)],  # sólo cookie (spec §3, P-4/P-9)
    responses=problem_responses(*SESSION_ERRORS),
)


def get_agent_key_service(db: Session = Depends(get_db)) -> AgentKeyService:
    return AgentKeyService(AgentKeyRepository(db))


@router.post(
    "",
    status_code=status.HTTP_201_CREATED,
    response_model=AgentKeyCreated,
    responses=problem_responses(AgentKeyLabelTaken),
)
def create_agent_key(
    body: AgentKeyCreate,
    current_user: TokenPayload = Depends(get_current_user),
    service: AgentKeyService = Depends(get_agent_key_service),
):
    key, raw = service.create(current_user.sub, body.label)
    # El valor plano se devuelve una única vez (RF-001); no se vuelve a poder consultar.
    return AgentKeyCreated(id=key.id, label=key.label, key=raw, created_at=key.created_at)


@router.get("", response_model=list[AgentKeyOut])
def list_agent_keys(
    current_user: TokenPayload = Depends(get_current_user),
    service: AgentKeyService = Depends(get_agent_key_service),
):
    return service.list(current_user.sub)


@router.delete(
    "/{key_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    response_class=Response,
    responses=problem_responses(AgentKeyNotFound),
)
def revoke_agent_key(
    key_id: str = Path(description="Id de la key a revocar."),
    current_user: TokenPayload = Depends(get_current_user),
    service: AgentKeyService = Depends(get_agent_key_service),
):
    service.revoke(current_user.sub, key_id)
