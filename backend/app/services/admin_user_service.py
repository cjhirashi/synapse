"""Gestión de cuentas por el administrador (H-060): alta con contraseña base, límites, baja con gracia, recuperación y roles.

Quién puede qué: el super admin gestiona a cualquiera; el admin solo a los invitados. Nadie se elimina ni se cambia el rol a
sí mismo, y siempre queda al menos un super admin activo. Eliminar no borra: la cuenta queda inactiva (sin sesiones) y puede
recuperarse hasta `GRACE_DAYS` días; la purga definitiva es de `user_purge_service`.
"""
from datetime import datetime, timedelta

from sqlalchemy.orm import Session

from app.core.errors import (
    EmailTaken, StorageUnavailable, UserActionForbidden, UserNotFound, UserStateConflict,
)
from app.core.limits import GRACE_DAYS, ROLE_ADMIN, ROLE_GUEST, ROLE_SUPER_ADMIN, UserLimits
from app.core.models.limit_grace import LimitGrace
from app.core.models.user import User
from app.core.schemas import (
    AdminUserOut, CreateUserRequest, GraceOut, UpdateLimitsRequest, UserLimitsOut, UserUsageOut, VaultUsageOut,
)
from app.core.security import normalize_email
from app.services import limit_usage
from app.services.auth_service import ROLE_IDS, AuthService
from app.services.limit_reconcile_service import LimitReconcileService
from app.core.ports.vault_port import VaultPort


def _iso(value: datetime | None) -> str | None:
    return None if value is None else value.isoformat(timespec="seconds") + "Z"


