import { AlertTriangle, X } from "lucide-react";
import AgentSelect from "../agents/AgentSelect";
import { NO_FILTER, STATUS_LABEL, STATUSES, matchesFilter, type DueFilter, type TaskFilter } from "./taskModel";
import type { Task, TaskStatus } from "./tasksApi";

const DUE_OPTIONS: Array<{ value: DueFilter; label: string; hint: string }> = [
  { value: "all", label: "Todas", hint: "Con o sin fecha" },
  { value: "overdue", label: "Vencidas", hint: "Su fecha ya pasó y siguen abiertas" },
  { value: "today", label: "Hoy", hint: "Vencen hoy" },
  { value: "week", label: "Próximos 7 días", hint: "Vencen de hoy a dentro de una semana" },
  { value: "none", label: "Sin fecha", hint: "No tienen vencimiento" },
];

interface Props {
  /** Todas las tareas de la bóveda (raíces y subtareas): de aquí salen los contadores. */
  tasks: Task[];
  filter: TaskFilter;
  onChange: (filter: TaskFilter) => void;
  /** Agentes que se pueden elegir: los registrados como gestores y los que ya tienen alguna tarea. */
  agentIds: string[];
  /** Tareas que se muestran con el filtro actual. */
  shown: number;
  onClose: () => void;
  /** Ventana global (H-056): las bóvedas que se pueden elegir; sin ellas no hay grupo «Bóveda». */
  vaults?: Array<{ id: string; name: string }>;
  /** Proyectos que se pueden elegir (H-058); sin ellos no hay grupo «Proyecto». */
  projects?: Array<{ id: string; title: string }>;
}

/**
 * Filtros de las tareas (Lista, Kanban y Calendario comparten el mismo). Una tarea raíz se muestra si ella o alguna de
 * sus subtareas cumple. Cada grupo acota por una sola cosa y todos se combinan (Y): quién, en qué estado y cuándo vence.
 */
export default function TaskFilters({ tasks, filter, onChange, agentIds, shown, onClose, vaults, projects }: Props) {
  const active = (filter.vault && filter.vault !== "all" ? 1 : 0) + (filter.project && filter.project !== "all" ? 1 : 0) + (filter.assignee !== "all" ? 1 : 0) + (filter.statuses.length > 0 ? 1 : 0) + (filter.due !== "all" ? 1 : 0);
  const count = (partial: Partial<TaskFilter>) => tasks.filter((t) => matchesFilter(t, { ...NO_FILTER, ...partial })).length;
  const overdue = count({ due: "overdue" });

  const toggle = (status: TaskStatus) =>
    onChange({ ...filter, statuses: filter.statuses.includes(status) ? filter.statuses.filter((s) => s !== status) : [...filter.statuses, status] });

  return (
    <div className="tf-panel">
      <header className="tf-panel-head">
        <h3>Filtros {active > 0 && <span className="tf-panel-count" aria-label={`${active} filtro${active === 1 ? "" : "s"} activo${active === 1 ? "" : "s"}`}>{active}</span>}</h3>
        {active > 0 && <button type="button" className="tf-panel-clear" onClick={() => onChange(NO_FILTER)}>Limpiar filtros</button>}
        <button type="button" className="tasks-side-close tf-panel-close" onClick={onClose} aria-label="Cerrar filtros"><X size={16} aria-hidden="true" /></button>
      </header>

      {overdue > 0 && filter.due !== "overdue" && (
        <button type="button" className="tf-panel-alert" onClick={() => onChange({ ...filter, due: "overdue" })}>
          <AlertTriangle size={14} aria-hidden="true" />
          <span>{overdue} vencida{overdue === 1 ? "" : "s"}</span>
          <span className="tf-panel-alert-go">Ver</span>
        </button>
      )}

      {vaults && (
        <section className="tf-panel-group" aria-labelledby="tfp-vault">
          <h4 id="tfp-vault">Bóveda</h4>
          <select aria-label="Bóveda" value={filter.vault ?? "all"} onChange={(event) => onChange({ ...filter, vault: event.target.value })}>
            <option value="all">Todas las bóvedas</option>
            {vaults.map((vault) => (
              <option key={vault.id} value={vault.id}>
                {vault.name} ({tasks.filter((t) => t.vault_id === vault.id).length})
              </option>
            ))}
          </select>
        </section>
      )}

      {projects && projects.length > 0 && (
        <section className="tf-panel-group" aria-labelledby="tfp-project">
          <h4 id="tfp-project">Proyecto</h4>
          <select aria-label="Proyecto" value={filter.project ?? "all"} onChange={(event) => onChange({ ...filter, project: event.target.value })}>
            <option value="all">Todos los proyectos</option>
            <option value="none">Sin proyecto</option>
            {projects.map((project) => <option key={project.id} value={project.id}>{project.title}</option>)}
          </select>
        </section>
      )}

      <section className="tf-panel-group" aria-labelledby="tfp-who">
        <h4 id="tfp-who">Asignada a</h4>
        <AgentSelect label="Asignada a" all value={filter.assignee} onChange={(assignee) => onChange({ ...filter, assignee })} agents={agentIds} />
      </section>

      <section className="tf-panel-group" aria-labelledby="tfp-status">
        <h4 id="tfp-status">Estado</h4>
        <div className="tf-panel-chips" role="group" aria-labelledby="tfp-status">
          {STATUSES.map((status) => (
            <button key={status} type="button" className="tf-panel-chip" data-status={status} aria-pressed={filter.statuses.includes(status)} onClick={() => toggle(status)}>
              <span className="tf-panel-dot" aria-hidden="true" />
              <span className="tf-panel-chip-name">{STATUS_LABEL[status]}</span>
              <span className="tf-panel-chip-count">{count({ statuses: [status] })}</span>
            </button>
          ))}
        </div>
        <p className="tf-panel-help">{filter.statuses.length === 0 ? "Sin elegir ninguno se muestran todos los estados." : "Se muestran las tareas en cualquiera de los estados marcados."}</p>
      </section>

      <section className="tf-panel-group" aria-labelledby="tfp-due">
        <h4 id="tfp-due">Vence</h4>
        <div className="tf-panel-options" role="radiogroup" aria-labelledby="tfp-due">
          {DUE_OPTIONS.map((option) => (
            <label key={option.value} className="tf-panel-option" title={option.hint}>
              <input type="radio" name="tfp-due" value={option.value} checked={filter.due === option.value} onChange={() => onChange({ ...filter, due: option.value })} />
              <span className="tf-panel-option-body">
                <span>{option.label}</span>
                {option.value !== "all" && <span className="tf-panel-chip-count">{count({ due: option.value })}</span>}
              </span>
            </label>
          ))}
        </div>
      </section>

      <footer className="tf-panel-foot">
        <p><strong>{shown}</strong> de {tasks.length} tarea{tasks.length === 1 ? "" : "s"}{active > 0 ? " con estos filtros" : ""}.</p>
        <p>Las tareas cerradas se eliminan 30 días después de cerrarse.</p>
      </footer>
    </div>
  );
}
