import { useEffect, useState } from "react";
import { ESTADO_COLORES, templateName, type EstadoColor } from "./metaRules";
import type { NoteStore } from "./noteStore";
import type { TemplateAttr } from "../editor/templateAttrs";

/** Una plantilla de la bóveda tal como la ofrece el control «Plantilla» de un documento (H-054). */
export interface TemplateOption {
  id: string;
  name: string;
  label: string;
  alcance: string[];
  atributos: TemplateAttr[];
  /** Estados de la plantilla, cada uno con su color (H-054). Un documento con ella solo tiene uno de estos o ninguno. */
  estados: TemplateEstado[];
}

export interface TemplateEstado {
  nombre: string;
  color: EstadoColor;
}

/** Estados de una definición; el texto suelto (guardado antes de tener color) se toma como gris. */
export function estadosOf(raw: unknown): TemplateEstado[] {
  if (!Array.isArray(raw)) return [];
  return raw.flatMap((item): TemplateEstado[] => {
    if (typeof item === "string") return [{ nombre: item, color: "gris" }];
    if (item === null || typeof item !== "object") return [];
    const { nombre, color } = item as { nombre?: unknown; color?: unknown };
    if (typeof nombre !== "string") return [];
    return [{ nombre, color: (ESTADO_COLORES as readonly unknown[]).includes(color) ? (color as EstadoColor) : "gris" }];
  });
}

const isAttr = (item: unknown): item is TemplateAttr =>
  item !== null && typeof item === "object" && typeof (item as TemplateAttr).nombre === "string" && typeof (item as TemplateAttr).tipo === "string";

/** Plantillas vivas de la bóveda (existir es estar activa); `null` mientras se leen la primera vez. */
export function useTemplateOptions(notes: NoteStore, vaultId: string, version: number): TemplateOption[] | null {
  const [state, setState] = useState<{ vaultId: string; options: TemplateOption[] } | null>(null);
  useEffect(() => {
    let alive = true;
    void notes.list(vaultId).then((items) => {
      if (!alive) return;
      const options = items.flatMap((item): TemplateOption[] => {
        const name = item.deleted_at === null ? templateName(item.path) : null;
        const alcance = item.frontmatter?.alcance;
        if (name === null || !Array.isArray(alcance)) return [];
        const titulo = item.frontmatter?.titulo;
        const atributos = Array.isArray(item.frontmatter?.atributos) ? (item.frontmatter?.atributos as unknown[]).filter(isAttr) : [];
        const estados = estadosOf(item.frontmatter?.estados);
        return [{
          id: item.id, name, label: typeof titulo === "string" && titulo ? titulo : name,
          alcance: alcance.filter((a): a is string => typeof a === "string"), atributos, estados,
        }];
      });
      setState({ vaultId, options });
    }).catch(() => undefined);
    return () => { alive = false; };
  }, [notes, vaultId, version]);
  return state !== null && state.vaultId === vaultId ? state.options : null;
}
