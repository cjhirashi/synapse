"""Reservas de unicidad en la base de un usuario (SPEC-0003 RF-021, SPEC-0008 RF-013).

El algoritmo de `vault-name:*` (PLAN-0003 §12, §15; PLAN-0005 P-4), extraído de
`VaultService` sin cambiarlo para que lo compartan los nombres de bóveda y las rutas de nota
(`note-path:*`). Una reserva es un documento `{_id, type, <owner_field>, reserved_at}` que
apunta a quien la tiene. Lo que cambia entre usos es el predicado `holds(reservation)`:
¿sigue usando su dueño actual esa clave?

Una reserva **bloquea** si su dueño actual la usa (`holds`) o si todavía está dentro de su
arrendamiento (`RESERVATION_LEASE`): la reserva se escribe antes que el documento al que
protege, y sin el arrendamiento una escritura en curso no se distingue de una que falló.
Fuera de esos casos es huérfana y se reasigna.
"""
from collections.abc import Callable
from datetime import timedelta

from app.core.errors import RevisionConflict, StorageUnavailable
from app.core.ports.vault_port import VaultPort
from app.core.timestamps import parse_timestamp

# Arrendamiento de una reserva (PLAN-0003 §12): más de 3× el timeout de 10 s del adaptador,
# así que cubre cualquier escritura que siga en curso.
RESERVATION_LEASE = timedelta(seconds=30)


class ReservationTaken(Exception):
    """La clave la tiene otro dueño. Excepción interna de `services/`: cada tipo la traduce
    a su error de dominio (`VaultNameTaken`, `NotePathTaken`)."""


class Reservations:
    """Reservas de un tipo (`kind`) cuyo dueño se guarda en el campo `owner_field`."""

    def __init__(self, port: VaultPort, db: str, clock: Callable[[], str],
                 kind: str, owner_field: str):
        self._port = port
        self._db = db
        self._clock = clock
        self._kind = kind
        self._owner_field = owner_field

    def leased(self, reservation: dict) -> bool:
        """¿La reserva sigue dentro de su arrendamiento? (puede haber una escritura en curso)."""
        age = parse_timestamp(self._clock()) - parse_timestamp(reservation["reserved_at"])
        return age < RESERVATION_LEASE

    def reserve(self, reservation_id: str, owner: str, holds: Callable[[dict], bool],
                extra: dict | None = None) -> None:
        """Escribe la reserva `reservation_id` para `owner` o lanza `ReservationTaken`.

        La reserva siempre se escribe, también cuando ya es de este dueño (p. ej. al
        restaurar sin haberla liberado): el `_rev` nuevo hace chocar una liberación tardía
        que la leyó antes (PLAN-0003 §15, VA-1). Concurrencia optimista: si la escritura
        choca, se vuelve a leer y a decidir con el estado nuevo. Cada vuelta exige que otra
        petición haya escrito la reserva entre medias, así que el bucle no gira solo.
        `extra` son campos adicionales del documento (p. ej. la clave de la que sale el id).
        """
        rev = None  # primer intento sin leer: crear la reserva (el caso común)
        while True:
            reservation = {
                "_id": reservation_id, "type": self._kind, self._owner_field: owner,
                "reserved_at": self._clock(), **(extra or {}),
            }
            if rev is not None:
                reservation["_rev"] = rev
            try:
                self._port.put(self._db, reservation)
                return
            except RevisionConflict:
                pass
            current = self._port.get(self._db, reservation_id)
            if current is None:
                rev = None  # la borraron entre medias: se vuelve a crear
                continue
            taken = current[self._owner_field] != owner and (
                holds(current) or self.leased(current)
            )
            if taken:
                raise ReservationTaken(f"{reservation_id} held by {current[self._owner_field]}")
            rev = current["_rev"]  # propia o huérfana: se reescribe sobre su `_rev`

    def release(self, reservation_id: str, owner: str, holds: Callable[[dict], bool]) -> None:
        """Borra la reserva de `owner` si ya no la usa; mejor esfuerzo: un fallo la deja huérfana.

        Sólo se borra una reserva que sigue apuntando a `owner`: si otro dueño ya la
        reasignó, su escritura puede estar en curso y borrarla dejaría la clave sin reserva
        (PLAN-0003 §12). Y se comprueba el uso porque, entre la escritura y esta liberación,
        otra petición puede haber vuelto a tomar la clave para el mismo dueño.
        """
        try:
            current = self._port.get(self._db, reservation_id)
            if (
                current is not None
                and current[self._owner_field] == owner
                and not holds(current)
            ):
                self._port.delete(self._db, reservation_id, current["_rev"])
        except (RevisionConflict, StorageUnavailable):
            pass
