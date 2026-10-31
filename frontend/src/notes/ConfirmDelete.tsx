/**
 * Confirmación de todo borrado desde el árbol (H-024 C-7, C-8): una nota o una carpeta sólo va a la
 * papelera tras confirmar. Cancelar es la respuesta enfocada y la de Esc, para que un Enter o un Esc
 * reflejo nunca borre nada.
 */
import { ConfirmDialog } from "../editor/ConfirmDialog";

type ConfirmDeleteProps = {
  /** Nombre visible de la nota o de la carpeta. */
  name: string;
  onConfirm: () => void;
  onCancel: () => void;
} & ({ kind: "note" } | { kind: "folder"; count: number });

export function ConfirmDelete(props: ConfirmDeleteProps) {
  const detail = describeTrash(props);
  return (
    <ConfirmDialog titleId="tree-delete-title" title={`¿Borrar «${props.name}»?`} onCancel={props.onCancel}>
      <p>{detail}</p>
      <button type="button" data-autofocus onClick={props.onCancel}>
        Cancelar
      </button>
      <button type="button" onClick={props.onConfirm}>
        Borrar
      </button>
    </ConfirmDialog>
  );
}

function describeTrash(props: ConfirmDeleteProps): string {
  if (props.kind === "note") return "Irá a la papelera.";
  return props.count === 1 ? "Se llevará a la papelera 1 nota." : `Se llevarán a la papelera ${props.count} notas.`;
}
