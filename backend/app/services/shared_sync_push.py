"""Push de invitado en bóveda compartida (H-064 F7b): `POST /sync/shared/{vault_id}/db/_bulk_docs`.

Subclase de `SyncPushService` que antepone una guarda del invitado (acceso restringido a su carpeta y nivel).
"""
from app.core.vault_access import can_write, MemberAccess
from app.services.sync_push import Rejected, SyncPushService, _history, _rejection


class SharedPushService(SyncPushService):
    """Valida y escribe un lote de invitado en la base del propietario, solo para notas de la bóveda."""

    def __init__(self, *args, vault_id: str, access: MemberAccess, **kwargs):
        super().__init__(*args, **kwargs)
        self._vault_id = vault_id
        self._access = access

    async def _member_check(self, doc: dict) -> None:
        """Guarda del invitado, antes de cualquier otra validación: solo notas de esta bóveda, con la ruta nueva y las
        actuales con escritura, y sin cambiar de ruta (mover o renombrar es del propietario)."""
        doc_id = doc.get("_id")
        if not isinstance(doc_id, str) or not doc_id.startswith(f"note:{self._vault_id}:"):
            raise Rejected("share-forbidden:vault")

        leaves = await self._projected(doc["_id"])
        history = _history(doc)
        previous = leaves.get(history[1]) if len(history) > 1 else None

        if doc.get("_deleted") is True:
            # Lápida: rutas de referencia del documento anterior o de todas las hojas vivas.
            refs = [previous.get("path")] if previous is not None else [leaf.get("path") for leaf in leaves.values()]
            if not refs or not all(isinstance(ref, str) and can_write(self._access, ref) for ref in refs):
                raise Rejected("share-forbidden:path")  # «no existe» y «no puedes escribirla» se responden igual
            return

        # Revisión viva: ruta debe ser string y dar escritura.
        path = doc.get("path")
        if not isinstance(path, str):
            return  # El flujo normal la rechaza por forma.
        if not can_write(self._access, path):
            raise Rejected("share-forbidden:path")

        # Referencias de ruta: la nota vive hoy donde el invitado puede escribir y no se mueve.
        refs = [previous.get("path")] if previous is not None else [leaf.get("path") for leaf in leaves.values()]
        for ref in refs:
            if not isinstance(ref, str) or not can_write(self._access, ref):
                raise Rejected("share-forbidden:path")
            if ref != path:
                raise Rejected("share-forbidden:move")

    async def _accept(self, doc: dict) -> None:
        """Antepone la guarda del invitado antes de delegar en la validación del propietario."""
        await self._member_check(doc)
        await super()._accept(doc)

    async def _push_index_deletions(self, deferred: list[tuple[int, dict]], rejections: dict[int, dict],
                                      stored: dict[str, set[str]]) -> list[dict]:
        """Aplica guarda del invitado a cada eliminación de INDICE antes de delegar."""
        filtered: list[tuple[int, dict]] = []
        for position, doc in deferred:
            try:
                await self._member_check(doc)
                filtered.append((position, doc))
            except Rejected as rejected:
                rejections[position] = _rejection(doc, rejected.reason)

        return await super()._push_index_deletions(filtered, rejections, stored)
