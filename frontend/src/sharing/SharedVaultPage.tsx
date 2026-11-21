/**
 * Bóveda compartida abierta (H-064 F7c): ruta `/compartidas/:id`. Replica la bóveda en su propia réplica local
 * (`openSyncResources(..., { vaultId })`) y monta el espacio de trabajo de siempre con un contexto de sincronización que
 * apunta a esa réplica; el cierre de sesión y los borradores siguen siendo los del contexto padre.
 */
import { useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { MeContext, useMe } from "../auth/RequireAuth";
import { NOTE_ID_PREFIX } from "../notes/noteRules";
import VaultWorkspacePage from "../notes/VaultWorkspacePage";
import { serial } from "../sync/lifecycle";
import { openSyncResources, type SyncEnv, type SyncResources } from "../sync/resources";
import type { ManualConflict } from "../sync/conflicts";
import type { Rejection } from "../sync/rejections";
import type { SyncStatus } from "../sync/status";
import { SyncContext, useSync, type SharedInfo, type SyncContextValue } from "../sync/useSync";
import { grantsKey, unreadableLocalNotes } from "../sync/sharedRebuild";
import { purgeSharedReplicasNotIn } from "../sync/sharedReplicas";
import { ID_PREFIX } from "../sync/vaultStore";
import { hasWriteGrant } from "./access";
import { listInvitations, type Grant, type Invitation } from "./sharingApi";

type Access = { kind: "loading" } | { kind: "failed" } | { kind: "missing" } | { kind: "ready"; invitation: Invitation };
/** `grants` son las concesiones con las que se abrió esa réplica: lo que se publica va siempre con sus almacenes, no con lo último que dijo el servidor. */
type Phase = { kind: "loading" } | { kind: "error" } | { kind: "ready"; resources: SyncResources; grants: readonly Grant[] };

/** Abre la réplica compartida mientras la página está montada y publica el contexto con sus almacenes. */
function SharedWorkspace({ invitation, env, watchMs }: { invitation: Invitation; env?: SyncEnv; watchMs: number }) {
  const parent = useSync();
  const { user_id: sub } = useMe();
  const vaultId = invitation.vault_id;
  const { grants } = invitation;
  const grantsId = grantsKey(grants);
  const [phase, setPhase] = useState<Phase>({ kind: "loading" });
  const [status, setStatus] = useState<SyncStatus | null>(null);
  const [rejections, setRejections] = useState<Rejection[]>([]);
  const [conflicts, setConflicts] = useState<ManualConflict[]>([]);
  const [dataVersion, setDataVersion] = useState(0);
  const [notesVersion, setNotesVersion] = useState(0);
  const [discarded, setDiscarded] = useState(0);
  // Reconstruir la réplica (copias que el servidor ya no deja leer): cada vez que sube, se reabre con `rebuild`.
  const [generation, setGeneration] = useState(0);
  const current = useRef<SyncResources | null>(null);
  const checking = useRef(false);
  const lastRebuild = useRef(0);
  /**
   * Si la réplica guarda copias de notas que el servidor tiene pero esta persona ya no puede leer (las movieron o se redujeron sus
   * concesiones), la reconstruye. Como mucho una vez cada 30 s. El feed de cambios no emite lo que dejó de ser legible, así que no
   * hay evento que lo avise: se comprueba al ponerse al día, al volver a la ventana o a la red, y en cada sondeo.
   */
  const checkUnreadable = useRef(() => {});
  checkUnreadable.current = () => {
    const resources = current.current;
    if (!resources || checking.current || Date.now() - lastRebuild.current < 30_000) return;
    checking.current = true;
    unreadableLocalNotes(resources.db, resources.remote)
      .then((ids) => {
        if (ids.length === 0 || current.current !== resources) return;
        lastRebuild.current = Date.now();
        setGeneration((n) => n + 1);
      })
      .catch(() => undefined)
      .finally(() => {
        checking.current = false;
      });
  };

  useEffect(() => {
    const check = () => checkUnreadable.current();
    const timer = window.setInterval(check, watchMs);
    window.addEventListener("focus", check);
    window.addEventListener("online", check);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener("focus", check);
      window.removeEventListener("online", check);
    };
  }, [watchMs]);

  // Solo depende de la bóveda y la cuenta: el contexto padre cambia con cada cambio de estado y no debe reabrir la réplica.
  useEffect(() => {
    let alive = true;
    const unsubscribe: (() => void)[] = [];
    setPhase({ kind: "loading" });
    const opened = serial(() =>
      openSyncResources(sub, env, {
        vaultId,
        grants,
        rebuild: generation > 0,
        // Ya se bajó todo: si quedan copias de notas que el servidor tiene pero esta persona ya no puede leer, se reconstruye.
        onCaughtUp: () => checkUnreadable.current(),
      }),
    );
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
        current.current = resources;
        setDiscarded(resources.discarded);
        setPhase({ kind: "ready", resources, grants });
      },
      (err: unknown) => {
        console.error(err);
        if (alive) setPhase({ kind: "error" });
      },
    );
    return () => {
      alive = false;
      current.current = null;
      unsubscribe.forEach((stop) => stop());
      void serial(async () => {
        const resources = await opened.catch(() => null);
        await resources?.close();
      }).catch((err: unknown) => console.error(err));
    };
  }, [vaultId, sub, env, grantsId, generation]); // eslint-disable-line react-hooks/exhaustive-deps -- `grants` solo cuenta por su contenido

  const resources = phase.kind === "ready" ? phase.resources : null;

  useEffect(() => {
    if (resources && parent.replicating) resources.replicator.start();
  }, [resources, parent.replicating]);

  const openedGrants = phase.kind === "ready" ? phase.grants : null;
  const shared = useMemo<SharedInfo | null>(
    () =>
      openedGrants && {
        vaultId,
        ownerName: invitation.owner?.display_name || invitation.owner?.email || "",
        readOnly: !hasWriteGrant(openedGrants),
        grants: [...openedGrants],
      },
    [vaultId, invitation.owner?.id, invitation.owner?.display_name, invitation.owner?.email, openedGrants],
  );

  const value = useMemo<SyncContextValue | null>(() => {
    if (!resources || !status || !shared) return null;
    return { ...parent, vaults: resources.vaults, notes: resources.notes, dataVersion, notesVersion, status, rejections, conflicts, resolveConflict: resources.conflicts.resolve, shared };
  }, [parent, resources, status, rejections, conflicts, dataVersion, notesVersion, shared]);

  if (phase.kind === "error") return <p role="alert">No se pudo abrir la copia local de esta bóveda.</p>;
  if (!value) return <p>Cargando…</p>;
  return (
    <SyncContext.Provider value={value}>
      <VaultWorkspacePage />
      {discarded > 0 && (
        <p role="status" className="share-toast">
          {discarded === 1 ? "Se descartó 1 cambio tuyo" : `Se descartaron ${discarded} cambios tuyos`} en carpetas donde ya no tienes escritura.{" "}
          <button type="button" onClick={() => setDiscarded(0)}>Entendido</button>
        </p>
      )}
    </SyncContext.Provider>
  );
}

