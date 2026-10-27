---
id: ADR-006
tipo: adr
estado: accepted          # GATE 2 de SPEC-0010 (P-1, P-2), 2026-10-24, autoridad delegada de AIRA
fecha: 2026-10-24
---

# ADR-006 · Extensión de tokens para el contenido Markdown

## Contexto y planteamiento del problema

SPEC-0010 pinta resaltado de sintaxis, avisos, propiedades y controles nuevos (RNF-004: WCAG 2.x AA).
En el tema claro **ningún** color semántico actual alcanza 4,5:1 como texto sobre `--bg-tertiary`
(`--success` 3,01, `--warning` 2,91, `--info` 3,74, `--danger` 4,41), y los bordes de los inputs
globales quedan en 1,2–1,4:1. `tokens.css` dice «no inventar valores»: la fuente es
`diseño/1.1.4 - Diseño UI-UX/1.1.4.1 - Sistema de Diseño.md`, por eso la extensión se registra aquí.

## Decisión

Seis tokens nuevos, definidos en **ambos** temas (el radio es único):

| Token | Oscuro | Claro | Uso |
|---|---|---|---|
| `--success-text` | `#4ade80` | `#15803d` | cadenas del resaltado, icono «Copiado» |
| `--warning-text` | `#fbbf24` | `#b45309` | números/literales, `` `código` `` en Código, aviso de advertencia |
| `--info-text` | `#38bdf8` | `#0369a1` | tipos/atributos, enlaces en Código, avisos informativos |
| `--danger-text` | `#f87171` | `#b91c1c` | «Borrar», error de diagrama |
| `--border-control` | `#6b6b7c` | `#64748b` | borde de los controles **nuevos** (≥ 3:1) |
| `--radius-xs` | `4px` | `4px` | casillas, chips, código en línea (el mockup usa 4 px) |

En oscuro los `-text` coinciden con el token semántico actual; en claro son la variante 700 de
Tailwind de la misma familia. Regla adicional (P-2): `--text-muted` y `--accent` **no se usan como color
de texto** en estilos nuevos (3,01/2,34 y 4,27/3,36 sobre T); el texto de acento es `--accent-hover` y
el secundario `--text-secondary`. `editor/contrast.test.ts` lo fija.

## Alternativas descartadas

Resaltar sólo con `--text-primary`/`--text-secondary`/`--accent-hover` y dejar los inputs nuevos a
1,2–1,4:1: se pierde la lectura por color y se incumple RNF-004.

## Consecuencias

`1.1.4.1` (fuera de git: `diseño/` está en `.gitignore`) debe actualizarse en el checkout principal con
la tabla de color; se registra en `history.md` al cierre (PLAN-0010 §8).
