"""Cumplimiento del registro `AG - AGENTES` sobre las escrituras de los agentes (H-030 E6).

Una instancia por petición. Con `AGENT_ACCESS_MODE=shadow` evalúa y **solo registra** lo que decidiría
(tabla `agent_access_log`); con `enforce` rechaza con `AgentAccessDenied` (REST) o el motivo
`agent-access-denied` (sincronización); con `off` no hace nada. La sesión humana no se evalúa.

El registro de cada bóveda se lee con la vista `by_path` (una consulta) y se guarda en una caché en memoria
de proceso, válida mientras haya un solo worker de uvicorn (hoy así), con vencimiento corto y invalidación al
escribir bajo `AG - AGENTES/`.
"""
import json
import logging
import threading
import time
from collections.abc import Callable

from app.core.ag_rules import AG_AGENTES
from app.core import conversation_rules, skill_rules
from app.core.agent_access import Actor, Registration, decide, decide_files, parse_registration
from app.core.config import settings
from app.core.errors import AgentAccessDenied
from app.core.note_prefix import view_key
from app.core.ports.vault_port import VaultPort

logger = logging.getLogger(__name__)

_REGISTRY_TTL = 30.0  # segundos
_CACHE: dict[tuple[str, str], tuple[float, dict[str, Registration]]] = {}
_LOCK = threading.Lock()


def invalidate_registry(db: str, vault_id: str | None = None) -> None:
    with _LOCK:
        for key in [k for k in _CACHE if k[0] == db and (vault_id is None or k[1] == vault_id)]:
            del _CACHE[key]


def read_registry(port: VaultPort, db: str, vault_id: str) -> dict[str, Registration]:
    """Registros vigentes de la bóveda (`AG - AGENTES/<id>.md` válidos), por id de agente."""
    now = time.monotonic()
    with _LOCK:
        cached = _CACHE.get((db, vault_id))
        if cached and cached[0] > now:
            return cached[1]
    registry: dict[str, Registration] = {}
    after = None
    while True:
        docs = port.list_notes_by_prefix(db, vault_id, False, view_key(AG_AGENTES), 100, after)
        for doc in docs:
            registration = parse_registration(doc["path"], doc.get("frontmatter"))
            if registration is not None:
                registry[registration.agent_id] = registration
        if len(docs) < 100:
            break
        after = (view_key(docs[-1]["path"]), docs[-1]["_id"])
    with _LOCK:
        _CACHE[(db, vault_id)] = (now + _REGISTRY_TTL, registry)
    return registry


def _db_sink(entry: dict) -> None:
    """Escribe una fila de `agent_access_log` en su propia sesión; un fallo nunca rompe la petición."""
    from app.adapters.database import SessionLocal
    from app.core.models.agent_access_log import AgentAccessLog
    from datetime import datetime

    try:
        with SessionLocal() as session:
            session.add(AgentAccessLog(at=datetime.utcnow(), **entry))
            session.commit()
    except Exception:  # noqa: BLE001 - la bitácora es de mejor esfuerzo
        logger.warning("agent_access_log write failed", exc_info=True)


