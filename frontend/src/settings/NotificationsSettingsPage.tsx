import { useEffect, useState } from "react";
import {
  getPreferences, pushStatus, sendTestPush, setPreference, setQuietHours, type NoticeKind, type Preferences, type PushStatus,
} from "../notifications/notificationsApi";
import { currentEndpoint, disablePush, enablePush, supportState, type PushSupport } from "../notifications/pushClient";
import "../notifications/notifications.css";

const OPTIONS: { kind: NoticeKind; label: string; hint: string }[] = [
  { kind: "task_assigned", label: "Un agente me asigna una tarea", hint: "Aviso cuando un agente crea o te reasigna una tarea o subtarea." },
  { kind: "task_status", label: "Un agente cambia el estado de una tarea mía", hint: "Aviso cuando un agente marca como hecha, en progreso o cancelada una tarea que creaste." },
  { kind: "task_due", label: "Mis tareas vencen", hint: "Avisos a 24 h y a 1 h del vencimiento, y cuando una tarea vence sin cerrarse." },
];

const SUPPORT_TEXT: Record<Exclude<PushSupport, "ready">, string> = {
  unsupported: "Este navegador no admite notificaciones push.",
  "no-worker": "Las notificaciones en el dispositivo se activan desde la app publicada (con el service worker instalado).",
  denied: "El permiso de notificaciones está bloqueado en este navegador; habilítalo en la configuración del sitio.",
};

/** Sección Notificaciones (H-053): qué avisos recibes, las horas silenciosas y las notificaciones en este dispositivo. */
export default function NotificationsSettingsPage() {
  const [prefs, setPrefs] = useState<Preferences | null>(null);
  const [push, setPush] = useState<PushStatus | null>(null);
  const [support, setSupport] = useState<PushSupport>("unsupported");
  const [subscribed, setSubscribed] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);

  async function refreshDevice() {
    setSupport(await supportState());
    setSubscribed((await currentEndpoint()) !== null);
    setPush(await pushStatus());
  }

  useEffect(() => {
    getPreferences().then(setPrefs).catch(() => setFailed(true));
    refreshDevice().catch(() => setFailed(true));
  }, []);

  async function run(action: () => Promise<void>) {
    try {
      setFailed(false);
      await action();
    } catch {
      setFailed(true);
    }
  }

  const toggle = (kind: NoticeKind, enabled: boolean) => run(async () => setPrefs(await setPreference(kind, enabled)));
  const saveQuiet = (patch: Partial<Preferences["quiet"]>) => prefs && run(async () => setPrefs(await setQuietHours({ ...prefs.quiet, ...patch })));

  const activate = () => run(async () => {
    const granted = await enablePush(push?.public_key ?? "");
    setMessage(granted ? "Notificaciones activadas en este dispositivo." : "No diste permiso: las notificaciones siguen apagadas.");
    await refreshDevice();
  });
  const deactivate = () => run(async () => {
    await disablePush();
    setMessage("Notificaciones desactivadas en este dispositivo.");
    await refreshDevice();
  });
  const test = () => run(async () => {
    const result = await sendTestPush();
    setMessage(result.sent > 0 ? "Aviso de prueba enviado." : "No se pudo enviar el aviso de prueba a ningún dispositivo.");
    await refreshDevice();
  });

  return (
    <section className="notices-settings">
      <h2>Notificaciones</h2>
      <p className="settings-section-intro">Elige qué avisos recibes en la pantalla Avisos. Un tipo apagado deja de generarse.</p>
      {failed && <p className="tasks-error" role="alert">No se pudo leer o guardar la configuración.</p>}
      {prefs && OPTIONS.map(({ kind, label, hint }) => (
        <label key={kind}>
          <input type="checkbox" checked={prefs.kinds[kind] ?? true} onChange={(e) => void toggle(kind, e.target.checked)} />
          <span>{label}<small>{hint}</small></span>
        </label>
      ))}

      <h3>En este dispositivo</h3>
      {push && !push.enabled && <p className="settings-section-intro">El servidor no tiene configuradas las notificaciones en el dispositivo.</p>}
      {push?.enabled && support !== "ready" && <p className="settings-section-intro">{SUPPORT_TEXT[support]}</p>}
      {push?.enabled && support === "ready" && (
        <p className="notices-actions">
          {subscribed
            ? <button type="button" onClick={() => void deactivate()}>Desactivar en este dispositivo</button>
            : <button type="button" onClick={() => void activate()}>Activar notificaciones</button>}
          {push.devices > 0 && <button type="button" onClick={() => void test()}>Enviar aviso de prueba</button>}
        </p>
      )}
      {push?.enabled && <p className="settings-section-intro">Dispositivos con notificaciones: {push.devices}.</p>}
      {message && <p role="status">{message}</p>}

      {prefs && (
        <>
          <h3>Horas silenciosas</h3>
          <p className="settings-section-intro">Dentro de este horario (hora de Ciudad de México) no se envían notificaciones al dispositivo; los avisos siguen en la pantalla Avisos.</p>
          <label>
            <input type="checkbox" checked={prefs.quiet.enabled} onChange={(e) => void saveQuiet({ enabled: e.target.checked })} />
            <span>Activar horas silenciosas</span>
          </label>
          <p className="notices-actions">
            <label>Desde <input type="time" aria-label="Inicio de horas silenciosas" value={prefs.quiet.start} disabled={!prefs.quiet.enabled} onChange={(e) => e.target.value && void saveQuiet({ start: e.target.value })} /></label>
            <label>Hasta <input type="time" aria-label="Fin de horas silenciosas" value={prefs.quiet.end} disabled={!prefs.quiet.enabled} onChange={(e) => e.target.value && void saveQuiet({ end: e.target.value })} /></label>
          </p>
        </>
      )}
    </section>
  );
}
