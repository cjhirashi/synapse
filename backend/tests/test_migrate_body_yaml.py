"""H-040: ensayo (modo report) de la migración del YAML del cuerpo; sin escribir nada."""
import importlib.util
import json
from pathlib import Path


def load_script():
    path = Path(__file__).resolve().parents[1] / "scripts" / "migrate_body_yaml.py"
    spec = importlib.util.spec_from_file_location("migrate_body_yaml", path)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


class FakeCouch:
    def __init__(self):
        self.dbs: dict[str, dict[str, dict]] = {}
        self.writes = 0

    def add_vault(self, db, vault_id, name):
        self.dbs.setdefault(db, {})[f"vault:{vault_id}"] = {"_id": f"vault:{vault_id}", "type": "vault", "name": name}

    def add_note(self, db, vault_id, note_id, path, content, frontmatter=None, deleted_at=None, conflicts=False, rev="1-a"):
        doc = {"_id": f"note:{vault_id}:{note_id}", "_rev": rev, "type": "note", "vault_id": vault_id, "path": path,
               "content": content, "frontmatter": frontmatter, "deleted_at": deleted_at}
        if conflicts:
            doc["_conflicts"] = ["1-b"]
        self.dbs.setdefault(db, {})[doc["_id"]] = doc

    def list_dbs(self):
        return sorted(self.dbs)

    def note_docs(self, db):
        return [d for d in self.dbs[db].values() if d["type"] == "note"]

    def vault_names(self, db):
        return {d["_id"].removeprefix("vault:"): d["name"] for d in self.dbs[db].values() if d["type"] == "vault"}


def seeded():
    c = FakeCouch()
    c.add_vault("synapse_user_a", "v1", "Proyectos")
    c.add_vault("synapse_user_a", "v2", "Turing")
    c.add_note("synapse_user_a", "v1", "n1", "A/Uno.md", "---\ntitle: Uno\ntags: [X, y]\nstatus: Active\nautor: Ana\n---\n\nCuerpo")
    c.add_note("synapse_user_a", "v1", "n2", "Dos.md", "---\ntitulo: YAML\n---\nCuerpo", {"titulo": "Atributo"})
    c.add_note("synapse_user_a", "v1", "n3", "Tres.md", "---\n- lista\n---\nCuerpo")
    c.add_note("synapse_user_a", "v1", "n4", "Cuatro.md", "Sin yaml")
    c.add_note("synapse_user_a", "v1", "n5", "A/INDICE.md", "---\ntitulo: indice\n---\n")
    c.add_note("synapse_user_a", "v2", "n6", "Seis.md", "---\ntitulo: Seis\n---\nx", deleted_at="2026-01-01T00:00:00Z")
    c.add_note("synapse_user_a", "v2", "n7", "Siete.md", "---\ntitulo: Siete\n---\nx", conflicts=True)
    c.add_note("synapse_user_a", "v2", "n8", "Ocho.md", "Cuerpo", {"etiquetas": ["Uno"]})
    c.add_note("synapse_user_a", "v2", "n9", "Nueve.md", "---\ndate: 2026-11-03\n---\nx")
    return c


def run(tmp_path, couch=None):
    mod = load_script()
    couch = couch or seeded()
    report = mod.run_report(couch, tmp_path / "r.json", tmp_path / "r.md")
    return mod, couch, report


def test_cuenta_por_boveda_sin_escribir(tmp_path):
    _, couch, report = run(tmp_path)
    by_name = {r["nombre"]: r for r in report["bovedas"]}
    assert by_name["Proyectos"]["notas_vivas"] == 4  # n5 (INDICE) no cuenta
    assert (by_name["Proyectos"]["con_yaml"], by_name["Proyectos"]["migrables"], by_name["Proyectos"]["no_migrables"]) == (3, 2, 1)
    assert by_name["Proyectos"]["motivos_no_migrable"] == {"no-es-mapeo": 1}
    assert (by_name["Turing"]["notas_vivas"], by_name["Turing"]["con_yaml"], by_name["Turing"]["solo_etiquetas"]) == (2, 1, 1)
    assert report["total_migrables"] == 4 and report["total_no_migrables"] == 1
    assert report["total_con_atributo_etiquetas"] == 1
    assert report["omitidas"] == {"con_conflictos": 1}
    assert couch.writes == 0


def test_mapeo_de_claves_y_reportados(tmp_path):
    _, _, report = run(tmp_path)
    assert report["mapeo_claves"]["title"] == {"titulo": 1}
    assert report["mapeo_claves"]["status"] == {"estado": 1}
    assert report["mapeo_claves"]["tags"] == {"tags": 1}
    assert report["mapeo_claves"]["autor"] == {"(atributo libre)": 1}
    assert report["claves_libres"] == {"autor": 1, "date": 1}
    [conflicto] = report["reportados"]
    assert (conflicto["key"], conflicto["yaml_value"], conflicto["attribute_value"]) == ("titulo", "YAML", "Atributo")
    assert [n["motivo"] for n in report["no_migrables"]] == ["no-es-mapeo"]


def test_no_modifica_los_documentos(tmp_path):
    couch = seeded()
    before = json.dumps(couch.dbs, sort_keys=True)
    run(tmp_path, couch)
    assert json.dumps(couch.dbs, sort_keys=True) == before


def test_digest_estable_y_sensible_al_rev(tmp_path):
    _, couch, first = run(tmp_path)
    assert run(tmp_path, couch)[2]["plan_digest"] == first["plan_digest"]
    couch.dbs["synapse_user_a"]["note:v1:n1"]["_rev"] = "2-z"
    assert run(tmp_path, couch)[2]["plan_digest"] != first["plan_digest"]


def test_escribe_informe_y_resumen(tmp_path):
    run(tmp_path)
    assert json.loads((tmp_path / "r.json").read_text())["total_migrables"] == 4
    summary = (tmp_path / "r.md").read_text()
    assert "| Proyectos |" in summary and "plan_digest" in summary


def test_solo_una_base(tmp_path):
    c = seeded()
    c.add_vault("synapse_user_b", "v9", "Otra")
    c.add_note("synapse_user_b", "v9", "x", "X.md", "---\ntitulo: X\n---\n")
    _, _, report = run(tmp_path, c)
    assert report["total_migrables"] == 5
    mod = load_script()
    only = mod.run_report(c, tmp_path / "o.json", tmp_path / "o.md", only_db="synapse_user_b")
    assert only["total_migrables"] == 1
