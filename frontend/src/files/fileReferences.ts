/**
 * Cálculo de referencias a archivos en el contenido de notas (C-9).
 * Se busca la cadena `/files/<id>` en el contenido de cada nota.
 * Caché por (noteId, rev) para evitar recálculos.
 */

interface CacheEntry {
  rev: string;
  references: Map<string, boolean>; // fileId → true si está referenciado
}

const referenceCache = new Map<string, CacheEntry>();

/**
 * Calcula cuántos documentos referencian un archivo en la réplica local.
 * Busca la cadena `/files/<id>` en el contenido de todas las notas.
 *
 * @param fileId ID del archivo
 * @param notes Map-like de notas (p. ej. Map, NoteStore) que soporta .values() o es iterable
 * @returns Número de notas que contienen el archivo
 */
export function getFileReferencesCount(fileId: string, notes: Map<string, any> | { values: () => Iterable<any> }): number {
  let count = 0;
  const searchString = `/files/${fileId}`;

  for (const note of notes.values()) {
    if (!note || typeof note.content !== "string") continue;

    // Verificar caché (note.id y note.rev son esperados)
    const cacheKey = note.id as string;
    let cached = referenceCache.get(cacheKey);

    if (!cached || cached.rev !== note.rev) {
      // Recalcular solo si el documento cambió
      const references = new Map<string, boolean>();
      const lines = note.content.split("\n");
      for (const line of lines) {
        // Extraer todos los fileIds mencionados en esta nota
        const filePattern = /\/files\/([a-f0-9-]+)/g;
        let match;
        while ((match = filePattern.exec(line)) !== null) {
          references.set(match[1], true);
        }
      }
      cached = { rev: note.rev as string, references };
      referenceCache.set(cacheKey, cached);
    }

    if (cached.references.has(fileId)) {
      count += 1;
    }
  }

  return count;
}

/**
 * Obtiene los IDs y nombres de las notas que referencian un archivo.
 *
 * @param fileId ID del archivo
 * @param notes Map-like de notas (p. ej. Map, NoteStore)
 * @returns Array de {id, path} de las notas que contienen el archivo
 */
export function getFileReferenceDetails(fileId: string, notes: Map<string, any> | { values: () => Iterable<any> }): Array<{ id: string; path: string }> {
  const results: Array<{ id: string; path: string }> = [];
  const searchString = `/files/${fileId}`;

  for (const note of notes.values()) {
    if (!note || typeof note.content !== "string") continue;
    if (note.content.includes(searchString)) {
      results.push({ id: note.id, path: note.path || "Sin título" });
    }
  }

  return results;
}

/**
 * Limpia el caché de referencias (útil para tests o cuando se refresca toda la réplica).
 */
export function clearReferenceCache() {
  referenceCache.clear();
}
