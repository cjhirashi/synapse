"""H-040: bloque YAML al inicio del cuerpo -> atributos (reglas puras)."""
import pytest

from app.core.attribute_rules import validate_general
from app.core.body_yaml import merge_yaml_into_frontmatter, plan_note, split_body_yaml


def _doc(content, frontmatter=None):
    return {"_id": "note:v:n", "_rev": "1-a", "type": "note", "content": content, "frontmatter": frontmatter or {}}


class TestSplitBodyYaml:
    def test_simple(self):
        data, rest = split_body_yaml("---\ntitulo: T\ntags:\n  - a\n  - b\n---\nResto")
        assert data == {"titulo": "T", "tags": ["a", "b"]}
        assert rest == "Resto"

    def test_bom(self):
        assert split_body_yaml("﻿---\ntitulo: T\n---\nResto") == ({"titulo": "T"}, "Resto")

    def test_crlf_conserva_los_saltos_del_cuerpo(self):
        data, rest = split_body_yaml("---\r\ntitulo: T\r\n---\r\n\r\nLinea 1\r\nLinea 2\r\n")
        assert data == {"titulo": "T"}
        assert rest == "Linea 1\r\nLinea 2\r\n"

    def test_cierre_con_puntos(self):
        assert split_body_yaml("---\ntitulo: T\n...\nResto") == ({"titulo": "T"}, "Resto")

    def test_bloque_vacio(self):
        assert split_body_yaml("---\n---\nResto") == ({}, "Resto")

    def test_quita_lineas_en_blanco_entre_bloque_y_texto(self):
        assert split_body_yaml("---\ntitulo: T\n---\n\n\n  \nResto\n\n") == ({"titulo": "T"}, "Resto\n\n")

    def test_sin_texto_detras(self):
        assert split_body_yaml("---\ntitulo: T\n---\n") == ({"titulo": "T"}, "")

    @pytest.mark.parametrize("content,motivo", [
        ("---\n- a\n- b\n---\nResto", "no-es-mapeo"),
        ("---\nsolo texto\n---\nResto", "no-es-mapeo"),
        ("---\na: [sin cerrar\n---\nResto", "yaml-invalido"),
        ("---\ntitulo: T\nsin cierre", "sin-cierre"),
        ("Texto\n---\ntitulo: T\n---", "no-empieza-por-yaml"),
        ("\n---\ntitulo: T\n---\nResto", "no-empieza-por-yaml"),  # regla horizontal tras línea en blanco
        ("----\ntitulo: T\n---\nResto", "no-empieza-por-yaml"),
        ("---titulo\nx: 1\n---\n", "no-empieza-por-yaml"),
        ("", "no-empieza-por-yaml"),
    ])
    def test_no_migrables(self, content, motivo):
        assert split_body_yaml(content) == (None, motivo)

    def test_fechas_y_claves_no_texto(self):
        data, _ = split_body_yaml("---\nfecha: 2026-11-03\n7: siete\nlista: [2026-01-02]\n---\n")
        assert data == {"fecha": "2026-11-03", "7": "siete", "lista": ["2026-01-02"]}

    def test_datetime_y_conjuntos_son_json(self):
        data, _ = split_body_yaml("---\nt: 2026-11-03 10:00:00\ns: !!set {a, b}\n---\n")
        assert data["t"].startswith("2026-11-03") and sorted(data["s"]) == ["a", "b"]

    def test_valor_anidado_se_conserva(self):
        assert split_body_yaml("---\nm:\n  a: 1\n---\nx")[0] == {"m": {"a": 1}}


class TestMerge:
    def test_alias_y_normalizacion(self):
        fm, rep = merge_yaml_into_frontmatter({}, {
            "title": "T", "description": "D", "etiquetas": ["Uno Dos", "tres"], "status": "Active", "extra": 5})
        assert fm == {"titulo": "T", "descripcion": "D", "tags": ["uno_dos", "tres"], "estado": "aprobado", "extra": 5}
        assert rep == []

    def test_atributo_existente_manda_y_se_reporta(self):
        fm, rep = merge_yaml_into_frontmatter({"titulo": "Atributo"}, {"title": "YAML"})
        assert fm == {"titulo": "Atributo"}
        assert [(r["key"], r["yaml_value"], r["attribute_value"]) for r in rep] == [("titulo", "YAML", "Atributo")]

    def test_mismo_valor_no_es_conflicto(self):
        fm, rep = merge_yaml_into_frontmatter({"tags": ["a", "b"]}, {"tags": ["A", "b"]})
        assert fm == {"tags": ["a", "b"]} and rep == []

    def test_etiquetas_existentes_pasan_a_tags(self):
        fm, rep = merge_yaml_into_frontmatter({"etiquetas": ["Uno"]}, {})
        assert fm == {"tags": ["uno"]} and rep == []

    def test_valor_del_yaml_invalido_se_reporta(self):
        fm, rep = merge_yaml_into_frontmatter({}, {"fecha_creacion": "ayer"})
        assert "fecha_creacion" not in fm
        assert rep[0]["key"] == "fecha_creacion" and rep[0]["yaml_value"] == "ayer"


class TestPlanNote:
    def test_migrable(self):
        plan = plan_note(_doc("---\ntitle: T\ncustom: x\n---\n\nCuerpo", {"tags": ["a"]}))
        assert plan["ok"] and plan["tiene_yaml"]
        assert plan["frontmatter_new"] == {"tags": ["a"], "titulo": "T", "custom": "x"}
        assert plan["content_new"] == "Cuerpo"
        assert validate_general(plan["frontmatter_new"]) is None

    def test_sin_yaml_no_hay_plan(self):
        assert plan_note(_doc("Texto", {"titulo": "T"})) is None
        assert plan_note(_doc("", None)) is None

    @pytest.mark.parametrize("content,motivo", [
        ("---\na: [x\n---\n", "yaml-invalido"), ("---\nsin cierre", "sin-cierre"), ("---\n- a\n---\n", "no-es-mapeo")])
    def test_no_migrable_deja_la_nota_intacta(self, content, motivo):
        assert plan_note(_doc(content)) == {"ok": False, "motivo": motivo}

    def test_frontmatter_invalido_no_migra(self):
        plan = plan_note(_doc("---\ntitulo: " + "x" * 300 + "\n---\nCuerpo"))
        assert plan == {"ok": False, "motivo": "frontmatter-invalido:titulo"}

    def test_solo_atributo_etiquetas(self):
        plan = plan_note(_doc("Cuerpo\n---\nno es yaml", {"etiquetas": ["Uno", "dos"], "titulo": "T"}))
        assert plan["ok"] and not plan["tiene_yaml"]
        assert plan["frontmatter_new"] == {"tags": ["uno", "dos"], "titulo": "T"}
        assert plan["content_new"] == "Cuerpo\n---\nno es yaml"

    def test_idempotente(self):
        plan = plan_note(_doc("---\ntitle: T\n---\nCuerpo"))
        again = plan_note(_doc(plan["content_new"], plan["frontmatter_new"]))
        assert again is None
