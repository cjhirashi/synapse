import { useCallback, useContext, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { MeContext } from "../auth/RequireAuth";
import { ConfirmDialog } from "../editor/ConfirmDialog";
import { serial } from "../sync/lifecycle";
import { purgeSharedReplicasNotIn } from "../sync/sharedReplicas";
import { formatCdmx } from "../notes/cdmxTime";
import { acceptInvitation, leaveInvitation, listInvitations, rejectInvitation, type Invitation } from "./sharingApi";
import { grantsText } from "./grants";
import "./sharing.css";

type Notice = { kind: "status" | "alert"; text: string } | null;

const vaultName = (inv: Invitation) => inv.vault_name ?? "una bóveda";
const ownerName = (inv: Invitation) => (inv.owner ? inv.owner.display_name || inv.owner.email : "Alguien");

export default function SharedWithMePage() {
  const [invitations, setInvitations] = useState<Invitation[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [notice, setNotice] = useState<Notice>(null);
  const [busy, setBusy] = useState(false);
  const [confirming, setConfirming] = useState<Invitation | null>(null);
  const sub = useContext(MeContext)?.user_id;

  const load = useCallback(async () => {
    try {
      const { items } = await listInvitations();
      setInvitations(items);
      setFailed(false);
      // Una bóveda de la que ya no se es miembro (salió, o le quitaron el acceso) no deja su copia en este dispositivo.
      if (sub) void serial(() => purgeSharedReplicasNotIn(sub, new Set(items.filter((item) => item.status === "activo").map((item) => item.vault_id)))).catch(() => undefined);
    } catch {
      setFailed(true);
    }
  }, [sub]);

  useEffect(() => {
    void load();
  }, [load]);

  async function respond(call: (id: string) => Promise<void>, inv: Invitation, done: string) {
    setBusy(true);
    setNotice(null);
    try {
      await call(inv.id);
      setNotice({ kind: "status", text: done });
    } catch (err) {
      const status = (err as { status?: number }).status;
      const gone = status === 404 || status === 409;
      setNotice({ kind: "alert", text: gone ? "Esa invitación ya no está disponible." : "No se pudo completar. Inténtalo de nuevo." });
    } finally {
      setBusy(false);
      setConfirming(null);
      void load();
    }
  }

  const pending = invitations?.filter((inv) => inv.status === "pendiente") ?? [];
  const active = invitations?.filter((inv) => inv.status === "activo") ?? [];

  return (
    <section className="shared-page">
      <h1>Compartidas conmigo</h1>
      {notice && <p role={notice.kind}>{notice.text}</p>}

      {failed && (
        <div role="alert">
          No se pudieron cargar las invitaciones.{" "}
          <button type="button" onClick={() => void load()}>
            Reintentar
          </button>
        </div>
      )}

      {invitations === null && !failed && <p>Cargando…</p>}

      {invitations !== null && pending.length === 0 && active.length === 0 && (
        <p className="shared-empty">
          Nadie ha compartido bóvedas contigo todavía.
          <span className="shared-empty-hint">Cuando alguien te invite, aparecerá aquí y en tus avisos.</span>
        </p>
      )}

      {pending.length > 0 && (
        <section className="shared-section">
          <h2>Invitaciones</h2>
          <ul className="shared-list">
            {pending.map((inv) => (
              <li key={inv.id} className="shared-card">
                <div className="shared-main">
                  <span className="shared-title">{inv.vault_name ?? "Una bóveda"}</span>
                  <span className="shared-owner">Te invitó {ownerName(inv)}</span>
                  <span className="shared-grants">{grantsText(inv.grants)}</span>
                  <time className="shared-date" dateTime={inv.created_at}>
                    Invitación del {formatCdmx(inv.created_at)}
                  </time>
                </div>
                <div className="shared-actions">
                  <button
                    type="button"
                    className="shared-btn shared-btn--primary"
                    disabled={busy}
                    aria-label={`Aceptar invitación a «${vaultName(inv)}»`}
                    onClick={() => void respond(acceptInvitation, inv, `Aceptaste la invitación a «${vaultName(inv)}».`)}
                  >
                    Aceptar
                  </button>
                  <button
                    type="button"
                    className="shared-btn"
                    disabled={busy}
                    aria-label={`Rechazar invitación a «${vaultName(inv)}»`}
                    onClick={() => void respond(rejectInvitation, inv, `Rechazaste la invitación a «${vaultName(inv)}».`)}
                  >
                    Rechazar
                  </button>
                </div>
              </li>
            ))}
          </ul>
        </section>
      )}

      {active.length > 0 && (
        <section className="shared-section">
          <h2>Bóvedas compartidas</h2>
          <ul className="shared-list">
            {active.map((inv) => (
              <li key={inv.id} className="shared-card">
                <div className="shared-main">
                  <span className="shared-title">{inv.vault_name ?? "Una bóveda"}</span>
                  <span className="shared-owner">De {ownerName(inv)}</span>
                  <span className="shared-grants">{grantsText(inv.grants)}</span>
                </div>
                <div className="shared-actions">
                  <Link
                    to={`/compartidas/${encodeURIComponent(inv.vault_id)}`}
                    className="shared-btn shared-btn--primary"
                    aria-label={`Abrir «${vaultName(inv)}»`}
                  >
                    Abrir
                  </Link>
                  <button
                    type="button"
                    className="shared-btn shared-btn--danger"
                    disabled={busy}
                    aria-label={`Salir de «${vaultName(inv)}»`}
                    onClick={() => setConfirming(inv)}
                  >
                    Salir
                  </button>
                </div>
              </li>
            ))}
          </ul>
        </section>
      )}

      {confirming && (
        <ConfirmDialog
          titleId="leave-title"
          title={`¿Salir de «${vaultName(confirming)}»?`}
          tone="danger"
          body="Perderás el acceso. El propietario podrá invitarte de nuevo."
          onCancel={() => setConfirming(null)}
        >
          <button type="button" data-autofocus onClick={() => setConfirming(null)}>
            Cancelar
          </button>
          <button
            type="button"
            className="btn-danger"
            disabled={busy}
            onClick={() => void respond(leaveInvitation, confirming, `Saliste de «${vaultName(confirming)}».`)}
          >
            Salir
          </button>
        </ConfirmDialog>
      )}
    </section>
  );
}
