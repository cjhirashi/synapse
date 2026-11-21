/**
 * Qué puede hacer la persona en la bóveda abierta (H-064 F7c/F7d). Fuera de una bóveda compartida es la dueña y puede todo; en una
 * compartida no es dueña y edita solo donde sus concesiones dan escritura. El servidor es quien decide de verdad: esto solo evita
 * ofrecer lo que sería rechazado.
 */
import { useContext } from "react";
import { canWritePath } from "../sharing/access";
import { SyncContext } from "../sync/useSync";

export interface VaultAccess {
  /** Dueña de la bóveda: compartir, publicar, PDF, mover y renombrar, papelera, propiedades y catálogo de la bóveda, tareas y archivos. */
  isOwner: boolean;
  /** Puede escribir en alguna parte de la bóveda (la dueña, o un invitado con alguna concesión de escritura). */
  canEdit: boolean;
  /** Puede crear, editar y borrar la nota de esa ruta. */
  canWrite: (path: string) => boolean;
}

const OWNER: VaultAccess = { isOwner: true, canEdit: true, canWrite: () => true };

export function useVaultAccess(): VaultAccess {
  // Sin proveedor (un componente suelto, o una pantalla fuera de la sincronización) es el comportamiento de siempre: dueña.
  const shared = useContext(SyncContext)?.shared;
  if (!shared) return OWNER;
  return { isOwner: false, canEdit: !shared.readOnly, canWrite: (path) => !shared.readOnly && canWritePath(shared.grants, path) };
}
