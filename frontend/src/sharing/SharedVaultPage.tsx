/**
 * Bóveda compartida abierta (H-064 F7c): ruta `/compartidas/:id`. Replica la bóveda en su propia réplica local
 * (`openSyncResources(..., { vaultId })`) y monta el espacio de trabajo de siempre con un contexto de sincronización que
 * apunta a esa réplica; el cierre de sesión y los borradores siguen siendo los del contexto padre.
 */
import { useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { useMe } from "../auth/RequireAuth";
import { NOTE_ID_PREFIX } from "../notes/noteRules";
import VaultWorkspacePage from "../notes/VaultWorkspacePage";
import { serial } from "../sync/lifecycle";
import { openSyncResources, type SyncEnv, type SyncResources } from "../sync/resources";
import type { ManualConflict } from "../sync/conflicts";
import type { Rejection } from "../sync/rejections";
import type { SyncStatus } from "../sync/status";
import { SyncContext, useSync, type SharedInfo, type SyncContextValue } from "../sync/useSync";
import { ID_PREFIX } from "../sync/vaultStore";
import { listInvitations, type Invitation } from "./sharingApi";

type Access = { kind: "loading" } | { kind: "failed" } | { kind: "missing" } | { kind: "ready"; invitation: Invitation };
type Phase = { kind: "loading" } | { kind: "error" } | { kind: "ready"; resources: SyncResources };

/** Abre la réplica compartida mientras la página está montada y publica el contexto con sus almacenes. */
function SharedWorkspace({ invitation, env }: { invitation: Invitation; env?: SyncEnv }) {
  const parent = useSync();
  const { user_id: sub } = useMe();
  const vaultId = invitation.vault_id;
  const [phase, setPhase] = useState<Phase>({ kind: "loading" });
  const [status, setStatus] = useState<SyncStatus | null>(null);
  const [rejections, setRejections] = useState<Rejection[]>([]);
  const [conflicts, setConflicts] = useState<ManualConflict[]>([]);
  const [dataVersion, setDataVersion] = useState(0);
  const [notesVersion, setNotesVersion] = useState(0);

  // Solo depende de la bóveda y la cuenta: el contexto padre cambia con cada cambio de estado y no debe reabrir la réplica.
  useEffect(() => {
    let alive = true;
    const unsubscribe: (() => void)[] = [];
    setPhase({ kind: "loading" });
    const opened = serial(() => openSyncResources(sub, env, { vaultId }));
    opened.then(
      (resources) => {
        if (!alive) return;
        unsubscribe.push(
          resources.status.subscribe(setStatus),
          resources.rejections.subscribe(setRejections),
          resources.conflicts.subscribe(setConflicts),
        );
        resources.feed.on("change", (change) => {
          if (change.id.startsWith(ID_PREFIX)) setDataVersion((version) => version + 1);
          else if (change.id.startsWith(NOTE_ID_PREFIX)) setNotesVersion((version) => version + 1);
        });
        setStatus(resources.status.current());
        setRejections(resources.rejections.list());
        setConflicts(resources.conflicts.list());
        setPhase({ kind: "ready", resources });
      },
      (err: unknown) => {
        console.error(err);
        if (alive) setPhase({ kind: "error" });
      },
    );
    return () => {
      alive = false;
      unsubscribe.forEach((stop) => stop());
      void serial(async () => {
        const resources = await opened.catch(() => null);
        await resources?.close();
      }).catch((err: unknown) => console.error(err));
    };
  }, [vaultId, sub, env]);

  const resources = phase.kind === "ready" ? phase.resources : null;

  useEffect(() => {
    if (resources && parent.replicating) resources.replicator.start();
  }, [resources, parent.replicating]);

  const shared = useMemo<SharedInfo>(
    () => ({
      vaultId,
      ownerName: invitation.owner?.display_name || invitation.owner?.email || "",
      readOnly: true,
      grants: invitation.grants,
    }),
    [vaultId, invitation],
  );

  const value = useMemo<SyncContextValue | null>(() => {
    if (!resources || !status) return null;
    return { ...parent, vaults: resources.vaults, notes: resources.notes, dataVersion, notesVersion, status, rejections, conflicts, resolveConflict: resources.conflicts.resolve, shared };
  }, [parent, resources, status, rejections, conflicts, dataVersion, notesVersion, shared]);

  if (phase.kind === "error") return <p role="alert">No se pudo abrir la copia local de esta bóveda.</p>;
  if (!value) return <p>Cargando…</p>;
  return (
    <SyncContext.Provider value={value}>
      <VaultWorkspacePage />
    </SyncContext.Provider>
  );
}

export default function SharedVaultPage({ env }: { env?: SyncEnv }) {
  const { id = "" } = useParams();
  const [access, setAccess] = useState<Access>({ kind: "loading" });
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let alive = true;
    setAccess({ kind: "loading" });
    listInvitations().then(
      ({ items }) => {
        if (!alive) return;
        const invitation = items.find((item) => item.vault_id === id && item.status === "activo");
        setAccess(invitation ? { kind: "ready", invitation } : { kind: "missing" });
      },
      () => alive && setAccess({ kind: "failed" }),
    );
    return () => {
      alive = false;
    };
  }, [id, attempt]);

  if (access.kind === "loading") return <p>Cargando…</p>;
  if (access.kind === "failed") {
    return (
      <div role="alert">
        No se pudo cargar la bóveda compartida.{" "}
        <button type="button" onClick={() => setAttempt((n) => n + 1)}>Reintentar</button>
      </div>
    );
  }
  if (access.kind === "missing") {
    return (
      <div role="alert">
        Esta bóveda ya no está disponible. <Link to="/compartidas">Volver a Compartidas conmigo</Link>
      </div>
    );
  }
  return <SharedWorkspace key={id} invitation={access.invitation} env={env} />;
}
