/**
 * Skills de bóveda: propietario, invitados y estado (H-041 E3). Espejo de `backend/app/core/skill_rules.py`
 * (forma y coherencia); ambos pasan los mismos casos de `backend/tests/fixtures/skills_reglas.json`.
 *
 * Una skill es una nota `AG - SKILLS/skill-<nombre>.md` (plana, no de sistema). `propietario` es el gestor que la
 * edita y la borra; `agentes`, los invitados, que solo la usan. `estado: archivado` = inactiva, sin propietario ni
 * invitados, hasta que el usuario le asigne un gestor (E4).
 */
import { isIndexPath } from "./indexRules";
import { AG_AGENTES, AG_SKILLS, isSystemPath, metaFolderOf } from "./metaRules";

export const SKILL_OWNER = "skill:propietario";
export const SKILL_GUESTS = "skill:agentes";
export const SKILL_STATE = "skill:estado";
export const ARCHIVED = "archivado";
export const GUESTS_MAX = 20;
const AGENT_ID = /^[a-z0-9][a-z0-9-]{0,31}$/;

export function isSkillPath(path: string | null | undefined): boolean {
  if (path === null || path === undefined || metaFolderOf(path) !== AG_SKILLS || isIndexPath(path) || isSystemPath(path)) return false;
  return path.split("/").length === 2;
}

function guestsOf(frontmatter: Record<string, unknown>): string[] {
  const value = frontmatter.agentes;
  return Array.isArray(value) ? value.filter((g): g is string => typeof g === "string") : [];
}

/** `skill:propietario|agentes|estado` o `null`. Una skill activa tiene propietario; una archivada, ni propietario ni invitados. */
export function checkShape(frontmatter: Record<string, unknown>): string | null {
  const owner = frontmatter.propietario;
  if ("propietario" in frontmatter && !(typeof owner === "string" && AGENT_ID.test(owner))) return SKILL_OWNER;
  if ("agentes" in frontmatter) {
    const guests = frontmatter.agentes;
    if (
      !Array.isArray(guests) || guests.length > GUESTS_MAX || new Set(guests.map(String)).size !== guests.length
      || !guests.every((g) => typeof g === "string" && AGENT_ID.test(g)) || (typeof owner === "string" && guests.includes(owner))
    ) {
      return SKILL_GUESTS;
    }
  }
  if (frontmatter.estado === ARCHIVED) return "propietario" in frontmatter || guestsOf(frontmatter).length > 0 ? SKILL_STATE : null;
  return "propietario" in frontmatter ? null : SKILL_OWNER;
}

/** Ids de los gestores de la bóveda: fichas `AG - AGENTES/<id>.md` vivas con `estado: activo`. */
export function managersOf(items: ReadonlyArray<{ path: string; deleted_at: string | null; frontmatter?: Record<string, unknown> | null }>): string[] {
  const ids: string[] = [];
  for (const item of items) {
    const parts = item.path.split("/");
    if (item.deleted_at !== null || parts.length !== 2 || metaFolderOf(item.path) !== AG_AGENTES || isIndexPath(item.path) || !parts[1].endsWith(".md")) continue;
    if (item.frontmatter?.estado === "activo") ids.push(parts[1].slice(0, -3));
  }
  return ids.sort();
}
