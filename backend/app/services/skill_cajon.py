"""Skill de cajón (H-030b, P5/P9): `AG - SKILLS/skill-bovedas-synapse.md`, igual en todas las bóvedas.

El texto canónico vive en el repositorio (`core/skill_cajon.md`) y se siembra **solo al crear** una bóveda o al correr
la herramienta de carga (`scripts/ensure_ag_folders.py`), y **nunca** si la nota ya existe: un despliegue no pisa lo que
el dueño haya cambiado. Actualizar una bóveda ya sembrada es una orden explícita del dueño. Desde una clave de API no se
puede modificar (`meta_rules`): solo el dueño, desde la app.
"""
from pathlib import Path

CONTENT = (Path(__file__).resolve().parents[1] / "core" / "skill_cajon.md").read_text(encoding="utf-8")
FRONTMATTER = {
    "titulo": "skill-bovedas-synapse",
    "descripcion": (
        "Leer, escribir, ordenar o subir archivos en una bóveda de Synapse con synapse_vault: permisos por agente, "
        "metadatos, ÍNDICES y su descripción, buzón AG - MENSAJES, ifMatch, archivos y errores."),
    "tags": ["skill", "synapse", "boveda"],
    "estado": "en revisión",
    "skill": "skill-bovedas-synapse",
    "agentes": ["todos"],
    "version": "0.0.2",
}
