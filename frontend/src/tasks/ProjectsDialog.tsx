import { useId } from "react";
import { FolderKanban, Pencil, Plus, Trash2 } from "lucide-react";
import AgentBadge from "../agents/AgentBadge";
import UserBadge from "../agents/UserBadge";
import DialogFrame from "../editor/DialogFrame";
import { PROJECT_COLOR_CSS, PROJECT_STATUS_LABEL, type Project } from "./projectsApi";

interface Props {
  projects: Project[];
  accent: string;
  onNew: () => void;
  onEdit: (project: Project) => void;
  onDelete: (project: Project) => void;
  onClose: () => void;
}

/** Los proyectos de la bóveda (H-058): lista con su avance y acciones. Cada tarea elige su proyecto en su formulario. */
export default function ProjectsDialog({ projects, accent, onNew, onEdit, onDelete, onClose }: Props) {
  const id = useId();
  return (
    <DialogFrame
      role="dialog" titleId={`${id}-title`} title="Proyectos de la bóveda" glyph={FolderKanban} tone="accent" accent={accent} size="lg"
      subtitle="Agrupan las tareas de esta bóveda. Una tarea está en un solo proyecto y sus subtareas van con ella."
      showClose onCancel={onClose}
      actions={
        <>
          <button type="button" data-autofocus onClick={onClose}>Cerrar</button>
          <button type="button" className="btn-primary" onClick={onNew}><Plus size={14} aria-hidden="true" /> Nuevo proyecto</button>
        </>
      }
    >
      {projects.length === 0 ? (
        <p className="tasks-empty">Todavía no hay proyectos. Crea uno para agrupar tareas, como en Asana.</p>
      ) : (
        <ul className="pj-list">
          {projects.map((project) => (
            <li key={project.id} className="pj-item">
              <span className="pj-dot" style={{ background: PROJECT_COLOR_CSS[project.color] }} aria-hidden="true" />
              <span className="pj-body">
                <strong className="pj-title">{project.title}</strong>
                {project.description && <span className="pj-desc">{project.description}</span>}
                <span className="pj-meta">
                  <span className="tasks-chip" data-project-status={project.status}>{PROJECT_STATUS_LABEL[project.status]}</span>
                  <span className="tasks-chip">{project.tasks_done}/{project.tasks_total} tareas hechas</span>
                </span>
              </span>
              <span className="pj-who" title="Responsable">
                {project.assignee_type === "agent" && project.assignee_agent_id ? <AgentBadge agentId={project.assignee_agent_id} size={26} /> : <UserBadge size={26} />}
              </span>
              <button type="button" className="tasks-icon-btn" title="Editar" aria-label={`Editar el proyecto ${project.title}`} onClick={() => onEdit(project)}><Pencil size={15} /></button>
              <button type="button" className="tasks-icon-btn tasks-icon-btn--danger" title="Eliminar" aria-label={`Eliminar el proyecto ${project.title}`} onClick={() => onDelete(project)}><Trash2 size={15} /></button>
            </li>
          ))}
        </ul>
      )}
    </DialogFrame>
  );
}
