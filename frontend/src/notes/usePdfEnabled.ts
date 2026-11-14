import { useEffect, useState } from "react";
import { templatePath } from "./metaRules";
import type { NoteStore } from "./noteStore";

/** ¿La plantilla del documento abierto tiene el PDF activo (`estilo.pdf.activo`)? Decide si se muestra el botón «PDF» (H-036). */
export function usePdfEnabled(notes: NoteStore, vaultId: string, noteId: string | null, version: number): boolean {
  const [enabled, setEnabled] = useState(false);
  useEffect(() => {
    let alive = true;
    setEnabled(false);
    if (noteId === null) return;
    void (async () => {
      const note = await notes.get(noteId);
      const name = note.frontmatter.plantilla;
      if (typeof name !== "string" || name === "") return;
      const wanted = templatePath(name);
      const template = (await notes.list(vaultId)).find((item) => item.deleted_at === null && item.path === wanted);
      const estilo = template?.frontmatter?.estilo;
      const pdf = estilo && typeof estilo === "object" ? (estilo as Record<string, unknown>).pdf : null;
      if (alive) setEnabled(!!pdf && typeof pdf === "object" && (pdf as Record<string, unknown>).activo === true);
    })().catch(() => undefined);
    return () => { alive = false; };
  }, [notes, vaultId, noteId, version]);
  return enabled;
}
