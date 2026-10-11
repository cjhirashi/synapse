# AGENTS.md — mapa de ‹nombre del proyecto›

> **Punto de entrada** para cualquier agente que trabaje en este repo. Es un **mapa**,
> no una biblia: lee sólo lo que necesites, cuando lo necesites.
>
> **Cómo trabajamos:** este repo usa un arnés **SDD Anchored** (spec viva anclada al
> código). Empieza por **`.harness/method.md §0`**. Los principios innegociables están
> en **`.harness/constitution.md`**.
>
> **Separación estricta:** `.harness/` = cómo operamos · `docs/` = el producto.

## Antes de empezar (en orden)

1. Ejecuta **`.harness/gate/check.sh`**. Si cierra la compuerta (exit 1 / algún ❌),
   **DETENTE** y reporta.
2. Lee **`.harness/memory/state.md`** completo (corto; las correcciones del usuario van
   arriba y se leen SIEMPRE).
3. Ojea **`.harness/specs/`** — carpetas `NNN-slug` = features; `estado:` en su `spec.md`.

## Qué es el sistema

‹1–2 párrafos: dominio, arquitectura en una frase. Detalle en `.harness/constitution.md`
Art. 2 y `docs/…`.›

## Servicios / módulos y comandos

| Servicio | Stack | Tests | Arranque local |
|---|---|---|---|
| ‹…› | ‹…› | ‹…› | ‹…› |

## Convenciones

- ‹idioma de código / specs›.  Commits: **Conventional Commits** + `(RF-NNN)`.
- IDs `RF-`/`RNF-`/`T-` por feature, `ADR-` por proyecto; número reservado al crear el archivo.
- Tests anotados con su `RF-`: ‹forma por lenguaje›.
- Errores de API: **RFC 9457**.

## Mapa de documentación (producto)

‹lista de docs›. Tabla completa (con "se actualiza cuando cambia…"):
`.harness/constitution.md` Art. 11.

## Bindings de herramienta

`.claude/agents/` (si existe) es el binding de Claude Code — opcional. El núcleo del
arnés vive en `.harness/`.
