"""Catálogo de errores de dominio (SPEC-0004 RF-003, RF-008, RF-014)."""
import ast
import re
from pathlib import Path

import pytest

from app.core import errors
from app.core.errors import DomainError

APP_DIR = Path(__file__).resolve().parents[1] / "app"
TYPE_PATTERN = re.compile(r"^urn:synapse:problem:[a-z0-9]+(-[a-z0-9]+)*$")

# Catálogo inicial de SPEC-0004 §3: clase → (slug, código HTTP).
INITIAL_CATALOG = {
    "NotAuthenticated": ("not-authenticated", 401),
    "InvalidToken": ("invalid-token", 401),
    "InvalidCredentials": ("invalid-credentials", 401),
    "InvalidRefreshToken": ("invalid-refresh-token", 401),
    "AdminRequired": ("admin-required", 403),
    "PasswordChangeRequired": ("password-change-required", 403),
    "WrongCurrentPassword": ("wrong-current-password", 400),
    "EmailTaken": ("email-taken", 409),
    "PasswordPolicyViolation": ("validation-error", 422),
    "StorageUnavailable": ("storage-unavailable", 503),
}


def _all_subclasses(cls):
    for sub in cls.__subclasses__():
        yield sub
        yield from _all_subclasses(sub)


def _catalog_entries():
    """Clases que definen su propio `slug` (una entrada del catálogo cada una)."""
    return [c for c in _all_subclasses(DomainError) if "slug" in vars(c)]


def test_every_domain_error_declares_slug_title_status_and_detail():
    for cls in _all_subclasses(DomainError):
        for attr, kind in (("slug", str), ("title", str), ("status", int), ("detail", str)):
            assert isinstance(getattr(cls, attr, None), kind), (cls.__name__, attr)
        assert 400 <= cls.status <= 599, cls.__name__


def test_types_are_well_formed_urns():
    for cls in _all_subclasses(DomainError):
        assert TYPE_PATTERN.match(cls.type_uri()), (cls.__name__, cls.type_uri())


def test_types_are_unique_across_the_catalog():
    types = [cls.type_uri() for cls in _catalog_entries()]
    assert len(types) == len(set(types)), types


def test_same_type_always_has_the_same_title_and_status():
    # Una subclase sin slug propio (p. ej. ProvisioningError) hereda type, title y código.
    by_type = {}
    for cls in _all_subclasses(DomainError):
        by_type.setdefault(cls.type_uri(), set()).add((cls.title, cls.status))
    for type_uri, variants in by_type.items():
        assert len(variants) == 1, (type_uri, variants)


@pytest.mark.parametrize("name, expected", sorted(INITIAL_CATALOG.items()))
def test_initial_catalog_entry_exists(name, expected):
    cls = getattr(errors, name)
    assert issubclass(cls, DomainError)
    assert (cls.slug, cls.status) == expected


def test_provisioning_error_is_a_storage_unavailable():
    assert issubclass(errors.ProvisioningError, errors.StorageUnavailable)


def test_internal_message_is_separate_from_public_detail():
    exc = errors.StorageUnavailable("CouchDB inaccesible: connection refused")
    assert str(exc) == "CouchDB inaccesible: connection refused"
    assert exc.public_detail == errors.StorageUnavailable.detail
    assert errors.InvalidToken(detail="Token expired").public_detail == "Token expired"


def test_only_the_problem_translator_imports_http_exception():
    """RF-008: servicios, dependencias y rutas lanzan errores de dominio, nunca HTTPException."""
    offenders = []
    for path in APP_DIR.rglob("*.py"):
        if path.relative_to(APP_DIR).as_posix() == "core/problems.py":
            continue
        for node in ast.walk(ast.parse(path.read_text())):
            names = []
            if isinstance(node, ast.ImportFrom):
                names = [alias.name for alias in node.names]
            elif isinstance(node, ast.Attribute):
                names = [node.attr]
            if "HTTPException" in names:
                offenders.append(path.relative_to(APP_DIR).as_posix())
    assert not offenders, sorted(set(offenders))
