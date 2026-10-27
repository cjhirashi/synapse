/**
 * Menú ⋮ de la nota abierta (SPEC-0010 RF-061, RF-062; PLAN-0010 §2.3-i, P-4, P-17): Renombrar o mover,
 * Copiar ruta, Ver en Código y, separado, Borrar. Las acciones son *props*: el menú no sabe de árboles ni
 * de almacenes; reutiliza los flujos que le pasa el editor.
 *
 * Patrón WAI-ARIA de menú con botón: el botón anuncia `aria-haspopup="menu"`/`aria-expanded`/`aria-controls`;
 * el menú vive en un portal (ningún `overflow` de la barra lo recorta), los ítems son un foco itinerante
 * (sólo el activo es tabulable) y el teclado cubre Enter/Espacio/↓ (abren en el primero), ↑ (en el último),
 * ↑/↓ cíclicas, Inicio/Fin, Esc y Tab (cierran y devuelven el foco al botón). Un clic fuera también cierra.
 */
import { Fragment, KeyboardEvent, useEffect, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Code, Copy, EllipsisVertical, Pencil, Trash2 } from "lucide-react";

interface NoteMenuProps {
  /** ¿La nota ya está en la vista Código? Entonces «Ver en Código» queda `aria-disabled`. */
  inCode: boolean;
  onRename: () => void;
  onCopyPath: () => void;
  onViewInCode: () => void;
  onDelete: () => void;
}

interface Position {
  top: number;
  right: number;
}

export function NoteMenu({ inCode, onRename, onCopyPath, onViewInCode, onDelete }: NoteMenuProps) {
  const triggerId = useId();
  const menuId = useId();
  const trigger = useRef<HTMLButtonElement>(null);
  const menu = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const [position, setPosition] = useState<Position>({ top: 0, right: 0 });

  const items = [
    { label: "Renombrar o mover", Icon: Pencil, run: onRename, disabled: false, danger: false },
    { label: "Copiar ruta", Icon: Copy, run: onCopyPath, disabled: false, danger: false },
    { label: "Ver en Código", Icon: Code, run: onViewInCode, disabled: inCode, danger: false },
    { label: "Borrar", Icon: Trash2, run: onDelete, disabled: false, danger: true },
  ];

  /** Abre el menú con el foco en el ítem `index`, 4 px bajo el botón y alineado a su derecha. */
  function openAt(index: number) {
    const box = trigger.current?.getBoundingClientRect();
    if (box) setPosition({ top: box.bottom + 4, right: Math.max(0, window.innerWidth - box.right) });
    setActive(index);
    setOpen(true);
  }

  /** Cierra y, si se pide, devuelve el foco al botón. */
  function close(restoreFocus: boolean) {
    setOpen(false);
    if (restoreFocus) trigger.current?.focus();
  }

  // El foco sigue al ítem activo (foco itinerante).
  useEffect(() => {
    if (open) menu.current?.querySelectorAll<HTMLElement>('[role="menuitem"]')[active]?.focus();
  }, [open, active]);

  // Un clic fuera cierra el menú (el foco se queda donde lo puso el usuario).
  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: PointerEvent) => {
      const target = event.target as Node;
      if (!menu.current?.contains(target) && !trigger.current?.contains(target)) setOpen(false);
    };
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, [open]);

  function onTriggerKeyDown(event: KeyboardEvent<HTMLButtonElement>) {
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      openAt(event.key === "ArrowDown" ? 0 : items.length - 1);
    }
  }

  function onMenuKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    switch (event.key) {
      case "ArrowDown":
        setActive((index) => (index + 1) % items.length);
        break;
      case "ArrowUp":
        setActive((index) => (index - 1 + items.length) % items.length);
        break;
      case "Home":
        setActive(0);
        break;
      case "End":
        setActive(items.length - 1);
        break;
      case "Escape":
        close(true);
        break;
      case "Tab":
        // Patrón APG (WCAG 2.4.3): Tab cierra el menú y el foco se queda en el botón ⋮. Sin `preventDefault` el Tab se
        // seguiría desde el botón y, siendo el último control de la página en lectura, el foco acabaría en <body>.
        close(true);
        break;
      default:
        return;
    }
    event.preventDefault();
  }

  function activate(item: (typeof items)[number]) {
    if (item.disabled) return;
    close(true);
    item.run();
  }

  return (
    <>
      <button
        ref={trigger}
        id={triggerId}
        type="button"
        className="note-menu-button"
        aria-label="Opciones de la nota"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
        onClick={() => (open ? close(false) : openAt(0))}
        onKeyDown={onTriggerKeyDown}
      >
        <EllipsisVertical size={16} aria-hidden="true" />
      </button>
      {open &&
        createPortal(
          <div
            ref={menu}
            id={menuId}
            role="menu"
            aria-labelledby={triggerId}
            className="note-menu"
            style={{ top: position.top, right: position.right }}
            onKeyDown={onMenuKeyDown}
          >
            {items.map((item, index) => (
              <Fragment key={item.label}>
                {item.danger && <div role="separator" className="note-menu-separator" />}
                <button
                  type="button"
                  role="menuitem"
                  tabIndex={index === active ? 0 : -1}
                  aria-disabled={item.disabled || undefined}
                  className={`note-menu-item${item.danger ? " note-menu-item-danger" : ""}`}
                  onClick={() => activate(item)}
                  onFocus={() => setActive(index)}
                >
                  <item.Icon size={14} aria-hidden="true" />
                  {item.label}
                </button>
              </Fragment>
            ))}
          </div>,
          document.body,
        )}
    </>
  );
}
