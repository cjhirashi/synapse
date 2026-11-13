from sqlalchemy import Boolean, Column, DateTime, ForeignKey, Index, String, Text

from app.adapters.database import Base


class Notification(Base):
    """Aviso para la persona (H-053): lo escribe el servidor al ocurrir algo en una tarea; la persona lo lee en la
    pantalla de avisos. General a propósito (`kind`, `resource_type`), para que el buzón de mensajes lo use después.

    `dedupe_key` única hace idempotente la creación: el job de vencimientos puede repetirse (o reiniciarse) sin duplicar
    avisos. `url` es una ruta de la propia app (nunca externa). Las fechas son UTC naive, como el resto de tablas.
    """

    __tablename__ = "notifications"

    id = Column(String, primary_key=True)
    owner_id = Column(String, ForeignKey("users.id"), nullable=False, index=True)
    kind = Column(String(40), nullable=False)
    title = Column(String(255), nullable=False)
    body = Column(Text, nullable=True)
    vault_id = Column(String, nullable=True)
    resource_type = Column(String(40), nullable=True)
    resource_id = Column(String, nullable=True)
    url = Column(String(500), nullable=True)
    dedupe_key = Column(String(200), nullable=True, unique=True)
    read_at = Column(DateTime, nullable=True)
    pushed_at = Column(DateTime, nullable=True)  # NULL = pendiente de revisar para push; lo marca el despachador
    created_at = Column(DateTime, nullable=False)

    __table_args__ = (Index("ix_notifications_owner_unread", "owner_id", "read_at", "created_at"),)


class NotificationPref(Base):
    """Preferencias de avisos de una persona (H-053): los tipos que apagó. Sin fila, todos están activos."""

    __tablename__ = "notification_prefs"

    owner_id = Column(String, ForeignKey("users.id"), primary_key=True)
    disabled_kinds = Column(Text, nullable=False, default="[]")  # JSON: lista de `kind`
    quiet_enabled = Column(Boolean, nullable=False, default=True, server_default="true")
    quiet_start = Column(String(5), nullable=False, default="22:00", server_default="22:00")  # HH:MM en America/Mexico_City
    quiet_end = Column(String(5), nullable=False, default="07:00", server_default="07:00")


class PushSubscription(Base):
    """Dispositivo que recibe push (H-053). `endpoint` es único: reinstalar o iniciar sesión otra vez lo reasigna. Un 404/410
    del servicio de push borra la fila (la suscripción ya no existe)."""

    __tablename__ = "push_subscriptions"

    id = Column(String, primary_key=True)
    owner_id = Column(String, ForeignKey("users.id"), nullable=False, index=True)
    endpoint = Column(Text, nullable=False, unique=True)
    p256dh = Column(String(200), nullable=False)
    auth = Column(String(100), nullable=False)
    user_agent = Column(String(300), nullable=True)
    created_at = Column(DateTime, nullable=False)
    last_success_at = Column(DateTime, nullable=True)
