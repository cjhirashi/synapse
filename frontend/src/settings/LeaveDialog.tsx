import { useId, useState } from "react";
import { SkillInfo, SkillResolution, skillName } from "./agentAccess";

type Choice = { accion: "assign"; a: string } | { accion: "delete" } | { accion: "archive" };

export interface LeaveDialogProps {
  agentId: string;
  modo: "quitar" | "suspender";
  /** Skills activas de las que el agente es propietario (las únicas que hay que resolver). */
  owned: SkillInfo[];
  busy: boolean;
  onConfirm: (resolutions: SkillResolution[]) => void;
  onCancel: () => void;
}

/**
 * Ventana que se abre al quitar o suspender a un gestor que es propietario de skills (H-041 E4). Una skill activa
 * nunca queda sin propietario: con invitados se asigna a uno de ellos o se elimina; sin invitados, se elimina o se
 * archiva (queda en su carpeta, inactiva y sin propietario, hasta que el usuario la asigne a un gestor).
 */
export default function LeaveDialog({ agentId, modo, owned, busy, onConfirm, onCancel }: LeaveDialogProps) {
  const titleId = useId();
  const [choices, setChoices] = useState<Record<string, Choice | undefined>>({});
  const verb = modo === "quitar" ? "Quitar" : "Suspender";
  const complete = owned.every((skill) => choices[skill.note_id] !== undefined);

  function choose(skill: SkillInfo, choice: Choice) {
    setChoices((current) => ({ ...current, [skill.note_id]: choice }));
  }

  return (
    <div className="agent-leave-backdrop">
      <div role="dialog" aria-modal="true" aria-labelledby={titleId} className="agent-leave-dialog card-form">
        <h2 id={titleId}>
          {verb} a {agentId}
        </h2>
        <p>
          {agentId} es propietario de {owned.length} skill{owned.length === 1 ? "" : "s"} activa{owned.length === 1 ? "" : "s"}. Una skill activa nunca queda
          sin propietario: elige qué pasa con cada una antes de continuar.
        </p>
        <ul className="agent-leave-skills">
          {owned.map((skill) => {
            const name = skillName(skill);
            const guests = skill.agentes;
            const choice = choices[skill.note_id];
            return (
              <li key={skill.note_id} aria-label={`Skill ${name}`}>
                <strong>{name}</strong> <small>{guests.length > 0 ? `invitados: ${guests.join(", ")}` : "sin invitados"}</small>
                <fieldset>
                  <legend>Qué hacer con {name}</legend>
                  {guests.length > 0 && (
                    <label>
                      <input
                        type="radio"
                        name={`accion-${skill.note_id}`}
                        checked={choice?.accion === "assign"}
                        onChange={() => choose(skill, { accion: "assign", a: choice?.accion === "assign" ? choice.a : guests[0] })}
                      />
                      Asignar a
                      <select
                        aria-label={`Nuevo propietario de ${name}`}
                        value={choice?.accion === "assign" ? choice.a : guests[0]}
                        onChange={(event) => choose(skill, { accion: "assign", a: event.target.value })}
                      >
                        {guests.map((guest) => (
                          <option key={guest} value={guest}>
                            {guest}
                          </option>
                        ))}
                      </select>
                    </label>
                  )}
                  <label>
                    <input type="radio" name={`accion-${skill.note_id}`} checked={choice?.accion === "delete"} onChange={() => choose(skill, { accion: "delete" })} />
                    Eliminar
                  </label>
                  {guests.length === 0 && (
                    <label>
                      <input type="radio" name={`accion-${skill.note_id}`} checked={choice?.accion === "archive"} onChange={() => choose(skill, { accion: "archive" })} />
                      Archivar (queda inactiva y sin propietario hasta que la asignes)
                    </label>
                  )}
                </fieldset>
              </li>
            );
          })}
        </ul>
        <div className="agent-leave-actions">
          <button
            type="button"
            disabled={busy || !complete}
            onClick={() => onConfirm(owned.map((skill) => ({ note_id: skill.note_id, ...(choices[skill.note_id] as Choice) })))}
          >
            Confirmar y {modo === "quitar" ? "quitar" : "suspender"}
          </button>
          <button type="button" className="note-sidebar-secondary" disabled={busy} onClick={onCancel}>
            Cancelar
          </button>
        </div>
      </div>
    </div>
  );
}
