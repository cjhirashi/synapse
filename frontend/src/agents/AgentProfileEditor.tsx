import { FormEvent, useRef, useState } from "react";
import { ApiError } from "../api/problems";
import UserAvatar from "../settings/UserAvatar";
import { AVATAR_MAX_BYTES, AVATAR_TYPES, squareAvatar } from "../settings/avatarImage";
import { useAgentProfiles } from "./agentProfiles";
import { deleteAgentPhoto, setAgentName, uploadAgentPhoto } from "./agentProfilesApi";
import "../settings/agents.css";
import "./agents.css";

const NAME_MAX = 60;

class TooLarge extends Error {}

function photoError(err: unknown): string {
  if (err instanceof TooLarge || (err instanceof ApiError && err.status === 413)) return "La imagen supera el máximo de 2 MB.";
  if (err instanceof ApiError && err.status === 415) return "Formato no admitido: usa PNG, JPEG o WebP.";
  return "No se pudo guardar la imagen. Inténtalo de nuevo.";
}

/**
 * Nombre visible e imagen de un agente (H-053). Con ellos se identifican sus huellas: la bitácora, quién crea una tarea
 * y a quién se le asigna. El `agent_id` técnico no cambia.
 */
export default function AgentProfileEditor({ agentId, onClose }: { agentId: string; onClose: () => void }) {
  const profiles = useAgentProfiles();
  const profile = profiles[agentId];
  const [name, setName] = useState(profile?.display_name ?? "");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const input = useRef<HTMLInputElement>(null);

  async function run(action: () => Promise<unknown>, done: string, fail: (err: unknown) => string) {
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      await action();
      setMessage(done);
    } catch (err) {
      setError(fail(err));
    } finally {
      setBusy(false);
    }
  }

  const saveName = (e: FormEvent) => {
    e.preventDefault();
    return run(() => setAgentName(agentId, name.trim() || null), "Nombre guardado.", () => "No se pudo guardar el nombre. Inténtalo de nuevo.");
  };

  async function pick(file: File | undefined) {
    if (!file) return;
    if (file.type && !AVATAR_TYPES.includes(file.type)) return setError("Formato no admitido: usa PNG, JPEG o WebP.");
    await run(async () => {
      const prepared = await squareAvatar(file);
      if (prepared.size > AVATAR_MAX_BYTES) throw new TooLarge();
      await uploadAgentPhoto(agentId, prepared);
    }, "Imagen guardada.", photoError);
    if (input.current) input.current.value = "";
  }

  const label = profile?.display_name || agentId;
  return (
    <form className="agent-editor" onSubmit={saveName} aria-label={`Personalizar ${agentId}`}>
      <div className="agent-editor-photo">
        <UserAvatar photoUrl={profile?.photo_url ?? null} label={label} size={72} alt={`Imagen de ${label}`} />
        <div className="agent-editor-photo-actions">
          <button type="button" disabled={busy} onClick={() => input.current?.click()}>
            {profile?.photo_url ? "Cambiar imagen" : "Elegir imagen"}
          </button>
          {profile?.photo_url && (
            <button type="button" className="ag-danger" disabled={busy} onClick={() => void run(() => deleteAgentPhoto(agentId), "Imagen quitada.", () => "No se pudo quitar la imagen.")}>
              Quitar imagen
            </button>
          )}
          <input ref={input} type="file" hidden accept={AVATAR_TYPES.join(",")} aria-label="Archivo de imagen del agente" onChange={(e) => void pick(e.target.files?.[0])} />
          <p className="ag-help">PNG, JPEG o WebP. Se recorta a cuadrado.</p>
        </div>
      </div>
      <div className="ag-field">
        <label htmlFor={`agent-name-${agentId}`}>Nombre visible</label>
        <input id={`agent-name-${agentId}`} value={name} maxLength={NAME_MAX} placeholder={agentId} onChange={(e) => setName(e.target.value)} />
        <p className="ag-help">Se muestra en la bitácora y en las tareas en lugar del id <code>{agentId}</code>, que no cambia.</p>
      </div>
      {error && <p role="alert" className="ag-callout ag-callout--warn">{error}</p>}
      {message && <p role="status" className="ag-sub">{message}</p>}
      <div className="ag-actions">
        <button type="submit" className="btn-primary" disabled={busy}>Guardar nombre</button>
        <button type="button" onClick={onClose}>Cerrar</button>
      </div>
    </form>
  );
}