/** Cada cuánto se comprueba que el acceso y las concesiones siguen siendo los mismos (además de al volver a la ventana o a la red). */
const WATCH_MS = 30_000;

export default function SharedVaultPage({ env, watchMs = WATCH_MS }: { env?: SyncEnv; watchMs?: number }) {
  const { id = "" } = useParams();
  const me = useContext(MeContext);
  const [access, setAccess] = useState<Access>({ kind: "loading" });
  const [attempt, setAttempt] = useState(0);

  /** Lee las invitaciones; `quiet` = sondeo (un fallo de red no cambia nada). Devuelve los ids de bóvedas activas, o `null`. */
  const refresh = useCallback(
    async (quiet: boolean): Promise<ReadonlySet<string> | null> => {
      try {
        const { items } = await listInvitations();
        const active = items.filter((item) => item.status === "activo");
        const invitation = active.find((item) => item.vault_id === id);
        if (!invitation) {
          setAccess({ kind: "missing" });
        } else {
          // La réplica solo se reabre si cambia el CONTENIDO de las concesiones (`grantsId` en `SharedWorkspace`).
          setAccess({ kind: "ready", invitation });
        }
        return new Set(active.map((item) => item.vault_id));
      } catch {
        if (!quiet) setAccess({ kind: "failed" });
        return null;
      }
    },
    [id],
  );

  useEffect(() => {
    setAccess({ kind: "loading" });
    void refresh(false);
  }, [refresh, attempt]);

  // Vigila el acceso mientras la página está abierta: cada `watchMs`, al volver a la ventana y al recuperar la red.
  useEffect(() => {
    const check = () => void refresh(true);
    const timer = window.setInterval(check, watchMs);
    window.addEventListener("focus", check);
    window.addEventListener("online", check);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener("focus", check);
      window.removeEventListener("online", check);
    };
  }, [refresh, watchMs]);

  // Sin acceso: la réplica local de esta bóveda se destruye (después de que el espacio de trabajo la cerró).
  const sub = me?.user_id;
  useEffect(() => {
    if (access.kind === "missing" && sub) void serial(() => purgeSharedReplicasNotIn(sub, new Set(), env?.localDb)).catch(() => undefined);
  }, [access.kind, sub, env]);

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
  return <SharedWorkspace key={id} invitation={access.invitation} env={env} watchMs={watchMs} />;
}
