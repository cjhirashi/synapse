"""Pruebas del validador ETag débil y fuerte según RFC 7232."""

import pytest
from app.core.etag import etag_matches


class TestEtagMatches:
    """Casos del paso 1, H-038."""

    def test_strong_etag_match(self):
        """Etag fuerte igual: debe pasar."""
        assert etag_matches('"abc123"', "abc123") is True

    def test_weak_etag_match(self):
        """Etag débil igual (W/ + valor): debe pasar."""
        assert etag_matches('W/"abc123"', "abc123") is True

    def test_etag_mismatch(self):
        """Etag distinto: debe fallar."""
        assert etag_matches('"old-rev"', "new-rev") is False

    def test_no_quotes(self):
        """Sin comillas: debe fallar."""
        assert etag_matches('abc123', "abc123") is False

    def test_lowercase_weak_prefix(self):
        """Prefijo w/ minúscula (no RFC): debe fallar."""
        assert etag_matches('w/"abc123"', "abc123") is False

    def test_empty_string(self):
        """Cadena vacía: debe fallar."""
        assert etag_matches('', "abc123") is False

    def test_asterisk(self):
        """Asterisco (*): debe fallar."""
        assert etag_matches('*', "abc123") is False

    def test_whitespace_around(self):
        """Espacios alrededor: se recortan y luego se evalúa."""
        assert etag_matches('  "abc123"  ', "abc123") is True
        assert etag_matches('  W/"abc123"  ', "abc123") is True
