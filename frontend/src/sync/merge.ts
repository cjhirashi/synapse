/**
 * Combinación automática de una bóveda en conflicto (SPEC-0005 RF-012…RF-015; ADR-003;
 * PLAN-0005 §2.6).
 *
 * Función pura: recibe la ganadora `W` (la que elige PouchDB, igual en todas las réplicas),
 * una perdedora viva `L` y su ancestro común `A`, y devuelve el cuerpo combinado o el motivo
 * por el que hace falta la resolución manual. Leer el ancestro y escribir el resultado
 * (hija de `W` + lápida sobre `L`) es trabajo de `conflicts.ts`.
 */
import { validateVault, type VaultField, type VaultFields } from "./vaultRules";

/** Cuerpo de una bóveda sin los metadatos de PouchDB (`_id`, `_rev`, `type`). */
export interface MergeBody extends VaultFields {
  owner_id: string;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}

export type MergeResult =
  /** `tombstoneOnly`: `W` ya es el resultado; basta con cerrar la rama de `L`. */
  | { kind: "merged"; doc: MergeBody; tombstoneOnly: boolean }
  /** Sin ancestro (compactado o nunca visto por esta réplica): no hay con qué comparar. */
  | { kind: "manual"; reason: "no-ancestor" }
  /** Ambos lados cambiaron estos campos a valores distintos. */
  | { kind: "manual"; reason: "clash"; fields: VaultField[] }
  /** La combinación no pasa `vaultRules` en estos campos (p. ej. más de 20 etiquetas). */
  | { kind: "manual"; reason: "invalid"; fields: VaultField[] };

/** Campos de texto con regla de "gana el lado que cambió" (paso 2). */
const SCALAR_FIELDS = ["name", "description"] as const;

function sameTags(x: string[], y: string[]): boolean {
  // Las etiquetas son un conjunto: reordenarlas no es una edición.
  const set = new Set(x);
  return x.length === y.length && y.every((tag) => set.has(tag));
}

/** ¿Son la misma bóveda salvo `updated_at`? (paso 7; etiquetas en el mismo orden). */
function sameExceptUpdatedAt(w: MergeBody, l: MergeBody): boolean {
  return w.name === l.name && w.description === l.description && w.deleted_at === l.deleted_at
    && (w.icon ?? null) === (l.icon ?? null)
    && w.owner_id === l.owner_id && w.created_at === l.created_at
    && w.tags.length === l.tags.length && w.tags.every((tag, i) => tag === l.tags[i]);
}

/** ¿Este lado editó algún campo de contenido respecto al ancestro? (paso 4). */
function editedContent(side: MergeBody, ancestor: MergeBody): boolean {
  return side.name !== ancestor.name || side.description !== ancestor.description || !sameTags(side.tags, ancestor.tags);
}

/**
 * Paso 3: (`A` ∪ altas) − bajas, en el orden de `W` y después las altas de `L`.
 * Lo que queda de `A` sin bajas está en `W`, así que basta con quitar de `W` lo que `L`
 * dio de baja y añadir las altas de `L`.
 */
function mergeTags(w: string[], l: string[], a: string[]): string[] {
  const removedByL = (tag: string) => a.includes(tag) && !l.includes(tag);
  const addedByL = l.filter((tag) => !a.includes(tag) && !w.includes(tag));
  return [...w.filter((tag) => !removedByL(tag)), ...addedByL];
}

/** Paso 4 (RF-014): la edición gana al borrado; un cambio de estado sin oposición se aplica. */
function mergeDeletedAt(w: MergeBody, l: MergeBody, a: MergeBody): string | null {
  const wChanged = w.deleted_at !== a.deleted_at;
  const lChanged = l.deleted_at !== a.deleted_at;
  if (wChanged === lChanged) return w.deleted_at; // ambos o ninguno: el de W
  const [changed, other] = wChanged ? [w, l] : [l, w];
  if (changed.deleted_at !== null && editedContent(other, a)) return null;
  return changed.deleted_at;
}

/**
 * Combina `w` y `l` sobre su ancestro `a` (o `null` si la réplica no lo conserva). `now`
 * es el `updated_at` del resultado: combinar es una edición nueva.
 */
export function mergeVault(w: MergeBody, l: MergeBody, a: MergeBody | null, now: string): MergeResult {
  // Paso 7 primero: dos resoluciones simultáneas del mismo conflicto sólo difieren en
  // `updated_at`; cerrar la rama perdedora basta y no necesita ancestro (convergencia).
  if (sameExceptUpdatedAt(w, l)) {
    return { kind: "merged", doc: w, tombstoneOnly: true };
  }
  if (a === null) return { kind: "manual", reason: "no-ancestor" };

  // Paso 2: si ambos lados cambiaron un campo a valores distintos, es un choque.
  const clashes = SCALAR_FIELDS.filter((field) => w[field] !== l[field] && w[field] !== a[field] && l[field] !== a[field]);
  if (clashes.length > 0) return { kind: "manual", reason: "clash", fields: [...clashes] };
  const pick = <F extends (typeof SCALAR_FIELDS)[number]>(field: F): MergeBody[F] =>
    w[field] !== a[field] ? w[field] : l[field];

  // `icon` (SPEC-0009 RF-012, P-6): lo que sólo un lado cambió gana; si ambos lo cambiaron distinto gana W y
  // el conflicto NO pasa a resolución manual (es un dato cosmético, sin pérdida relevante). Sin clave = null.
  const iconOf = (body: MergeBody) => body.icon ?? null;
  const icon = iconOf(w) !== iconOf(a) ? iconOf(w) : iconOf(l);

  // Paso 6: el resultado debe cumplir las mismas reglas que cualquier escritura (RF-015).
  const checked = validateVault({ name: pick("name"), description: pick("description"), tags: mergeTags(w.tags, l.tags, a.tags), icon });
  if (!checked.ok) return { kind: "manual", reason: "invalid", fields: checked.fields };

  // Paso 5: `created_at` y `owner_id` no cambian (los de W); `updated_at` = ahora. La clave `icon` sólo se
  // escribe si algún lado la tenía o el resultado no es null: un documento anterior sigue sin ella.
  const { icon: mergedIcon, ...content } = checked.value;
  const keepIcon = mergedIcon !== null || w.icon !== undefined || l.icon !== undefined;
  return {
    kind: "merged",
    doc: {
      ...content,
      ...(keepIcon ? { icon: mergedIcon } : {}),
      owner_id: w.owner_id,
      created_at: w.created_at,
      updated_at: now,
      deleted_at: mergeDeletedAt(w, l, a),
    },
    tombstoneOnly: false,
  };
}
