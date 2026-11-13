import { forwardRef, useCallback, useEffect, useId, useMemo, useState, type CSSProperties, type KeyboardEvent } from "react";
import { CalendarClock, ListChecks, ListTree } from "lucide-react";
import AgentBadge from "../agents/AgentBadge";
import UserBadge from "../agents/UserBadge";
import { STATUS_LABEL, formatDue, isClosed, isOverdue } from "../tasks/taskModel";
import { listTasks, type Task } from "../tasks/tasksApi";
import { activeIndex, indentOf, pathMatches, readOutline, sameOutline, type OutlineItem } from "./outline";

export type AsideTab = "indice" | "tareas";
const TABS: Array<{ id: AsideTab; label: string; Icon: typeof ListTree }> = [
  { id: "indice", label: "Índice", Icon: ListTree },
  { id: "tareas", label: "Tareas", Icon: ListChecks },
];
const TASKS_REFRESH_MS = 60_000;

interface Props {
  id: string;
  open: boolean;
  floating: boolean;
  /** Contenedor del documento: de ahí se leen los encabezados. */
  content: HTMLElement | null;
  vaultId: string;
  noteId: string;
  notePath: string | null;
  /** Color de la bóveda (variable CSS) para las marcas de selección. */
  accent: string;
  /** Abre la tarea en la pestaña Tareas. */
  onOpenTask: (task: Task) => void;
  /** Tras elegir un encabezado en móvil la barra flotante se cierra. */
  onNavigated: () => void;
}

/**
 * Barra derecha del documento: pestaña «Índice» (los encabezados, para saltar a ellos) y pestaña «Tareas» (las tareas cuya ruta es este
 * documento). Se oculta con el botón de la franja superior; en móvil es una ventana flotante, cerrada de inicio.
 */
