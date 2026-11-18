"""H-060: los límites de la cuenta también rigen en la sincronización (bóvedas y notas nuevas del lote).

Zona de coordinación: sin CouchDB ni HTTP, con el doble `InMemoryCouch` de la sincronización.
"""
import uuid

import pytest

from app.core.limits import UserLimits
from app.services.limit_guard import LimitGuard
from app.services.note_service import NoteService
from app.services.sync_push import SyncPushService
from app.services.vault_service import VaultService
from tests.test_note_sync_push import _note, _note_id
from tests.test_sync_push import DB, OWNER, InMemoryCouch, _rejected, _vault
from tests.test_vault_service import TickingClock

pytestmark = pytest.mark.asyncio


def _push(couch, limits: UserLimits) -> SyncPushService:
    clock = TickingClock()
    return SyncPushService(
        VaultService(couch, DB, clock=clock), NoteService(couch, DB, clock), couch, couch, DB, OWNER,
        limit_guard=LimitGuard(limits, couch, DB))


async def test_a_new_vault_over_the_limit_is_rejected_with_a_fixed_reason():
    couch = InMemoryCouch()
    push = _push(couch, UserLimits(max_vaults=1))
    first, second = _vault(name="Una"), _vault(name="Dos")
    assert await push.push([first]) == []
    assert await push.push([second]) == [_rejected(second, "vault-limit-reached")]


async def test_vaults_of_the_same_batch_count_against_the_limit():
    push = _push(InMemoryCouch(), UserLimits(max_vaults=1))
    first, second = _vault(name="Una"), _vault(name="Dos")
    assert await push.push([first, second]) == [_rejected(second, "vault-limit-reached")]


async def test_editing_an_existing_vault_is_not_a_new_vault():
    push = _push(InMemoryCouch(), UserLimits(max_vaults=1))
    doc = _vault(name="Una")
    assert await push.push([doc]) == []
    edit = _vault(doc["_id"], rev="2-bbb", parents=("1-aaa",), name="Renombrada")
    assert await push.push([edit]) == []


async def test_new_notes_over_the_limit_are_rejected():
    couch = InMemoryCouch()
    push = _push(couch, UserLimits(max_notes_per_vault=2))
    vault_id = str(uuid.uuid4())
    assert await push.push([_vault(f"vault:{vault_id}", name="Notas")]) == []
    notes = [_note(_note_id(vault_id), path=f"n{i}.md") for i in range(3)]
    assert await push.push(notes) == [_rejected(notes[2], "document-limit-reached")]


async def test_no_limits_means_no_guard_work():
    push = _push(InMemoryCouch(), UserLimits())
    docs = [_vault(name=f"V{i}") for i in range(5)]
    assert await push.push(docs) == []
