import { useId, useState, type CSSProperties } from "react";
import { FolderKanban } from "lucide-react";
import AgentSelect from "../agents/AgentSelect";
import DialogFrame from "../editor/DialogFrame";
import {
  PROJECT_COLORS, PROJECT_COLOR_CSS, PROJECT_COLOR_LABEL, PROJECT_STATUSES, PROJECT_STATUS_LABEL,
  type Project, type ProjectColor, type ProjectInput, type ProjectStatus,
} from "./projectsApi";

interface Props {
  /** El proyecto que se edita; sin él se crea uno. */
  project?: Project;
  agents: string[];
  accent: string;
  error: string | null;
  saving: boolean;
  onSave: (input: ProjectInput & { title: string }) => void;
  onCancel: () => void;
}

/** Alta y edición de un proyecto (H-058): título, descripción, responsable (la persona o un agente), estado y color. */
export default function ProjectForm({ project, agents, accent, error, saving, onSave, onCancel }: Props) {
  const id = useId();
  const [title, setTitle] = useState(project?.title ?? "");
  const [description, setDescription] = useState(project?.description ?? "");
  const [assignee, setAssignee] = useState(project ? (project.assignee_type === "agent" ? (project.assignee_agent_id ?? "user") : "user") : "user");
  const [status, setStatus] = useState<ProjectStatus>(project?.status ?? "active");
  const [color, setColor] = useState<ProjectColor>(project?.color ?? "blue");
  const agentChoices = Array.from(new Set([...agents, ...(project?.assignee_agent_id ? [project.assignee_agent_id] : [])]));
  const canSave = title.trim().length > 0 && !saving;

  function submit() {
    if (!canSave) return;
    onSave({
      title: title.trim(),
      description: description.trim() || null,
      status,
      color,
      assignee_type: assignee === "user" ? "user" : "agent",
      assignee_agent_id: assignee === "user" ? null : assignee,
    });
  }

  return (
    <DialogFrame
      role="dialog" titleId={`${id}-title`} title={project ? "Editar proyecto" : "Nuevo proyecto"} glyph={FolderKanban}
      tone="accent" accent={accent} size="md" top backdropClosable={false} onCancel={onCancel} onEnter={submit}
      actions={
        <>
          <button type="button" onClick={onCancel}>Cancelar</button>
          <button type="button" className="btn-primary" disabled={!canSave} onClick={submit}>{saving ? "Guardando…" : "Guardar"}</button>
        </>
      }
    >
      <form className="tf" style={{ "--vault-icon-color": accent } as CSSProperties} onSubmit={(e) => { e.preventDefault(); submit(); }}>
        <div className="tf-field">
          <label htmlFor={`${id}-t`}>Título</label>
          <input id={`${id}-t`} autoFocus value={title} maxLength={255} placeholder="Nombre del proyecto" onChange={(e) => setTitle(e.target.value)} />
        </div>
        <div className="tf-field">
          <label htmlFor={`${id}-d`}>Descripción</label>
          <textarea id={`${id}-d`} rows={3} value={description} placeholder="De qué trata y qué se busca lograr" onChange={(e) => setDescription(e.target.value)} />
        </div>
        <div className="tf-field">
          <label htmlFor={`${id}-a`}>Responsable</label>
          <AgentSelect id={`${id}-a`} label="Responsable" value={assignee} onChange={setAssignee} agents={agentChoices} />
        </div>
        <fieldset className="tf-field">
          <legend>Estado</legend>
          <div className="tf-segments" role="radiogroup" aria-label="Estado del proyecto">
            {PROJECT_STATUSES.map((value) => (
              <label key={value} className="tf-segment">
                <input type="radio" name={`${id}-st`} value={value} checked={status === value} onChange={() => setStatus(value)} />
                <span>{PROJECT_STATUS_LABEL[value]}</span>
              </label>
            ))}
          </div>
        </fieldset>
        <fieldset className="tf-field">
          <legend>Color</legend>
          <div className="pj-colors" role="radiogroup" aria-label="Color del proyecto">
            {PROJECT_COLORS.map((value) => (
              <label key={value} className="pj-color" title={PROJECT_COLOR_LABEL[value]}>
                <input type="radio" name={`${id}-co`} value={value} aria-label={PROJECT_COLOR_LABEL[value]} checked={color === value} onChange={() => setColor(value)} />
                <span style={{ background: PROJECT_COLOR_CSS[value] }} aria-hidden="true" />
              </label>
            ))}
          </div>
        </fieldset>
        {error && <p className="tasks-error" role="alert">{error}</p>}
      </form>
    </DialogFrame>
  );
}