const DocAside = forwardRef<HTMLDivElement, Props>(function DocAside({ id, open, floating, accent, content, vaultId, noteId, notePath, onOpenTask, onNavigated }, ref) {
  const baseId = useId();
  const [tab, setTab] = useState<AsideTab>("indice");
  const [items, setItems] = useState<OutlineItem[]>([]);
  const [active, setActive] = useState(0);
  const [hasCodeView, setHasCodeView] = useState(false);
  const [tasks, setTasks] = useState<Task[] | null>(null);
  const [failed, setFailed] = useState(false);

  // --- Índice ---
  const refresh = useCallback(() => {
    if (!content) return;
    const next = readOutline(content);
    setItems((prev) => (sameOutline(prev, next) ? prev : next)); // el editor toca el DOM a cada tecla: sin cambios reales no se vuelve a dibujar
    setHasCodeView(content.querySelector(".cm-editor") !== null);
  }, [content]);

  useEffect(() => {
    if (!open || !content) return;
    refresh();
    let timer: number | undefined;
    const observer = new MutationObserver(() => {
      window.clearTimeout(timer);
      timer = window.setTimeout(refresh, 150); // al escribir, no se relee en cada tecla
    });
    observer.observe(content, { childList: true, subtree: true, characterData: true });
    return () => { observer.disconnect(); window.clearTimeout(timer); };
  }, [open, content, noteId, refresh]);

  useEffect(() => {
    if (!open || !content || items.length === 0) return;
    let frame = 0;
    const update = () => {
      frame = 0;
      const body = content.querySelector<HTMLElement>(".note-editor-body") ?? content;
      setActive(activeIndex(items.map((item) => item.el.getBoundingClientRect().top), body.getBoundingClientRect().top));
    };
    const onScroll = () => { if (!frame) frame = window.requestAnimationFrame(update); };
    update();
    content.addEventListener("scroll", onScroll, true); // `scroll` no burbuja: se escucha en captura
    return () => { content.removeEventListener("scroll", onScroll, true); if (frame) window.cancelAnimationFrame(frame); };
  }, [open, content, items]);

  function go(item: OutlineItem, index: number) {
    const smooth = !window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    item.el.scrollIntoView?.({ block: "start", behavior: smooth ? "smooth" : "auto" });
    setActive(index);
    if (floating) onNavigated();
  }

  // --- Tareas ligadas ---
  useEffect(() => {
    if (!open) return;
    let alive = true;
    const load = () => {
      listTasks(vaultId).then((list) => { if (alive) { setTasks(list); setFailed(false); } }).catch(() => { if (alive) setFailed(true); });
    };
    setTasks(null);
    load();
    const timer = window.setInterval(() => { if (!document.hidden) load(); }, TASKS_REFRESH_MS);
    window.addEventListener("focus", load);
    return () => { alive = false; window.clearInterval(timer); window.removeEventListener("focus", load); };
  }, [open, vaultId, noteId]);

  const linked = useMemo(() => {
    const own = (tasks ?? []).filter((t) => pathMatches(t.path, notePath));
    return [...own.filter((t) => !isClosed(t)), ...own.filter(isClosed)];
  }, [tasks, notePath]);
  const parents = useMemo(() => new Map((tasks ?? []).map((t) => [t.id, t])), [tasks]);
  const openCount = linked.filter((t) => !isClosed(t)).length;

  function onKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    const index = TABS.findIndex((t) => t.id === tab);
    let next = index;
    if (event.key === "ArrowRight") next = (index + 1) % TABS.length;
    else if (event.key === "ArrowLeft") next = (index - 1 + TABS.length) % TABS.length;
    else if (event.key === "Home") next = 0;
    else if (event.key === "End") next = TABS.length - 1;
    else return;
    event.preventDefault();
    setTab(TABS[next].id);
    document.getElementById(`${baseId}-${TABS[next].id}`)?.focus();
  }

  return (
    <aside ref={ref} id={id} className="vault-workspace-aside" aria-label="Índice y tareas del documento" data-open={open ? "" : undefined} data-floating={floating ? "" : undefined} style={{ "--vault-icon-color": accent } as CSSProperties}>
      <div className="vault-tabs vault-tabs--aside" role="tablist" aria-label="Contenido de la barra del documento" onKeyDown={onKeyDown}>
        {TABS.map(({ id: tabId, label, Icon }) => (
          <button
            key={tabId} id={`${baseId}-${tabId}`} type="button" role="tab" className="vault-tab" aria-selected={tab === tabId} aria-controls={`${baseId}-panel`}
            tabIndex={tab === tabId ? 0 : -1} title={label} onClick={() => setTab(tabId)}
          >
            <Icon size={14} aria-hidden="true" />
            <span>{label}</span>
            {tabId === "tareas" && openCount > 0 && <span className="vault-tab-badge" aria-label={`${openCount} abiertas`}>{openCount > 99 ? "99+" : openCount}</span>}
          </button>
        ))}
      </div>
      <div id={`${baseId}-panel`} role="tabpanel" aria-labelledby={`${baseId}-${tab}`} className="docaside-panel">
        {tab === "indice" && (
          items.length === 0 ? (
            <p className="docaside-empty">{hasCodeView ? "El índice se muestra en la vista Visual del editor." : "Este documento no tiene encabezados."}</p>
          ) : (
            <nav aria-label="Índice de encabezados">
              <ol className="docaside-outline">
                {items.map((item, index) => (
                  <li key={item.key} style={{ "--indent": indentOf(items, item) } as CSSProperties}>
                    <button type="button" className="docaside-heading" data-level={item.level} aria-current={index === active ? "location" : undefined} title={item.text} onClick={() => go(item, index)}>
                      {item.text}
                    </button>
                  </li>
                ))}
              </ol>
            </nav>
          )
        )}
        {tab === "tareas" && (
          <>
            {failed && <p className="docaside-empty" role="alert">No se pudieron leer las tareas.</p>}
            {tasks === null && !failed && <p className="docaside-empty">Cargando tareas…</p>}
            {tasks !== null && linked.length === 0 && (
              <p className="docaside-empty">Ninguna tarea apunta a este documento. Para ligar una, pon su ruta{notePath ? <> (<code>{notePath}</code>)</> : ""} en el campo «Ruta» de la tarea.</p>
            )}
            <ul className="docaside-tasks">
              {linked.map((task) => {
                const parent = task.parent_id ? parents.get(task.parent_id) : undefined;
                return (
                  <li key={task.id}>
                    <button type="button" className={`docaside-task${isClosed(task) ? " is-closed" : ""}`} data-status={task.status} title="Abrir en Tareas" onClick={() => onOpenTask(task)}>
                      {parent && <span className="docaside-task-parent">↳ {parent.title}</span>}
                      <span className="docaside-task-title">{task.title}</span>
                      <span className="docaside-task-meta">
                        <span className="docaside-status">{STATUS_LABEL[task.status]}</span>
                        {task.due_at && (
                          <span className={`docaside-due${isOverdue(task) ? " is-late" : ""}`} title={formatDue(task.due_at)}>
                            <CalendarClock size={12} aria-hidden="true" /> {formatDue(task.due_at)}
                          </span>
                        )}
                        <span className="docaside-who" title="Asignada a">
                          {task.assignee_type === "agent" && task.assignee_agent_id ? <AgentBadge agentId={task.assignee_agent_id} size={14} showName={false} /> : <UserBadge size={14} label={null} />}
                        </span>
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          </>
        )}
      </div>
    </aside>
  );
});

export default DocAside;
