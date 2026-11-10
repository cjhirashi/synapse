import { useId, type KeyboardEvent } from "react";
import { FileText, Files, Tags } from "lucide-react";
import type { VaultTab } from "./workspaceMemory";

const TABS: { id: VaultTab; label: string; Icon: typeof FileText }[] = [
  { id: "documentos", label: "Documentos", Icon: FileText },
  { id: "tags", label: "Filtro por tags", Icon: Tags },
  { id: "archivos", label: "Archivos", Icon: Files },
];

interface Props {
  tab: VaultTab;
  onChange: (tab: VaultTab) => void;
  /** Id del panel que controla la pestaña activa. */
  panelId: string;
}

/** Barra de pestañas de la barra lateral de la bóveda (H-052). Flechas, Inicio y Fin mueven la selección. */
export default function VaultTabs({ tab, onChange, panelId }: Props) {
  const baseId = useId();

  function onKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    const index = TABS.findIndex((t) => t.id === tab);
    let next = index;
    if (event.key === "ArrowRight") next = (index + 1) % TABS.length;
    else if (event.key === "ArrowLeft") next = (index - 1 + TABS.length) % TABS.length;
    else if (event.key === "Home") next = 0;
    else if (event.key === "End") next = TABS.length - 1;
    else return;
    event.preventDefault();
    onChange(TABS[next].id);
    document.getElementById(`${baseId}-${TABS[next].id}`)?.focus();
  }

  return (
    <div className="vault-tabs" role="tablist" aria-label="Contenido de la bóveda" onKeyDown={onKeyDown}>
      {TABS.map(({ id, label, Icon }) => (
        <button
          key={id}
          id={`${baseId}-${id}`}
          type="button"
          role="tab"
          className="vault-tab"
          aria-selected={tab === id}
          aria-controls={panelId}
          tabIndex={tab === id ? 0 : -1}
          title={label}
          onClick={() => onChange(id)}
        >
          <Icon size={14} aria-hidden="true" />
          <span>{label}</span>
        </button>
      ))}
    </div>
  );
}