class AgentAccessGuard:
    def __init__(
        self, port: VaultPort, db: str, owner_id: str, actor: Actor,
        mode: str | None = None, sink: Callable[[dict], None] = _db_sink,
    ):
        self._port = port
        self._db = db
        self._owner_id = owner_id
        self._actor = actor
        self._mode = settings.AGENT_ACCESS_MODE if mode is None else mode
        self._sink = sink

    @property
    def enforcing(self) -> bool:
        return self._mode == "enforce"

    @property
    def active(self) -> bool:
        """¿Hay algo que evaluar? Sesión humana o modo `off`: no."""
        return self._actor.kind != "human" and self._mode in ("shadow", "enforce")

    def evaluate(
        self, vault_id: str, op: str, paths: list[str], files: bool = False
    ) -> tuple[bool, str | None]:
        """`(permitido, motivo)`; registra la decisión. No lanza: la política de qué hacer con un rechazo es de
        quien llama (REST lanza, la sincronización rechaza la revisión). `files`: escritura de archivos."""
        if not self.active:
            return True, None
        enforce = self._mode == "enforce"
        try:
            registry = read_registry(self._port, self._db, vault_id)
        except Exception:  # noqa: BLE001
            if enforce:
                raise  # con cumplimiento activo no se escribe sin poder consultar el registro (cierra en falso)
            logger.warning("agent registry unreadable in shadow mode; write allowed", exc_info=True)
            return True, "registry-unreadable"
        verdict = (decide_files(self._actor, registry, honor_declared=not enforce) if files
                   else decide(self._actor, registry, paths, honor_declared=not enforce))
        identified = self._actor.kind == "agent" or (not enforce and self._actor.declared is not None)
        self._sink({
            "owner_id": self._owner_id, "vault_id": vault_id,
            "agent_id": self._actor.agent_id or (self._actor.declared if not enforce else None),
            "key_label": self._actor.key_label,
            "declared": self._actor.kind == "general" and self._actor.declared is not None,
            "op": op, "paths": json.dumps(paths[:20], ensure_ascii=False),
            "decision": ("allow" if verdict.allowed else "deny") if identified else
                        ("allow" if verdict.allowed else "deny-general"),
            "reason": verdict.reason, "mode": self._mode,
        })
        return verdict.allowed, verdict.reason

    def check(self, vault_id: str, op: str, paths: list[str], files: bool = False) -> None:
        allowed, reason = self.evaluate(vault_id, op, paths, files=files)
        if not allowed and self._mode == "enforce":
            raise AgentAccessDenied(f"{self._actor.agent_id or 'general'} denied: {reason} {paths[:3]}")

    # --- Skills de bóveda (H-041 E3): propietario, invitados y gestores ---

    def read_registry(self, vault_id: str) -> dict[str, Registration]:
        return read_registry(self._port, self._db, vault_id)

    def evaluate_skill(
        self, vault_id: str, op: str, path: str, old: dict | None, new: dict | None,
    ) -> tuple[bool, str | None]:
        """Reglas por agente de una skill (`skill_rules.decide_skill`); mismo interruptor que el resto: en sombra solo
        registra (`op` = `skill-<op>`), con `enforce` el llamador rechaza. La sesión humana no se evalúa."""
        if not self.active:
            return True, None
        enforce = self._mode == "enforce"
        try:
            registry = read_registry(self._port, self._db, vault_id)
        except Exception:  # noqa: BLE001
            if enforce:
                raise
            logger.warning("agent registry unreadable in shadow mode; skill write allowed", exc_info=True)
            return True, "registry-unreadable"
        verdict = skill_rules.decide_skill(self._actor, registry, op, old, new, honor_declared=not enforce)
        identified = self._actor.kind == "agent" or (not enforce and self._actor.declared is not None)
        self._sink({
            "owner_id": self._owner_id, "vault_id": vault_id,
            "agent_id": self._actor.agent_id or (self._actor.declared if not enforce else None),
            "key_label": self._actor.key_label,
            "declared": self._actor.kind == "general" and self._actor.declared is not None,
            "op": f"skill-{op}", "paths": json.dumps([path], ensure_ascii=False),
            "decision": ("allow" if verdict.allowed else "deny") if identified else
                        ("allow" if verdict.allowed else "deny-general"),
            "reason": verdict.reason, "mode": self._mode,
        })
        return verdict.allowed, verdict.reason

    def check_skill(self, vault_id: str, op: str, path: str, old: dict | None, new: dict | None) -> None:
        allowed, reason = self.evaluate_skill(vault_id, op, path, old, new)
        if not allowed and self._mode == "enforce":
            detail = skill_rules.PUBLIC_DETAIL.get(reason or "")
            raise AgentAccessDenied(
                f"{self._actor.agent_id or 'general'} denied: {reason} {path}", **({"detail": detail} if detail else {}))

    # --- Conversaciones de AG - MENSAJES (H-042): quién escribe cada mensaje y quién cierra ---

    def evaluate_mensaje(
        self, vault_id: str, op: str, info: conversation_rules.MensajePath, first_message: bool,
    ) -> tuple[bool, str | None]:
        """Reglas por agente de una conversación (`conversation_rules.decide_mensaje`); mismo interruptor que el resto: en
        sombra solo registra (`op` = `mensaje-<op>`), con `enforce` el llamador rechaza. No consulta `AG - AGENTES`: un
        agente de solo lectura puede abrir y responder conversaciones. La sesión humana no se evalúa."""
        if not self.active:
            return True, None
        enforce = self._mode == "enforce"
        verdict = conversation_rules.decide_mensaje(
            self._actor, op, info, first_message=first_message, honor_declared=not enforce)
        identified = self._actor.kind == "agent" or (not enforce and self._actor.declared is not None)
        self._sink({
            "owner_id": self._owner_id, "vault_id": vault_id,
            "agent_id": self._actor.agent_id or (self._actor.declared if not enforce else None),
            "key_label": self._actor.key_label,
            "declared": self._actor.kind == "general" and self._actor.declared is not None,
            "op": f"mensaje-{op}", "paths": json.dumps([f"{info.folder}/…"], ensure_ascii=False),
            "decision": ("allow" if verdict.allowed else "deny") if identified else
                        ("allow" if verdict.allowed else "deny-general"),
            "reason": verdict.reason, "mode": self._mode,
        })
        return verdict.allowed, verdict.reason

    def check_mensaje(self, vault_id: str, op: str, info: conversation_rules.MensajePath, first_message: bool) -> None:
        allowed, reason = self.evaluate_mensaje(vault_id, op, info, first_message)
        if not allowed and self._mode == "enforce":
            detail = conversation_rules.PUBLIC_DETAIL.get(reason or "")
            raise AgentAccessDenied(
                f"{self._actor.agent_id or 'general'} denied: {reason} {info.folder}",
                **({"detail": detail} if detail else {}))
