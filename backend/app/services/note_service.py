"""Reservas de ruta de las notas (SPEC-0008 RF-011, RF-013, RF-017; PLAN-0008 §2.2).

Las notas no tienen API REST (P-1): se escriben en la réplica del cliente y llegan por el
push de `/sync`. Este servicio sólo decide la unicidad de `path` por bóveda, con el mismo
mecanismo que los nombres de bóveda (`reservations.py`): el documento
`note-path:{vault_id}:{path_key}` (`{_id, type: "note-path", note_id, reserved_at}`) apunta a
la nota que usa la ruta. Es un documento sólo del servidor: nunca viaja por el canal.
"""
from collections.abc import Callable

from app.core.note_rules import path_key
from app.core.ports.vault_port import VaultPort
from app.core.timestamps import utc_now
from app.services.reservations import ReservationTaken, Reservations


class NotePathTaken(Exception):
    """La ruta ya la usa otra nota de la bóveda (RF-013). Interna de `services/`: el push la
    traduce al rechazo `note-path-taken`."""


def _reservation_id(note_id: str, path: str) -> str:
    """`note-path:{vault_id}:{path_key}`; el `vault_id` es el primer UUID del id de la nota."""
    vault_id = note_id.split(":")[1]
    return f"note-path:{vault_id}:{path_key(path)}"


class NoteService:
    """Reservas de ruta sobre la base de un usuario (una instancia por petición).

    Una reserva bloquea si la nota que la tiene usa todavía la ruta, o si sigue dentro de su
    arrendamiento. "Usa" se mide sobre **todas las hojas vivas** de la nota (como con las
    bóvedas, SPEC-0005 RF-008): una rama perdedora llegada por la sincronización puede ganar
    al resolverse el conflicto, y su ruta debe seguir reservada. Una hoja en la papelera
    (`deleted_at`) no usa su ruta: restaurarla la vuelve a reservar (RF-017).
    """

    def __init__(self, port: VaultPort, db: str, clock: Callable[[], str] = utc_now):
        self._port = port
        self._db = db
        self._reservations = Reservations(
            port, db, clock, kind="note-path", owner_field="note_id")

    def _holder(self, reservation: dict, path: str) -> bool:
        """¿Alguna hoja viva y activa de la nota de la reserva usa una ruta equivalente a `path`?"""
        key = path_key(path)
        return any(
            leaf.get("type") == "note"
            and not leaf.get("deleted_at")
            and path_key(leaf["path"]) == key
            for leaf in self._port.leaves(self._db, reservation["note_id"])
        )

    def reserve_path(self, note_id: str, path: str) -> None:
        """Reserva `path` para la nota `note_id` o lanza `NotePathTaken` (RF-013).

        Siempre se reescribe, también cuando ya es de esta nota (ver `Reservations.reserve`).
        """
        try:
            self._reservations.reserve(
                _reservation_id(note_id, path), note_id,
                lambda reservation: self._holder(reservation, path))
        except ReservationTaken as taken:
            raise NotePathTaken(str(taken)) from None

    def release_path(self, note_id: str, path: str) -> None:
        """Libera la ruta que la nota dejó (renombrada o borrada); mejor esfuerzo (RF-011)."""
        self._reservations.release(
            _reservation_id(note_id, path), note_id,
            lambda reservation: self._holder(reservation, path))
