export interface WorkspaceMemory {
  noteId: string | null;
  expanded: string[];
  scroll: number;
}

const STORAGE_KEY_PREFIX = "synapse.workspace";

function getKey(userId: string, vaultId: string): string {
  return `${STORAGE_KEY_PREFIX}.${userId}.${vaultId}`;
}

function isValidMemory(data: unknown, vaultId: string): data is WorkspaceMemory {
  if (typeof data !== "object" || data === null) return false;
  
  const obj = data as Record<string, unknown>;
  
  // Validar noteId: null o string que empiece por "note:<vaultId>:"
  if (obj.noteId !== null && obj.noteId !== undefined) {
    if (typeof obj.noteId !== "string") return false;
    if (!obj.noteId.startsWith(`note:${vaultId}:`)) return false;
  }
  
  // Validar expanded: array de strings, máx 500 elementos, cada uno ≤ 512 caracteres
  if (!Array.isArray(obj.expanded)) return false;
  if (obj.expanded.length > 500) return false;
  if (!obj.expanded.every(item => typeof item === "string" && item.length <= 512)) return false;
  
  // Validar scroll: entero finito entre 0 y 10_000_000
  if (typeof obj.scroll !== "number") return false;
  if (!Number.isInteger(obj.scroll) || !Number.isFinite(obj.scroll)) return false;
  if (obj.scroll < 0 || obj.scroll > 10_000_000) return false;
  
  return true;
}

export function readMemory(userId: string, vaultId: string): WorkspaceMemory | null {
  try {
    const key = getKey(userId, vaultId);
    const json = localStorage.getItem(key);
    
    if (json === null) return null;
    
    let data: unknown;
    try {
      data = JSON.parse(json);
    } catch {
      // JSON inválido: descartar clave
      localStorage.removeItem(key);
      return null;
    }
    
    if (!isValidMemory(data, vaultId)) {
      // Descartar valor corrupto
      localStorage.removeItem(key);
      return null;
    }
    
    return data;
  } catch {
    return null;
  }
}

export function writeMemory(userId: string, vaultId: string, patch: Partial<WorkspaceMemory>): void {
  try {
    const key = getKey(userId, vaultId);
    
    // Leer lo guardado o usar defaults
    let current = readMemory(userId, vaultId);
    if (current === null) {
      current = { noteId: null, expanded: [], scroll: 0 };
    }
    
    // Mezclar el patch
    const merged: WorkspaceMemory = {
      noteId: patch.noteId !== undefined ? patch.noteId : current.noteId,
      expanded: patch.expanded !== undefined ? patch.expanded : current.expanded,
      scroll: patch.scroll !== undefined ? patch.scroll : current.scroll,
    };
    
    // Validar el resultado
    if (!isValidMemory(merged, vaultId)) return;
    
    // Serializar y verificar tamaño (máx 64 KiB)
    const json = JSON.stringify(merged);
    const sizeBytes = new Blob([json]).size;
    if (sizeBytes > 65536) return;
    
    localStorage.setItem(key, json);
  } catch {
    // Sin almacenamiento (modo privado, cuota llena) no hacemos nada
  }
}

export function forgetNote(userId: string, vaultId: string): void {
  try {
    const current = readMemory(userId, vaultId);
    if (current === null) return;
    
    writeMemory(userId, vaultId, { noteId: null, scroll: 0 });
  } catch {
    // Sin almacenamiento no hacemos nada
  }
}