/**
 * Aviso al cerrar sesión con cambios sin confirmar (SPEC-0005 RF-017; C-4; PLAN-0005 §2.5, §12).
 *
 * La lógica vive en `SyncProvider` (`useSync().logout`); esto sólo la presenta. Si la réplica
 * no pudo leerse (`reason: "unreadable"`) lo dice y no ofrece sincronizar: el push leería la
 * misma réplica (VE-2). Opciones:
 * - "Sincronizar y salir": sólo con conexión y replicando; si el servidor no confirma todo,
 *   vuelve aquí con el aviso del fallo;
 * - "Salir y descartar": cierra la sesión y borra la réplica con sus cambios;
 * - "Cancelar": cierra el aviso.
 * Si el servidor no cierra la sesión, nada se borra y se avisa (también al salir directo).
 */
import { useSync } from "./useSync";

const LOGOUT_FAILED = "No se pudo cerrar la sesión. Inténtalo de nuevo.";
const SYNC_FAILED = "No se pudieron sincronizar todos los cambios. Revisa los cambios rechazados o inténtalo de nuevo.";

/** Título y explicación del aviso según por qué se abrió. */
const COPY = {
  pending: {
    title: "Hay cambios sin sincronizar",
    body: "Al cerrar sesión se borra la copia de tus bóvedas en este dispositivo. Los cambios que el servidor aún no confirmó se perderán.",
  },
  unreadable: {
    title: "No se pudo comprobar si hay cambios sin sincronizar",
    body: "No se pudo leer la copia de tus bóvedas en este dispositivo. Si cierras sesión, los cambios que el servidor aún no confirmó se perderán.",
  },
  draft: {
    title: "Hay cambios sin guardar en una nota",
    body: "Al cerrar sesión se pierde el borrador de la nota que tienes abierta.",
  },
} as const;

/** Línea extra cuando, además del motivo, hay un borrador sin guardar (SPEC-0008 N-1). */
const DRAFT_NOTE = "Además, una nota abierta tiene cambios sin guardar: se perderán.";

export default function LogoutDialog() {
  const { logout, replicating, status } = useSync();
  const { phase, reason, failure } = logout;

  // Sin aviso abierto sólo puede quedar el fallo de una salida directa.
  if (phase === "closed") return failure === "logout" ? <p role="alert">{LOGOUT_FAILED}</p> : null;

  // Sin conexión, con la sesión caducada o con la réplica ilegible el push no puede
  // confirmar nada (RF-017, RF-016; VE-2).
  const canSync =
    reason === "pending" && replicating && status.state !== "offline" && status.state !== "session-expired";
  const copy = COPY[reason];
  const busy = phase === "syncing" || phase === "exiting";

  return (
    <div role="dialog" aria-modal="true" aria-labelledby="logout-dialog-title">
      <h2 id="logout-dialog-title">{copy.title}</h2>
      <p>{copy.body}</p>
      {logout.draft && reason !== "draft" && <p>{DRAFT_NOTE}</p>}
      {phase === "syncing" && <p role="status">Sincronizando…</p>}
      {phase === "exiting" && <p role="status">Cerrando sesión…</p>}
      {failure && <p role="alert">{failure === "sync" ? SYNC_FAILED : LOGOUT_FAILED}</p>}
      {canSync && (
        <button type="button" onClick={() => void logout.syncAndExit()} disabled={busy}>
          Sincronizar y salir
        </button>
      )}{" "}
      <button type="button" onClick={() => void logout.discardAndExit()} disabled={busy}>
        Salir y descartar
      </button>{" "}
      <button type="button" onClick={logout.cancel} disabled={busy}>
        Cancelar
      </button>
    </div>
  );
}
