"""H-064 F2: validación de concesiones de membresía (reglas puras)."""
import pytest

from app.core.vault_member_rules import check_grants


class TestGrantsValidation:
    """Validación de concesiones: formato, carpetas, niveles."""

    def test_valid_single_grant_full_vault(self):
        grants = [{"folder": "*", "level": "lectura"}]
        assert check_grants(grants) is None

    def test_valid_folder_path(self):
        grants = [{"folder": "Proyectos/Synapse", "level": "escritura"}]
        assert check_grants(grants) is None

    def test_valid_deep_folder(self):
        grants = [{"folder": "a/b/c/d/e", "level": "lectura"}]
        assert check_grants(grants) is None

    def test_valid_multiple_grants(self):
        grants = [
            {"folder": "*", "level": "lectura"},
            {"folder": "Proyectos", "level": "escritura"},
            {"folder": "Notas/Personales", "level": "lectura"},
        ]
        assert check_grants(grants) is None

    def test_max_100_grants(self):
        grants = [{"folder": f"carpeta{i}", "level": "lectura"} for i in range(100)]
        assert check_grants(grants) is None

    def test_empty_grants_invalid(self):
        assert check_grants([]) is not None
        assert check_grants(None) is not None

    def test_too_many_grants(self):
        grants = [{"folder": f"carpeta{i}", "level": "lectura"} for i in range(101)]
        assert check_grants(grants) is not None

    def test_invalid_level(self):
        grants = [{"folder": "*", "level": "admin"}]
        assert check_grants(grants) is not None

    def test_valid_levels(self):
        for level in ["lectura", "escritura"]:
            grants = [{"folder": "*", "level": level}]
            assert check_grants(grants) is None

    def test_folder_leading_slash(self):
        grants = [{"folder": "/Proyectos", "level": "lectura"}]
        assert check_grants(grants) is not None

    def test_folder_trailing_slash(self):
        grants = [{"folder": "Proyectos/", "level": "lectura"}]
        assert check_grants(grants) is not None

    def test_folder_empty_segment(self):
        grants = [{"folder": "Proyectos//Synapse", "level": "lectura"}]
        assert check_grants(grants) is not None

    def test_folder_whitespace_only_segment(self):
        grants = [{"folder": "Proyectos/ /Synapse", "level": "lectura"}]
        assert check_grants(grants) is not None

    def test_folder_dot(self):
        grants = [{"folder": ".", "level": "lectura"}]
        assert check_grants(grants) is not None

    def test_folder_dotdot(self):
        grants = [{"folder": "..", "level": "lectura"}]
        assert check_grants(grants) is not None

    def test_folder_with_dot_in_path(self):
        grants = [{"folder": "a/./b", "level": "lectura"}]
        assert check_grants(grants) is not None

    def test_folder_with_dotdot_in_path(self):
        grants = [{"folder": "a/../b", "level": "lectura"}]
        assert check_grants(grants) is not None

    def test_folder_control_character(self):
        grants = [{"folder": "a\x00b", "level": "lectura"}]
        assert check_grants(grants) is not None

    def test_folder_max_length(self):
        # 600 caracteres es válido
        folder = "a/" * 300  # 600 caracteres incluyendo barras
        folder = folder.rstrip("/")
        if len(folder) == 599:
            folder = "a" + folder
        grants = [{"folder": folder, "level": "lectura"}]
        assert check_grants(grants) is None

    def test_folder_exceeds_max_length(self):
        folder = "a/" * 301
        folder = folder.rstrip("/")
        grants = [{"folder": folder, "level": "lectura"}]
        assert check_grants(grants) is not None

    def test_reserved_folder_ag_agentes(self):
        grants = [{"folder": "AG - AGENTES", "level": "lectura"}]
        assert check_grants(grants) is not None

    def test_reserved_folder_ag_skills(self):
        grants = [{"folder": "AG - SKILLS", "level": "lectura"}]
        assert check_grants(grants) is not None

    def test_reserved_folder_ag_mensajes(self):
        grants = [{"folder": "AG - MENSAJES", "level": "lectura"}]
        assert check_grants(grants) is not None

    def test_reserved_folder_bitacora(self):
        grants = [{"folder": "BITACORA", "level": "lectura"}]
        assert check_grants(grants) is not None

    def test_reserved_folder_plantillas(self):
        grants = [{"folder": "PLANTILLAS", "level": "lectura"}]
        assert check_grants(grants) is not None

    def test_reserved_folder_case_insensitive_ag_agentes(self):
        # La validación usa path_key (casefold + NFKC), así que "ag - agentes" debería ser rechazado
        grants = [{"folder": "ag - agentes", "level": "lectura"}]
        assert check_grants(grants) is not None

    def test_reserved_folder_subfolder(self):
        # No se puede conceder subcarpeta de reservada
        grants = [{"folder": "AG - AGENTES/algo", "level": "lectura"}]
        assert check_grants(grants) is not None

    def test_duplicate_folders(self):
        grants = [
            {"folder": "Proyectos", "level": "lectura"},
            {"folder": "Proyectos", "level": "escritura"},
        ]
        assert check_grants(grants) is not None

    def test_non_dict_grant(self):
        grants = ["invalid"]
        assert check_grants(grants) is not None

    def test_missing_folder_key(self):
        grants = [{"level": "lectura"}]
        assert check_grants(grants) is not None

    def test_missing_level_key(self):
        grants = [{"folder": "Proyectos"}]
        assert check_grants(grants) is not None

    def test_folder_as_non_string(self):
        grants = [{"folder": 123, "level": "lectura"}]
        assert check_grants(grants) is not None

    def test_level_as_non_string(self):
        grants = [{"folder": "Proyectos", "level": 123}]
        assert check_grants(grants) is not None

    def test_folder_whitespace_stripped(self):
        # Un folder con espacios a los lados en segmentos se valida igual que sin ellos
        # pero la validación no normaliza, así que "Proyectos " (con espacio) debería fallar
        # porque split("/") da segmentos con espacios, y `strip()` los quitaría pero no es automático
        grants = [{"folder": "Proyectos ", "level": "lectura"}]
        # Dependiendo de la implementación, esto podría ser válido o no
        # Revisemos: check_grants NO normaliza, así que "Proyectos " es un segmento válido
        # a menos que la regla de "no segmentos vacíos" lo rechace (no lo hace)
        # Por lo tanto, debería ser válido (aunque la ruta sea anormal)
        assert check_grants(grants) is None

    def test_folder_single_char(self):
        grants = [{"folder": "a", "level": "lectura"}]
        assert check_grants(grants) is None

    def test_folder_numbers_and_symbols(self):
        grants = [{"folder": "2024-11-19_project", "level": "lectura"}]
        assert check_grants(grants) is None

    def test_folder_unicode(self):
        grants = [{"folder": "Proyectos/español", "level": "lectura"}]
        assert check_grants(grants) is None