class AdminUserService:
    def __init__(
        self, session: Session, auth: AuthService, port: VaultPort, reconcile: LimitReconcileService,
        actor_id: str, actor_role: str,
    ) -> None:
        self._session = session
        self._auth = auth
        self._port = port
        self._reconcile = reconcile
        self._actor_id = actor_id
        self._actor_role = actor_role

    # --- Lectura ---

    def list_all(self) -> list[AdminUserOut]:
        users = self._session.query(User).order_by(User.created_at.asc()).all()
        grace: dict[str, list[LimitGrace]] = {}
        for row in self._session.query(LimitGrace).all():
            grace.setdefault(row.user_id, []).append(row)
        return [self._out(user, grace.get(user.id, [])) for user in users if self._visible(user)]

    def _visible(self, user: User) -> bool:
        return self._actor_role == ROLE_SUPER_ADMIN or user.role.name == ROLE_GUEST

    def _out(self, user: User, grace: list[LimitGrace]) -> AdminUserOut:
        try:
            vaults_used: int | None = len(limit_usage.active_vaults(self._port, user.couchdb_name))
        except StorageUnavailable:
            vaults_used = None
        return AdminUserOut(
            id=user.id, email=user.email, role=user.role.name, display_name=user.display_name,
            must_change_password=user.must_change_password, created_at=_iso(user.created_at),
            deleted_at=_iso(user.deleted_at),
            purge_at=_iso(user.deleted_at + timedelta(days=GRACE_DAYS)) if user.deleted_at else None,
            limits=UserLimitsOut(
                max_vaults=user.max_vaults, max_notes_per_vault=user.max_notes_per_vault,
                max_storage_bytes_per_vault=user.max_storage_bytes_per_vault),
            vaults_used=vaults_used,
            storage_bytes=limit_usage.storage_total(self._session, user.id),
            grace=[GraceOut(kind=row.kind, vault_id=row.vault_id, deadline_at=_iso(row.deadline_at))
                   for row in sorted(grace, key=lambda r: r.deadline_at)])

    def usage(self, user_id: str) -> UserUsageOut:
        """Uso por bóveda (documentos y bytes) y totales de una cuenta que el actor puede ver. Solo lectura."""
        user = self._target(user_id)
        vaults = limit_usage.active_vaults(self._port, user.couchdb_name)
        rows = []
        for doc in vaults:
            vault_id = doc["_id"].removeprefix("vault:")
            rows.append(VaultUsageOut(
                vault_id=vault_id, name=doc.get("name", ""),
                documents=len(limit_usage.user_notes(self._port, user.couchdb_name, vault_id)),
                storage_bytes=limit_usage.storage_bytes(self._session, vault_id)))
        return UserUsageOut(
            vaults=rows, documents_total=sum(r.documents for r in rows),
            storage_bytes_total=limit_usage.storage_total(self._session, user.id))

    # --- Permisos ---

    def _target(self, user_id: str) -> User:
        """La cuenta a gestionar. Para un admin, una cuenta que no puede ver es una cuenta que no existe."""
        user = self._session.get(User, user_id)
        if user is None or not self._visible(user):
            raise UserNotFound(user_id)
        return user

    def _others_only(self, user: User) -> None:
        if user.id == self._actor_id:
            raise UserActionForbidden("self")

    def _keep_a_super_admin(self, user: User) -> None:
        if user.role.name != ROLE_SUPER_ADMIN:
            return
        remaining = (
            self._session.query(User)
            .filter(User.role_id == ROLE_IDS[ROLE_SUPER_ADMIN], User.deleted_at.is_(None), User.id != user.id)
            .count())
        if remaining == 0:
            raise UserActionForbidden("last super admin")

    # --- Escritura ---

    def create(self, body: CreateUserRequest) -> AdminUserOut:
        if body.role != ROLE_GUEST and self._actor_role != ROLE_SUPER_ADMIN:
            raise UserActionForbidden("only a super admin creates admins")
        limits = UserLimits(body.max_vaults, body.max_notes_per_vault, body.max_storage_bytes_per_vault)
        user = self._auth.create_user(body.email, body.role, limits)
        return self._out(user, [])

    def set_limits(self, user_id: str, body: UpdateLimitsRequest) -> AdminUserOut:
        user = self._target(user_id)
        if user.role.name != ROLE_GUEST:
            raise UserActionForbidden("only guests have limits")
        if user.deleted_at is not None:
            raise UserStateConflict("deleted account")
        for field in body.model_fields_set:
            setattr(user, field, getattr(body, field))
        self._session.commit()
        self._reconcile.refresh(user)
        return self._out(user, self._session.query(LimitGrace).filter(LimitGrace.user_id == user.id).all())

    def delete(self, user_id: str) -> AdminUserOut:
        user = self._target(user_id)
        self._others_only(user)
        if user.deleted_at is not None:
            raise UserStateConflict("already deleted")
        self._keep_a_super_admin(user)
        user.deleted_at = datetime.utcnow()
        user.is_active = False
        user.token_version += 1  # los tokens de acceso vigentes dejan de valer
        self._auth.repo.revoke_refresh_tokens(user.id)
        self._session.commit()
        return self._out(user, [])

    def restore(self, user_id: str) -> AdminUserOut:
        user = self._target(user_id)
        if user.deleted_at is None:
            raise UserStateConflict("not deleted")
        user.deleted_at = None
        user.is_active = True
        self._session.commit()
        return self._out(user, [])

    def set_role(self, user_id: str, role: str) -> AdminUserOut:
        """Solo el super admin (lo exige el router). Cambia admin ⇄ invitado; los límites del invitado quedan como estaban."""
        user = self._target(user_id)
        self._others_only(user)
        if user.deleted_at is not None:
            raise UserStateConflict("deleted account")
        if user.role.name == ROLE_SUPER_ADMIN:
            raise UserActionForbidden("a super admin keeps the role")
        user.role_id = ROLE_IDS[role]
        user.token_version += 1  # el rol viaja en el token: obliga a entrar de nuevo
        self._auth.repo.revoke_refresh_tokens(user.id)
        self._session.commit()
        self._session.refresh(user)
        self._reconcile.refresh(user)
        return self._out(user, self._session.query(LimitGrace).filter(LimitGrace.user_id == user.id).all())
