"""Rutas de avisos (H-053): la bandeja de la persona y sus preferencias.

Solo sesión humana (`get_current_user`): los avisos son de la persona, un agente con su clave no los lee ni los marca.
"""
from typing import Annotated

from fastapi import APIRouter, Depends, Header, Query, Response
from sqlalchemy.orm import Session

from app.adapters.database import get_db
from app.adapters.notification_repository import NotificationRepository
from app.core.dependencies import get_current_user, require_password_changed
from app.core.errors import NotificationNotFound, PasswordChangeRequired, PushInvalid
from app.core.problems import problem_responses
from app.core.schemas import (
    NotificationListOut, NotificationOut, NotificationPrefsOut, NotificationPrefsPut, PushStatusOut, PushSubscriptionIn, PushTestOut,
    TokenPayload, UnreadCountOut,
)
from app.routers.auth import SESSION_ERRORS
from app.services.notification_service import NotificationService

router = APIRouter(
    prefix="/notifications",
    tags=["notifications"],
    dependencies=[Depends(require_password_changed)],
    responses=problem_responses(*SESSION_ERRORS, PasswordChangeRequired),
)


def get_notification_service(user: TokenPayload = Depends(get_current_user), db: Session = Depends(get_db)) -> NotificationService:
    return NotificationService(NotificationRepository(db), user.sub)


@router.get("", response_model=NotificationListOut)
def list_notifications(
    unread: bool = False,
    limit: Annotated[int, Query(ge=1, le=200)] = 50,
    service: NotificationService = Depends(get_notification_service),
):
    return NotificationListOut(items=service.list(unread, limit), unread=service.unread_count())


@router.get("/unread-count", response_model=UnreadCountOut)
def unread_count(service: NotificationService = Depends(get_notification_service)):
    return UnreadCountOut(count=service.unread_count())


@router.post("/read-all", response_model=UnreadCountOut)
def read_all(service: NotificationService = Depends(get_notification_service)):
    service.mark_all_read()
    return UnreadCountOut(count=0)


@router.get("/preferences", response_model=NotificationPrefsOut)
def get_preferences(service: NotificationService = Depends(get_notification_service)):
    return NotificationPrefsOut(kinds=service.preferences(), quiet=service.quiet_hours())


@router.put("/preferences", response_model=NotificationPrefsOut, responses=problem_responses(PushInvalid))
def put_preferences(body: NotificationPrefsPut, service: NotificationService = Depends(get_notification_service)):
    kinds = service.set_preferences(body.kinds) if body.kinds else service.preferences()
    quiet = service.set_quiet_hours(body.quiet.enabled, body.quiet.start, body.quiet.end) if body.quiet else service.quiet_hours()
    return NotificationPrefsOut(kinds=kinds, quiet=quiet)


@router.get("/push", response_model=PushStatusOut)
def push_status(service: NotificationService = Depends(get_notification_service)):
    return PushStatusOut(**service.push_status())


@router.put("/push/subscription", status_code=204, responses=problem_responses(PushInvalid))
def put_subscription(
    body: PushSubscriptionIn,
    user_agent: Annotated[str | None, Header()] = None,
    service: NotificationService = Depends(get_notification_service),
):
    service.subscribe(body.endpoint, body.keys.p256dh, body.keys.auth, user_agent)
    return Response(status_code=204)


@router.delete("/push/subscription", status_code=204)
def delete_subscription(endpoint: Annotated[str, Query(min_length=1, max_length=2000)], service: NotificationService = Depends(get_notification_service)):
    service.unsubscribe(endpoint)
    return Response(status_code=204)


@router.post("/push/test", response_model=PushTestOut)
def push_test(service: NotificationService = Depends(get_notification_service)):
    return PushTestOut(**service.test_push())


@router.post("/{notification_id}/read", response_model=NotificationOut, responses=problem_responses(NotificationNotFound))
def mark_read(notification_id: str, service: NotificationService = Depends(get_notification_service)):
    return service.mark_read(notification_id)
