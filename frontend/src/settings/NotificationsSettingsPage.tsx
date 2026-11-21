import { useEffect, useState } from "react";
import { AlarmClock, BellOff, BellRing, CheckCheck, Globe, MonitorSmartphone, Moon, Send, UserPlus, Users, type LucideIcon } from "lucide-react";
import {
  getPreferences, pushStatus, sendTestPush, setPreference, setQuietHours, type NoticeKind, type Preferences, type PushStatus,
} from "../notifications/notificationsApi";
import { currentEndpoint, disablePush, enablePush, supportState, type PushSupport } from "../notifications/pushClient";
import "../notifications/notifications.css";

const OPTIONS: { kind: NoticeKind; label: string; hint: string; Icon: LucideIcon }[] = [
  { kind: "task_assigned", label: "Un agente me asigna una tarea", hint: "Cuando un agente crea o te reasigna una tarea o subtarea.", Icon: UserPlus },
  { kind: "task_status", label: "Un agente cambia el estado de una tarea mía", hint: "Cuando un agente la marca como hecha, en progreso o cancelada.", Icon: CheckCheck },
  { kind: "task_due", label: "Las tareas vencen", hint: "A 24 h y a 1 h del vencimiento (o con los recordatorios de cada tarea) y cuando vence sin cerrarse; también las tareas de tus agentes.", Icon: AlarmClock },
  { kind: "publication_expired", label: "Una publicación se despublica sola", hint: "Cuando llega la fecha de despublicación de un documento y su enlace deja de funcionar.", Icon: Globe },
  { kind: "vault_share", label: "Invitaciones a bóvedas compartidas", hint: "Cuando alguien te invita a una bóveda o te cambia el acceso a ella.", Icon: Users },
];

const SUPPORT_TEXT: Record<Exclude<PushSupport, "ready">, string> = {
  unsupported: "Este navegador no admite notificaciones push.",
  "no-worker": "Las notificaciones en el dispositivo se activan desde la app publicada (con el service worker instalado).",
  denied: "El permiso de notificaciones está bloqueado en este navegador; habilítalo en la configuración del sitio.",
};

/** Minutos que dura la ventana silenciosa (puede cruzar la medianoche); 0 si alguna hora no es válida. */
function quietSpan(start: string, end: string): number {
  const minutes = (value: string) => { const [h, m] = value.split(":").map(Number); return Number.isNaN(h) || Number.isNaN(m) ? null : h * 60 + m; };
  const from = minutes(start);
  const to = minutes(end);
  if (from === null || to === null || from === to) return 0;
  return to > from ? to - from : 24 * 60 - from + to;
}

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
    setMessage(result.sent > 0 ? `Aviso de prueba enviado a ${result.sent} ${result.sent === 1 ? "dispositivo" : "dispositivos"}. Si no lo ves, revisa que el navegador tenga permiso para notificar y que el sistema no esté en «No molestar».` : "No se pudo enviar el aviso de prueba a ningún dispositivo.");
    await refreshDevice();
  });

  const deviceOn = push?.enabled === true && support === "ready" && subscribed;
  const quietMinutes = prefs ? quietSpan(prefs.quiet.start, prefs.quiet.end) : 0;
  const quietText = prefs?.quiet.enabled
    ? `No recibirás notificaciones en el dispositivo de ${prefs.quiet.start} a ${prefs.quiet.end} (hora de Ciudad de México); los avisos de ese rato salen al terminar.`
    : "Recibirás notificaciones a cualquier hora.";
  const quietTooLong = prefs?.quiet.enabled === true && quietMinutes > 12 * 60;

  return (
    <section className="notices-settings">
      <h2>Notificaciones</h2>
      <p className="settings-section-intro">Decide qué te avisa Synapse y cuándo. Los avisos siempre quedan en la pantalla Avisos.</p>
      {failed && <p className="tasks-error" role="alert">No se pudo leer o guardar la configuración.</p>}

      <div className="settings-card">
        <h3>Qué avisos recibo</h3>
        <ul className="notif-rows">
          {prefs && OPTIONS.map(({ kind, label, hint, Icon }) => (
            <li key={kind}>
              <label className="notif-row">
                <span className="notif-icon" aria-hidden="true"><Icon size={18} /></span>
                <span className="notif-text"><span className="notif-title">{label}</span><span className="notif-hint">{hint}</span></span>
                <input className="notif-switch" type="checkbox" checked={prefs.kinds[kind] ?? true} onChange={(e) => void toggle(kind, e.target.checked)} />
              </label>
            </li>
          ))}
        </ul>
      </div>

      <div className="settings-card">
        <h3>En este dispositivo</h3>
        <div className="notif-device">
          <span className={`notif-icon notif-icon--${deviceOn ? "on" : "off"}`} aria-hidden="true">{deviceOn ? <BellRing size={18} /> : <BellOff size={18} />}</span>
          <span className="notif-text">
            <span className="notif-title">{deviceOn ? "Notificaciones activadas" : "Notificaciones desactivadas"}</span>
            <span className="notif-hint">
              {push && !push.enabled && "El servidor no tiene configuradas las notificaciones en el dispositivo."}
              {push?.enabled && support !== "ready" && SUPPORT_TEXT[support]}
              {push?.enabled && support === "ready" && (deviceOn ? "Este dispositivo recibirá avisos aunque la app esté cerrada." : "Actívalas para recibir avisos aunque la app esté cerrada.")}
            </span>
          </span>
          {push && push.devices > 0 && <span className="notif-pill"><MonitorSmartphone size={14} aria-hidden="true" /> {push.devices} {push.devices === 1 ? "dispositivo" : "dispositivos"}</span>}
        </div>
        {push?.enabled && support === "ready" && (
          <div className="notif-actions">
            {subscribed
              ? <button type="button" onClick={() => void deactivate()}>Desactivar en este dispositivo</button>
              : <button type="button" className="btn-primary" onClick={() => void activate()}>Activar notificaciones</button>}
            {push.devices > 0 && <button type="button" onClick={() => void test()}><Send size={14} aria-hidden="true" /> Enviar aviso de prueba</button>}
          </div>
        )}
        {message && <p className="notif-message" role="status">{message}</p>}
      </div>

      {prefs && (
        <div className="settings-card">
          <h3>Horas silenciosas</h3>
          <label className="notif-row">
            <span className="notif-icon" aria-hidden="true"><Moon size={18} /></span>
            <span className="notif-text"><span className="notif-title">Activar horas silenciosas</span><span className="notif-hint">{quietText}</span></span>
            <input className="notif-switch" type="checkbox" checked={prefs.quiet.enabled} onChange={(e) => void saveQuiet({ enabled: e.target.checked })} />
          </label>
          {quietTooLong && (
            <p className="notif-warning" role="alert">
              Son {Math.round(quietMinutes / 60)} h al día sin notificaciones en el dispositivo (solo recibirías avisos entre las {prefs.quiet.end} y las {prefs.quiet.start}). ¿Es lo que quieres?
            </p>
          )}
          <div className="notif-times">
            <label>Desde<input type="time" aria-label="Inicio de horas silenciosas" value={prefs.quiet.start} disabled={!prefs.quiet.enabled} onChange={(e) => e.target.value && void saveQuiet({ start: e.target.value })} /></label>
            <label>Hasta<input type="time" aria-label="Fin de horas silenciosas" value={prefs.quiet.end} disabled={!prefs.quiet.enabled} onChange={(e) => e.target.value && void saveQuiet({ end: e.target.value })} /></label>
          </div>
        </div>
      )}
    </section>
  );
}
