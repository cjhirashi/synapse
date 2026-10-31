/**
 * Referencias a archivos desde los documentos (H-016 C-9): se busca `/files/<id>` en el contenido de las
 * notas de la bóveda, en la réplica local (el servidor no lee las notas). Los contenidos se leen por
 * lotes y se cachean por (id de nota, rev): sólo se vuelve a leer una nota si cambió.
 */
import type { NoteStore } from "../notes/noteStore";

export interface FileRef {
  id: string;
  path: string;
}

const BATCH = 25;
const FILE_URL = /\/files\/([0-9a-fA-F-]{36})/g;
const cache = new Map<string, { rev: string; fileIds: string[] }>();

/** Mapa archivo → documentos de la bóveda que lo enlazan (notas en papelera no cuentan). */
export async function scanFileReferences(
  notes: Pick<NoteStore, "list" | "get">,
  vaultId: string,
): Promise<Map<string, FileRef[]>> {
  const summaries = await notes.list(vaultId);
  const result = new Map<string, FileRef[]>();
  for (let i = 0; i < summaries.length; i += BATCH) {
    await Promise.all(
      summaries.slice(i, i + BATCH).map(async (summary) => {
        let entry = cache.get(summary.id);
        if (!entry || entry.rev !== summary.rev) {
          const note = await notes.get(summary.id);
          const ids = new Set<string>();
          for (const match of note.content.matchAll(FILE_URL)) ids.add(match[1].toLowerCase());
          entry = { rev: summary.rev, fileIds: [...ids] };
          cache.set(summary.id, entry);
        }
        for (const fileId of entry.fileIds) {
          const list = result.get(fileId) ?? [];
          list.push({ id: summary.id, path: summary.path });
          result.set(fileId, list);
        }
      }),
    );
  }
  return result;
}

export function clearReferenceCache(): void {
  cache.clear();
}
