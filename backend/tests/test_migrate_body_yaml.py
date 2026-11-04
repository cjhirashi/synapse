"""H-040: ensayo (modo report) de la migración del YAML del cuerpo; sin escribir nada."""
import copy
import importlib.util
import json
import stat
from pathlib import Path

import pytest


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
        self.race_on = None
        self.fail_status = None

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

    def get_doc(self, db, doc_id):
        doc = self.dbs[db].get(doc_id)
        return copy.deepcopy(doc) if doc else None

    def put(self, db, doc):
        current = self.dbs[db][doc["_id"]]
        if self.race_on == doc["_id"] or doc["_rev"] != current["_rev"]:
            return 409, {}
        if self.fail_status:
            return self.fail_status, {}
        new = copy.deepcopy(doc)
        new["_rev"] = f"{int(current['_rev'].split('-')[0]) + 1}-x"
        self.dbs[db][doc["_id"]] = new
        self.writes += 1
        return 201, {}

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
    assert report["mapeo_claves"]["date"] == {"fecha_creacion": 1}
    assert report["claves_libres"] == {"autor": 1}
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


# ---- backup / apply / rollback ----

def _stamped(couch):
    """Documentos con created_at/updated_at para comprobar que la migración no los toca."""
    for db, docs in couch.dbs.items():
        for doc in docs.values():
            if doc["type"] == "note":
                doc.update(created_at="2026-11-03T00:11:54Z", updated_at="2026-11-03T00:24:44Z")
    return couch


def prepared(tmp_path, couch=None):
    mod = load_script()
    couch = _stamped(couch or seeded())
    report = mod.run_report(couch, tmp_path / "r.json", tmp_path / "r.md")
    assert mod.run_backup(couch, tmp_path / "b.json") == 0
    return mod, couch, report


def test_date_del_yaml_queda_como_fecha_creacion(tmp_path):
    mod, couch, _ = prepared(tmp_path)
    assert mod.run_apply(couch, tmp_path / "r.json", tmp_path / "b.json") == 0
    nueve = couch.dbs["synapse_user_a"]["note:v2:n9"]
    assert nueve["frontmatter"] == {"fecha_creacion": "2026-11-03"} and nueve["content"] == "x"
    assert nueve["created_at"] == "2026-11-03T00:11:54Z" and nueve["updated_at"] == "2026-11-03T00:24:44Z"


def test_apply_migra_y_deja_intacto_lo_demas(tmp_path):
    mod, couch, report = prepared(tmp_path)
    before = copy.deepcopy(couch.dbs)
    assert mod.run_apply(couch, tmp_path / "r.json", tmp_path / "b.json") == 0
    assert couch.writes == report["total_migrables"] == 4
    uno = couch.dbs["synapse_user_a"]["note:v1:n1"]
    assert uno["frontmatter"] == {"titulo": "Uno", "tags": ["x", "y"], "estado": "aprobado", "autor": "Ana"}
    assert uno["content"] == "Cuerpo" and uno["path"] == "A/Uno.md"
    assert couch.dbs["synapse_user_a"]["note:v1:n2"]["frontmatter"] == {"titulo": "Atributo"}  # manda el atributo
    for note_id in ("note:v1:n3", "note:v1:n4", "note:v1:n5", "note:v2:n6", "note:v2:n7"):  # no migrables, sin YAML, INDICE, papelera, conflicto
        assert couch.dbs["synapse_user_a"][note_id] == before["synapse_user_a"][note_id]
    ocho = couch.dbs["synapse_user_a"]["note:v2:n8"]
    assert ocho["frontmatter"] == {"tags": ["uno"]} and ocho["content"] == "Cuerpo"


def test_apply_es_idempotente(tmp_path):
    mod, couch, _ = prepared(tmp_path)
    assert mod.run_apply(couch, tmp_path / "r.json", tmp_path / "b.json") == 0
    writes = couch.writes
    assert mod.run_apply(couch, tmp_path / "r.json", tmp_path / "b.json") == 0
    assert couch.writes == writes
    assert mod.run_report(couch, tmp_path / "r2.json", tmp_path / "r2.md")["total_migrables"] == 0


