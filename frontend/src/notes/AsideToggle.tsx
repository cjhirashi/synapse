import { PanelRight, PanelRightClose } from "lucide-react";

/** Botón de la barra derecha del documento (índice y tareas ligadas), en el extremo derecho de la franja superior. Lo usan la bóveda y la documentación. */
export function AsideToggle({ open, controls, onToggle }: { open: boolean; controls: string; onToggle: () => void }) {
  const label = open ? "Ocultar el índice y las tareas del documento" : "Mostrar el índice y las tareas del documento";
  return (
    <button type="button" className="note-nav-button vault-aside-toggle" data-aside-toggle="" aria-expanded={open} aria-controls={controls} aria-label={label} title={label} onClick={onToggle}>
      {open ? <PanelRightClose size={16} aria-hidden="true" /> : <PanelRight size={16} aria-hidden="true" />}
    </button>
  );
}

const ASIDE_KEY = "synapse.docAside";
/** La barra derecha se muestra por defecto en escritorio; si la persona la ocultó, se recuerda. */
export function readAsidePreference(): boolean {
  try { return window.localStorage.getItem(ASIDE_KEY) !== "0"; } catch { return true; }
}
export function writeAsidePreference(open: boolean): void {
  try { window.localStorage.setItem(ASIDE_KEY, open ? "1" : "0"); } catch { /* sin almacenamiento no se recuerda */ }
}
