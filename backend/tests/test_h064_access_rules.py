"""H-064 F3: reglas puras del acceso de un miembro invitado, por carpeta y nivel."""
import pytest

from app.core.vault_access import Grant, MemberAccess, can_read, can_write, level_of


def access(*grants: tuple[str, str]) -> MemberAccess:
    return MemberAccess(tuple(Grant(folder, level) for folder, level in grants))


@pytest.mark.parametrize("path", ["Inbox.md", "Pub/a.md", "a/b/c/d.md", "BITACORA.md", "AG - AGENTES.md"])
def test_star_reads_the_whole_vault_including_root_notes(path):
    assert level_of(access(("*", "lectura")), path) == "lectura"
    assert level_of(access(("*", "escritura")), path) == "escritura"


@pytest.mark.parametrize("path", [
    "AG - AGENTES/aira.md", "ag - skills/skill-x.md", "BITACORA/2026-11/2026-11-19.md", "AG - MENSAJES/a → b - x - 2026/1.md",
    "ＡＧ - AGENTES/aira.md", "bitacora/x.md",
])
def test_hidden_zones_are_never_visible_even_with_star_write(path):
    everything = access(("*", "escritura"))
    assert level_of(everything, path) is None
    assert not can_read(everything, path) and not can_write(everything, path)


def test_templates_are_readable_by_any_member_and_writable_by_none():
    for member in (access(("*", "escritura")), access(("Pub", "escritura")), access(("Pub", "lectura"))):
        assert level_of(member, "PLANTILLAS/plantilla-nota.md") == "lectura"
        assert not can_write(member, "PLANTILLAS/plantilla-nota.md")


@pytest.mark.parametrize("path, level", [
    ("Pub/a.md", "escritura"), ("pub/a.md", "escritura"), ("PUB/sub/deep/a.md", "escritura"), ("ＰＵＢ/a.md", "escritura"),
    ("Pub.md", None), ("Pub2/a.md", None), ("Otra/Pub/a.md", None), ("Priv/c.md", None), ("root.md", None),
])
def test_a_folder_grant_covers_only_that_folder_with_path_key_equivalence(path, level):
    assert level_of(access(("Pub", "escritura")), path) == level


def test_the_most_specific_or_highest_level_wins_and_write_includes_read():
    member = access(("a", "lectura"), ("a/b", "escritura"))
    assert level_of(member, "a/b/x.md") == "escritura"
    assert level_of(member, "a/c/x.md") == "lectura"
    assert level_of(member, "a/x.md") == "lectura"
    assert can_read(member, "a/b/x.md") and can_write(member, "a/b/x.md") and not can_write(member, "a/c/x.md")


def test_no_grants_means_no_access_at_all():
    nothing = access()
    assert level_of(nothing, "Pub/a.md") is None and level_of(nothing, "root.md") is None
    assert level_of(nothing, "PLANTILLAS/plantilla-nota.md") == "lectura"
