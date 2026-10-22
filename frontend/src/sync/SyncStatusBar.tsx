/**
 * Indicador de la sincronización en el layout (SPEC-0005 RF-009, RF-010, RF-016, RF-019;
 * PLAN-0005 §2.5).
 *
 * Muestra el estado, la hora de la última sincronización correcta (para no trabajar sobre
 * datos viejos sin saberlo, R-4) y enlaces a los rechazos y conflictos que esperan al
 * usuario. No se muestra mientras no se replica (cambio de contraseña pendiente).
 */
import { Link } from "react-router-dom";
import type { SyncState } from "./status";
import { useSync } from "./useSync";

const STATE_TEXT: Record<SyncState, string> = {
  online: "Sincronizado",
  syncing: "Sincronizando…",
  pending: "Cambios pendientes",
  offline: "Sin conexión",
  "session-expired": "La sesión caducó: inicia sesión para seguir sincronizando.",
};

/** Hora local legible de una marca `utc_now` (la del servidor, en UTC). */
function formatTime(utc: string): string {
  return new Date(utc).toLocaleString("es", { dateStyle: "short", timeStyle: "short" });
}

/** "1 conflicto", "2 conflictos". */
function count(n: number, singular: string, plural: string): string {
  return `${n} ${n === 1 ? singular : plural}`;
}

export default function SyncStatusBar() {
  const { replicating, status, rejections, conflicts } = useSync();
  if (!replicating) return null;

  // Sin conexión los cambios locales siguen pendientes: se dice también (RF-009, RF-010).
  const text = status.state === "offline" && status.pending ? `${STATE_TEXT.offline} · cambios pendientes` : STATE_TEXT[status.state];

  return (
    <section aria-label="Sincronización" className="sync-status-bar">
      <p role="status">
        <span className="sync-status-dot" aria-hidden="true" />
        {text}
        {status.state === "session-expired" && (
          <>
            {" "}
            <Link to="/login">Iniciar sesión</Link>
          </>
        )}
      </p>
      <p>
        {status.lastSyncAt ? (
          <>
            Última sincronización: <time dateTime={status.lastSyncAt}>{formatTime(status.lastSyncAt)}</time>
          </>
        ) : (
          "Aún no se ha sincronizado"
        )}
      </p>
      {rejections.length > 0 && (
        <Link to="/rejections">{count(rejections.length, "cambio rechazado", "cambios rechazados")}</Link>
      )}{" "}
      {conflicts.length > 0 && <Link to="/conflicts">{count(conflicts.length, "conflicto", "conflictos")}</Link>}
    </section>
  );
}
