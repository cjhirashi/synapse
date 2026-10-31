/**
 * Menú ⋮ de cada fila del árbol (H-024 C-1…C-3, P-3): Renombrar y, separado y en peligro, Borrar.
 *
 * Copia el patrón de `editor/NoteMenu.tsx` (portal, foco itinerante, teclado, Esc, clic fuera). El ⋮ y
 * su menú son hermanos de la fila, no parte de ella: sus clics y teclas se detienen aquí para que nunca
 * abran ni seleccionen la fila.
 */
import { Fragment, KeyboardEvent, MouseEvent, useEffect, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { EllipsisVertical, Pencil, Trash2 } from "lucide-react";

interface TreeRowMenuProps {
  /** Nombre visible de la fila: el botón se anuncia como «Acciones de <label>». */
  label: string;
  onRename: () => void;
  onDelete: () => void;
}

interface Position {
  top: number;
  right: number;
}

export function TreeRowMenu({ label, onRename, onDelete }: TreeRowMenuProps) {
  const triggerId = useId();
  const menuId = useId();
  const trigger = useRef<HTMLButtonElement>(null);
  const menu = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const [position, setPosition] = useState<Position>({ top: 0, right: 0 });

  const items = [
    { label: "Renombrar", Icon: Pencil, run: onRename, danger: false },
    { label: "Borrar", Icon: Trash2, run: onDelete, danger: true },
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

  function onTriggerClick(event: MouseEvent<HTMLButtonElement>) {
    event.stopPropagation();
    if (open) close(false);
    else openAt(0);
  }

  function onTriggerKeyDown(event: KeyboardEvent<HTMLButtonElement>) {
    event.stopPropagation();
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      openAt(event.key === "ArrowDown" ? 0 : items.length - 1);
    }
  }

  function onMenuKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    event.stopPropagation();
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
        // Patrón APG (WCAG 2.4.3): Tab cierra el menú y el foco se queda en el ⋮, no en la página.
        close(true);
        break;
      default:
        return;
    }
    event.preventDefault();
  }

  function onMenuClick(event: MouseEvent<HTMLDivElement>) {
    event.stopPropagation();
  }

  function activate(item: (typeof items)[number]) {
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
        // Fuera del Tab: el árbol tiene una sola parada (roving); F2 y Supr atajan la misma acción.
        tabIndex={-1}
        aria-label={`Acciones de ${label}`}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
        onClick={onTriggerClick}
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
            onClick={onMenuClick}
          >
            {items.map((item, index) => (
              <Fragment key={item.label}>
                {item.danger && <div role="separator" className="note-menu-separator" />}
                <button
                  type="button"
                  role="menuitem"
                  tabIndex={index === active ? 0 : -1}
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