def test_apply_se_niega_si_el_plan_cambio(tmp_path):
    mod, couch, _ = prepared(tmp_path)
    couch.dbs["synapse_user_a"]["note:v1:n1"]["_rev"] = "2-z"
    before = json.dumps(couch.dbs, sort_keys=True)
    assert mod.run_apply(couch, tmp_path / "r.json", tmp_path / "b.json") == 2
    assert json.dumps(couch.dbs, sort_keys=True) == before and couch.writes == 0


def test_apply_exige_el_respaldo_del_mismo_plan(tmp_path):
    mod, couch, _ = prepared(tmp_path)
    assert mod.run_apply(couch, tmp_path / "r.json", None) == 2
    assert mod.run_apply(couch, tmp_path / "r.json", tmp_path / "no-existe.json") == 2
    bad = json.loads((tmp_path / "b.json").read_text())
    bad["plan_digest"] = "0" * 64
    (tmp_path / "b.json").write_text(json.dumps(bad))
    assert mod.run_apply(couch, tmp_path / "r.json", tmp_path / "b.json") == 2
    assert couch.writes == 0


def test_dry_apply_no_escribe(tmp_path):
    mod, couch, _ = prepared(tmp_path)
    assert mod.run_apply(couch, tmp_path / "r.json", None, dry_apply=True) == 0
    assert couch.writes == 0


def test_apply_cuenta_y_salta_un_409(tmp_path):
    mod, couch, _ = prepared(tmp_path)
    couch.race_on = "note:v1:n1"
    assert mod.run_apply(couch, tmp_path / "r.json", tmp_path / "b.json") == 0
    assert couch.writes == 3
    assert couch.dbs["synapse_user_a"]["note:v1:n1"]["content"].startswith("---")


def test_apply_error_de_escritura(tmp_path):
    mod, couch, _ = prepared(tmp_path)
    couch.fail_status = 500
    assert mod.run_apply(couch, tmp_path / "r.json", tmp_path / "b.json") == 4


def test_apply_detecta_un_campo_que_cambio(tmp_path):
    mod, couch, _ = prepared(tmp_path)
    original_put = couch.put

    def put_que_cambia_la_ruta(db, doc):
        return original_put(db, {**doc, "path": "Otra.md"})

    couch.put = put_que_cambia_la_ruta
    assert mod.run_apply(couch, tmp_path / "r.json", tmp_path / "b.json") == 3


def test_respaldo_permisos_600_y_solo_lo_que_se_toca(tmp_path):
    _, couch, _ = prepared(tmp_path)
    path = tmp_path / "b.json"
    assert stat.S_IMODE(path.stat().st_mode) == 0o600
    backup = json.loads(path.read_text())
    assert sorted(d["_id"] for d in backup["docs"]["synapse_user_a"]) == ["note:v1:n1", "note:v1:n2", "note:v2:n8", "note:v2:n9"]
    assert backup["docs"]["synapse_user_a"][0]["content"].startswith("---")


def test_rollback_restaura_el_documento_original(tmp_path):
    mod, couch, _ = prepared(tmp_path)
    original = copy.deepcopy(couch.dbs)
    mod.run_apply(couch, tmp_path / "r.json", tmp_path / "b.json")
    assert mod.run_rollback(couch, tmp_path / "b.json", dry_run=True) == 0
    assert couch.dbs["synapse_user_a"]["note:v1:n1"]["content"] == "Cuerpo"  # el dry-run no escribió
    assert mod.run_rollback(couch, tmp_path / "b.json") == 0
    for note_id, doc in couch.dbs["synapse_user_a"].items():
        assert {k: v for k, v in doc.items() if k != "_rev"} == {k: v for k, v in original["synapse_user_a"][note_id].items() if k != "_rev"}
    writes = couch.writes
    assert mod.run_rollback(couch, tmp_path / "b.json") == 0  # segunda vez: ya originales
    assert couch.writes == writes


def test_rollback_no_toca_una_nota_editada_despues(tmp_path):
    mod, couch, _ = prepared(tmp_path)
    mod.run_apply(couch, tmp_path / "r.json", tmp_path / "b.json")
    couch.dbs["synapse_user_a"]["note:v1:n1"]["content"] = "Editada por el usuario"
    assert mod.run_rollback(couch, tmp_path / "b.json") == 0
    assert couch.dbs["synapse_user_a"]["note:v1:n1"]["content"] == "Editada por el usuario"
    assert couch.dbs["synapse_user_a"]["note:v2:n9"]["content"].startswith("---")  # las demás sí se restauran
