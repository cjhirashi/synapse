/**
 * Qué puede hacer la persona en la bóveda abierta (H-064 F7c). Fuera de una bóveda compartida es la dueña y puede todo; en una compartida
 * no es dueña y solo edita si sus concesiones lo permiten (por ahora ninguna bóveda compartida se edita: F7d). El servidor es quien
 * decide de verdad: esto solo evita ofrecer lo que sería rechazado.
 */
import { useContext } from "react";
import { SyncContext } from "../sync/useSync";

export interface VaultAccess {
  /** Dueña de la bóveda: compartir, publicar, PDF, mover y renombrar, papelera, propiedades y catálogo de la bóveda. */
  isOwner: boolean;
  /** Puede crear, editar y borrar contenido (notas, tareas, archivos). */
  canEdit: boolean;
}

export function useVaultAccess(): VaultAccess {
  // Sin proveedor (un componente suelto, o una pantalla fuera de la sincronización) es el comportamiento de siempre: dueña.
  const shared = useContext(SyncContext)?.shared;
  return shared ? { isOwner: false, canEdit: !shared.readOnly } : { isOwner: true, canEdit: true };
}
