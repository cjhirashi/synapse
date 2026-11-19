/**
 * Skills de bóveda: propietario, invitados y estado (H-041 E3). Espejo de `backend/app/core/skill_rules.py`
 * (forma y coherencia); ambos pasan los mismos casos de `backend/tests/fixtures/skills_reglas.json`.
 *
 * Una skill es una nota `AG - SKILLS/skill-<nombre>.md` (plana, no de sistema). `propietario` es la lista de gestores que
 * la editan y la borran (el texto de un id también vale); `agentes`, los invitados, que solo la usan. `estado: archivado` = inactiva, sin propietario ni
 * invitados, hasta que el usuario le asigne un gestor (E4).
 */
import { isIndexPath } from "./indexRules";
import { AG_AGENTES, AG_SKILLS, isSystemPath, metaFolderOf } from "./metaRules";

export const SKILL_OWNER = "skill:propietario";
export const SKILL_GUESTS = "skill:agentes";
export const SKILL_STATE = "skill:estado";
export const ARCHIVED = "archivado";
export const GUESTS_MAX = 20;
export const OWNERS_MAX = 10;
const AGENT_ID = /^[a-z0-9][a-z0-9-]{0,31}$/;

export function isSkillPath(path: string | null | undefined): boolean {
  if (path === null || path === undefined || metaFolderOf(path) !== AG_SKILLS || isIndexPath(path) || isSystemPath(path)) return false;
  return path.split("/").length === 2;
}

function guestsOf(frontmatter: Record<string, unknown>): string[] {
  const value = frontmatter.agentes;
  return Array.isArray(value) ? value.filter((g): g is string => typeof g === "string") : [];
}

/** Los propietarios (lista de ids; el texto antiguo vale como lista de un elemento). */
export function ownersOf(frontmatter: Record<string, unknown>): string[] {
  const value = frontmatter.propietario;
  if (typeof value === "string") return value === "" ? [] : [value];
  return Array.isArray(value) ? [...new Set(value.filter((o): o is string => typeof o === "string" && o !== ""))] : [];
}

/** `skill:propietario|agentes|estado` o `null`. Una skill activa tiene al menos un propietario (lista sin repetir, hasta 10); una archivada, ni propietarios ni invitados. */
export function checkShape(frontmatter: Record<string, unknown>): string | null {
  if ("propietario" in frontmatter) {
    const raw = frontmatter.propietario;
    const owners = typeof raw === "string" ? [raw] : raw;
    if (
      !Array.isArray(owners) || owners.length === 0 || owners.length > OWNERS_MAX
      || new Set(owners.map(String)).size !== owners.length || !owners.every((o) => typeof o === "string" && AGENT_ID.test(o))
    ) {
      return SKILL_OWNER;
    }
  }
  const owners = ownersOf(frontmatter);
  if ("agentes" in frontmatter) {
    const guests = frontmatter.agentes;
    if (
      !Array.isArray(guests) || guests.length > GUESTS_MAX || new Set(guests.map(String)).size !== guests.length
      || !guests.every((g) => typeof g === "string" && AGENT_ID.test(g)) || guests.some((g) => owners.includes(g))
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
