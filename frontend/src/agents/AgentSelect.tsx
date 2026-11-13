import { useEffect, useId, useRef, useState, type KeyboardEvent } from "react";
import { createPortal } from "react-dom";
import { ChevronDown, CornerDownRight, User, Users } from "lucide-react";
import AgentBadge from "./AgentBadge";
import "./agents.css";

export interface AgentSelectProps {
  /** Nombre accesible del control (también su `aria-label`). */
  label: string;
  /** `all` (si se ofrece), `user` (la persona), `inherit` (si se ofrece) o el id de un agente. */
  value: string;
  onChange: (value: string) => void;
  /** Agentes que se pueden elegir (los registrados como gestores, más el ya asignado). */
  agents: string[];
  /** Ofrece «Igual que la tarea» como primera opción (subtareas). */
  inherit?: boolean;
  /** Ofrece «Todas» como primera opción (filtros). */
  all?: boolean;
  id?: string;
}

interface Option {
  value: string;
}

function OptionLabel({ value }: { value: string }) {
  if (value === "all") {
    return (
      <span className="agent-select-item">
        <span className="agent-select-glyph" aria-hidden="true"><Users size={14} /></span>
        Todas
      </span>
    );
  }
  if (value === "user") {
    return (
      <span className="agent-select-item">
        <span className="agent-select-glyph" aria-hidden="true"><User size={14} /></span>
        Yo
      </span>
    );
  }
  if (value === "inherit") {
    return (
      <span className="agent-select-item">
        <span className="agent-select-glyph" aria-hidden="true"><CornerDownRight size={14} /></span>
        Igual que la tarea
      </span>
    );
  }
  return <AgentBadge agentId={value} size={24} />;
}

/**
 * Lista desplegable para elegir a quién se asigna algo: «Yo» o un agente con su foto y nombre (un `select` nativo no
 * puede mostrar imágenes). Patrón combobox/listbox de WAI-ARIA: el foco se queda en el botón y la opción activa se
 * anuncia con `aria-activedescendant`. La lista va en un portal con posición fija para que el cuerpo con scroll de una
 * ventana emergente no la recorte; Escape la cierra sin cerrar la ventana que la contiene.
 */
export default function AgentSelect({ label, value, onChange, agents, inherit = false, all = false, id }: AgentSelectProps) {
  const base = useId();
  const listId = `${base}-list`;
  const button = useRef<HTMLButtonElement>(null);
  const popup = useRef<HTMLUListElement>(null);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const [place, setPlace] = useState<{ left: number; width: number; top?: number; bottom?: number }>({ left: 0, width: 0 });

  const options: Option[] = [...(all ? [{ value: "all" }] : []), ...(inherit ? [{ value: "inherit" }] : []), { value: "user" }, ...agents.map((agent) => ({ value: agent }))];
  const selected = Math.max(0, options.findIndex((o) => o.value === value));

  function show() {
    const rect = button.current?.getBoundingClientRect();
    if (!rect) return;
    const below = window.innerHeight - rect.bottom;
    // Con poco sitio debajo se abre hacia arriba.
    setPlace(below < 240 && rect.top > below ? { left: rect.left, width: rect.width, bottom: window.innerHeight - rect.top + 4 } : { left: rect.left, width: rect.width, top: rect.bottom + 4 });
    setActive(selected);
    setOpen(true);
  }

  function choose(index: number) {
    onChange(options[index].value);
    setOpen(false);
    button.current?.focus();
  }

  useEffect(() => {
    if (!open) return;
    const close = () => setOpen(false);
    const onDown = (e: MouseEvent) => {
      const target = e.target as Node;
      if (!button.current?.contains(target) && !popup.current?.contains(target)) close();
    };
    const onScroll = (e: Event) => {
      if (!popup.current?.contains(e.target as Node)) close();
    };
    document.addEventListener("mousedown", onDown);
    window.addEventListener("scroll", onScroll, true);
    window.addEventListener("resize", close);
    return () => {
      document.removeEventListener("mousedown", onDown);
      window.removeEventListener("scroll", onScroll, true);
      window.removeEventListener("resize", close);
    };
  }, [open]);

  useEffect(() => {
    if (open) popup.current?.querySelector<HTMLElement>(`[data-index="${active}"]`)?.scrollIntoView?.({ block: "nearest" });
  }, [open, active]);

  function onKeyDown(e: KeyboardEvent<HTMLButtonElement>) {
    if (e.key === "Escape" && open) {
      // La lista se cierra; la ventana que la contiene sigue abierta.
      e.preventDefault();
      e.stopPropagation();
      setOpen(false);
      return;
    }
    if (e.key === "Tab") {
      setOpen(false);
      return;
    }
    const step = e.key === "ArrowDown" ? 1 : e.key === "ArrowUp" ? -1 : 0;
    if (step !== 0) {
      e.preventDefault();
      if (!open) return show();
      setActive((index) => (index + step + options.length) % options.length);
    } else if (open && (e.key === "Home" || e.key === "End")) {
      e.preventDefault();
      setActive(e.key === "Home" ? 0 : options.length - 1);
    } else if (open && (e.key === "Enter" || e.key === " ")) {
      e.preventDefault();
      e.stopPropagation();
      choose(active);
    }
  }

  return (
    <>
      <button
        ref={button}
        id={id}
        type="button"
        role="combobox"
        className="agent-select"
        aria-label={label}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={listId}
        aria-activedescendant={open ? `${base}-opt-${active}` : undefined}
        onClick={() => (open ? setOpen(false) : show())}
        onKeyDown={onKeyDown}
      >
        <OptionLabel value={options[selected].value} />
        <ChevronDown size={16} aria-hidden="true" className="agent-select-chevron" />
      </button>
      {open &&
        createPortal(
          <ul ref={popup} id={listId} role="listbox" aria-label={label} className="agent-select-list" style={{ ...place, position: "fixed" }}>
            {options.map((option, index) => (
              <li
                key={option.value}
                id={`${base}-opt-${index}`}
                data-index={index}
                role="option"
                aria-selected={index === selected}
                className={`agent-select-option${index === active ? " agent-select-option--active" : ""}`}
                onMouseEnter={() => setActive(index)}
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => choose(index)}
              >
                <OptionLabel value={option.value} />
              </li>
            ))}
            {agents.length === 0 && <li className="agent-select-empty" role="presentation">Ningún agente registrado en esta bóveda</li>}
          </ul>,
          document.body,
        )}
    </>
  );
}
