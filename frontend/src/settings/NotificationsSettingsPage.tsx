import { useEffect, useState } from "react";
import { getPreferences, setPreference, type NoticeKind } from "../notifications/notificationsApi";
import "../notifications/notifications.css";

const OPTIONS: { kind: NoticeKind; label: string; hint: string }[] = [
  { kind: "task_assigned", label: "Un agente me asigna una tarea", hint: "Aviso cuando un agente crea o te reasigna una tarea o subtarea." },
  { kind: "task_status", label: "Un agente cambia el estado de una tarea mía", hint: "Aviso cuando un agente marca como hecha, en progreso o cancelada una tarea que creaste." },
  { kind: "task_due", label: "Mis tareas vencen", hint: "Avisos a 24 h y a 1 h del vencimiento, y cuando una tarea vence sin cerrarse." },
];

/** Sección Notificaciones (H-053): qué tipos de aviso quieres recibir. Los apagados dejan de generarse. */
export default function NotificationsSettingsPage() {
  const [prefs, setPrefs] = useState<Record<NoticeKind, boolean> | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    getPreferences().then(setPrefs).catch(() => setFailed(true));
  }, []);

  async function toggle(kind: NoticeKind, enabled: boolean) {
    try {
      setPrefs(await setPreference(kind, enabled));
      setFailed(false);
    } catch {
      setFailed(true);
    }
  }

  return (
    <section className="notices-settings">
      <h2>Notificaciones</h2>
      <p className="settings-section-intro">Elige qué avisos recibes en la pantalla Avisos. Un tipo apagado deja de generarse.</p>
      {failed && <p className="tasks-error" role="alert">No se pudo leer o guardar la preferencia.</p>}
      {prefs && OPTIONS.map(({ kind, label, hint }) => (
        <label key={kind}>
          <input type="checkbox" checked={prefs[kind] ?? true} onChange={(e) => void toggle(kind, e.target.checked)} />
          <span>{label}<small>{hint}</small></span>
        </label>
      ))}
    </section>
  );
}
