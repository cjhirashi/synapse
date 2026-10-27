"""SPEC-0011 — identidad de marca: frontera HTTP de los archivos raíz del build.

`spa.py` (SPEC-0007) ya sirve cada archivo de `frontend/dist` con el tipo MIME que da `mimetypes`;
esta feature no añade código de backend. Estas pruebas fijan el contrato de lo que el navegador pide:
`200` y `Content-Type` de favicon, ICO, apple-touch-icon, iconos del manifest y el propio manifest, y
que lo servido son exactamente los bytes de `frontend/public/` (Vite los copia tal cual).
Requieren el build (`npm run build` en `frontend/`), igual que `test_spa.py`.
"""
import pytest

from app.spa import DIST_DIR

PUBLIC_DIR = DIST_DIR.parent / "public"

# ruta pública → Content-Type esperado (PLAN-0011 §2.4)
ROOT_FILES = {
    "/favicon.svg": "image/svg+xml",                        # RF-001
    "/favicon.ico": "image/vnd.microsoft.icon",             # RF-002
    "/apple-touch-icon.png": "image/png",                   # RF-003
    "/icons/icon-192.png": "image/png",                     # RF-004
    "/icons/icon-512.png": "image/png",                     # RF-004
    "/icons/icon-maskable-512.png": "image/png",            # RF-004
    "/logo-synapse-dark.svg": "image/svg+xml",              # cabecera y login (tema oscuro)
    "/logo-synapse-light.svg": "image/svg+xml",             # cabecera y login (tema claro)
    "/manifest.webmanifest": "application/manifest+json",   # RF-005
}


@pytest.mark.parametrize("path,content_type", ROOT_FILES.items())
def test_rf_001_005_archivo_de_marca_responde_200_con_su_content_type(client, path, content_type):
    r = client.get(path)
    assert r.status_code == 200
    # `FileResponse` no añade `; charset` a los tipos que no son texto/*.
    assert r.headers["content-type"].split(";")[0] == content_type


@pytest.mark.parametrize("path", ROOT_FILES)
def test_rnf_001_lo_servido_son_los_bytes_de_public(client, path):
    # El build copia `public/` tal cual: servir otra cosa sería un build viejo o una transformación.
    assert client.get(path).content == (PUBLIC_DIR / path.lstrip("/")).read_bytes()


def test_rf_004_cada_icono_del_manifest_es_accesible_en_la_ruta_que_declara(client):
    manifest = client.get("/manifest.webmanifest").json()
    assert {i["purpose"] for i in manifest["icons"]} == {"any", "maskable"}
    for icon in manifest["icons"]:
        assert client.get(icon["src"]).status_code == 200


def test_rf_002_favicon_ico_ya_no_es_404(client):
    # Línea base de 0007 RF-004: sin favicon, el navegador recibía el 404 de un archivo con extensión.
    assert client.get("/favicon.ico").status_code != 404
