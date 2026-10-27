"""Cuerpos JSON de la API: decodificación acotada en profundidad (SPEC-0010, Converge 2/3).

`json.loads` admite cientos de niveles de anidamiento pero `json.dumps` (el de httpx al reenviar a CouchDB, el de las reglas
de las notas) revienta con `RecursionError` cerca de 1000, y el propio `json.loads` con ~5000: FastAPI convierte esa
excepción en un 400 que el contrato no declara. `DeepJsonRequest` lleva todo fallo del decodificador, y todo cuerpo que
anide más de `MAX_JSON_DEPTH` niveles, al `JSONDecodeError` que FastAPI ya traduce al 422 `validation-error` declarado.
`DeepJsonRoute` lo aplica a todas las rutas de un router (`APIRouter(route_class=DeepJsonRoute)`), sin duplicar la lógica.
"""
import json

from fastapi import Request
from fastapi.routing import APIRoute

from app.core.note_rules import nesting_depth_exceeds

# Niveles de anidamiento de cualquier cuerpo JSON (raíz = 1). Muy por debajo del límite de recursión de Python (~1000).
# Cabe el `frontmatter` de 32 niveles dentro de `{docs:[{…}]}` de `_bulk_docs` (3 + 32 = 35).
MAX_JSON_DEPTH = 64


class DeepJsonRequest(Request):
    """`Request` cuyo `json()` trata cualquier fallo del decodificador, y el exceso de profundidad, como JSON inválido.

    `json.loads` lanza `RecursionError` con muchos niveles de anidamiento y `ValueError` (no `JSONDecodeError`) con
    enteros de más de `int_max_str_digits` dígitos; FastAPI sólo convierte en `RequestValidationError` (422 declarado) el
    `JSONDecodeError`, y el resto lo vuelve un 400 no declarado (VB-3, VB-5). La profundidad se mide de forma iterativa,
    sin depender de la pila.
    """

    async def json(self):
        try:
            parsed = await super().json()
        except json.JSONDecodeError:
            raise  # ya es el caso declarado
        except (RecursionError, ValueError):
            raise json.JSONDecodeError("JSON not decodable", "", 0) from None
        if nesting_depth_exceeds(parsed, MAX_JSON_DEPTH):
            raise json.JSONDecodeError("JSON nested too deeply", "", 0)
        return parsed


class DeepJsonRoute(APIRoute):
    """Ruta cuyo cuerpo JSON se decodifica con `DeepJsonRequest`."""

    def get_route_handler(self):
        handler = super().get_route_handler()

        async def deep(request: Request):
            return await handler(DeepJsonRequest(request.scope, request.receive))

        return deep
