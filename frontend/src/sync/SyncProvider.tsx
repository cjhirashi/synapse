/**
 * Proveedor de la sincronización (SPEC-0005 RF-009, RF-016, RF-017, RF-018; PLAN-0005 §2.5).
 *
 * Con el `sub` de la sesión (lo da `RequireAuth`) abre la réplica local (que se borra antes
 * si era de otro usuario, RF-018), los almacenes de estado, rechazos y conflictos, la base
 * remota y el replicador, y lo publica todo por `SyncContext`. Las páginas no se muestran
 * hasta que la réplica está abierta.
 *
 * Abrir y cerrar pasan por una cola de este módulo: con `React.StrictMode`, o al cambiar de
 * usuario, el cierre de una instancia termina antes de que la siguiente abra la réplica, así
 * que nunca hay dos replicadores ni dos `destroy()` cruzados.
 *
 * Cierre de sesión (RF-017): sin cambios sin confirmar sale directo; con ellos abre el aviso
 * (`LogoutDialog`). "Sincronizar y salir" es un push de una vez junto a la replicación
 * continua y sale sólo si el servidor confirmó todo. Salir es `logout()` y, sólo si el
 * servidor cerró la sesión, detener todo y borrar la réplica.
 */
import { ReactNode, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { logout as logoutSession } from "../api/auth";
import { openConflicts, type ConflictsStore, type ManualConflict } from "./conflicts";
import { destroyLocalDb, openLocalDb, type LocalDbOptions } from "./localDb";
import { openRejections, type Rejection, type RejectionsStore } from "./rejections";
import { createRemoteDb } from "./remote";
import {
  BATCH_SIZE,
  createReplicator,
  listenPush,
  type Replicator,
  type ReplicatorOptions,
  type RuntimeReplication,
  type SyncEvent,
} from "./replicator";
import { openSyncStatus, seqNumber, type SyncStatus, type SyncStatusStore } from "./status";
import { SyncContext, type LogoutFailure, type LogoutPhase, type SyncContextValue } from "./useSync";
import { createVaultStore, ID_PREFIX, type VaultStore } from "./vaultStore";

/** Dependencias sustituibles en las pruebas (réplica en memoria, remota y replicador falsos). */
export interface SyncEnv {
  localDb?: LocalDbOptions;
  createRemote?: (onSessionExpired: () => void) => PouchDB.Database;
  createReplicator?: (options: ReplicatorOptions) => Replicator;
}

interface Props {
  /** Usuario de la sesión: dueño de la réplica y de las bóvedas nuevas. */
  sub: string;
  /** Sin replicar mientras el usuario deba cambiar su contraseña (el canal responde 403, RF-002). */
  paused: boolean;
  env?: SyncEnv;
  children: ReactNode;
}

/** Lo que abre una instancia del proveedor; `close()` lo detiene una sola vez. */
interface Resources {
  db: PouchDB.Database;
  remote: PouchDB.Database;
  vaults: VaultStore;
  status: SyncStatusStore;
  rejections: RejectionsStore;
  conflicts: ConflictsStore;
  replicator: Replicator;
  /** Cada escritura en una bóveda de la réplica (para `dataVersion`). */
  feed: PouchDB.Core.Changes<{}>;
  close(): Promise<void>;
}

const DEFAULT_ENV: SyncEnv = {};

/** Cola de apertura y cierre compartida por todas las instancias (ver cabecera). */
let lifecycle: Promise<unknown> = Promise.resolve();

function serial<T>(task: () => Promise<T>): Promise<T> {
  const run = lifecycle.then(task);
  lifecycle = run.catch(() => undefined);
  return run;
}

async function openResources(sub: string, env: SyncEnv): Promise<Resources> {
  const db = await openLocalDb(sub, env.localDb);
  const status = await openSyncStatus(db);
  const rejections = await openRejections(db);
  const conflicts = await openConflicts(db);
  // El replicador se crea después que la remota, pero la remota avisa de la sesión caducada:
  // el aviso llega siempre más tarde, cuando el replicador ya existe.
  let replicator: Replicator | null = null;
  const onSessionExpired = () => replicator?.sessionExpired();
  const remote = (env.createRemote ?? ((expired) => createRemoteDb({ onSessionExpired: expired })))(onSessionExpired);
  const onEvent = (event: SyncEvent) => {
    void status.handle(event);
    void rejections.handle(event);
  };
  replicator = (env.createReplicator ?? createReplicator)({ local: db, remote, onEvent });
  const feed = db.changes({ live: true, since: "now" });

  let closed: Promise<void> | null = null;
  const resources: Resources = {
    db,
    remote,
    vaults: createVaultStore(db, sub),
    status,
    rejections,
    conflicts,
    replicator,
    feed,
    close() {
      closed ??= (async () => {
        feed.cancel();
        await resources.replicator.stop();
        status.close();
        rejections.close();
        conflicts.close();
      })();
      return closed;
    },
  };
  return resources;
}

/**
 * Push de una vez para "Sincronizar y salir". Sus escritas y rechazos van a los mismos
 * almacenes que los de la replicación continua. Devuelve si el servidor confirmó todo: sin
 * fallos de escritura, sin rechazos pendientes y con la secuencia local entera recorrida.
 */
async function pushOnce(resources: Resources): Promise<boolean> {
  const handled: Promise<void>[] = [];
  const emit = (event: SyncEvent) => {
    handled.push(resources.status.handle(event), resources.rejections.handle(event));
  };
  try {
    const replication = resources.db.replicate.to(resources.remote, { batch_size: BATCH_SIZE });
    listenPush(replication as unknown as RuntimeReplication, emit);
    const result = await replication;
    await Promise.all(handled);
    const { update_seq } = await resources.db.info();
    return (
      result.ok &&
      result.doc_write_failures === 0 &&
      resources.rejections.list().length === 0 &&
      seqNumber(result.last_seq) >= seqNumber(update_seq)
    );
  } catch {
    // Sin conexión, 503 o sesión caducada a mitad: no se confirmó nada.
    return false;
  }
}

type Phase = { kind: "loading" } | { kind: "ready"; resources: Resources } | { kind: "error" };

export default function SyncProvider({ sub, paused, env = DEFAULT_ENV, children }: Props) {
  const navigate = useNavigate();
  const [phase, setPhase] = useState<Phase>({ kind: "loading" });
  const [status, setStatus] = useState<SyncStatus | null>(null);
  const [rejections, setRejections] = useState<Rejection[]>([]);
  const [conflicts, setConflicts] = useState<ManualConflict[]>([]);
  const [dataVersion, setDataVersion] = useState(0);
  const [logoutPhase, setLogoutPhase] = useState<LogoutPhase>("closed");
  const [logoutFailure, setLogoutFailure] = useState<LogoutFailure>(null);
  const leaving = useRef(false);

  // Abre los recursos del usuario y los cierra al desmontar o al cambiar de usuario.
  useEffect(() => {
    let alive = true;
    const unsubscribe: (() => void)[] = [];
    setPhase({ kind: "loading" });
    const opened = serial(() => openResources(sub, env));
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
      });
    };
  }, [sub, env]);

  const resources = phase.kind === "ready" ? phase.resources : null;

  // Replica en cuanto la réplica está abierta y el usuario puede usar el canal.
  useEffect(() => {
    if (resources && !paused) resources.replicator.start();
  }, [resources, paused]);

  /** Cierra la sesión en el servidor y, sólo si lo consiguió, borra la réplica y va al login. */
  const exit = useCallback(async () => {
    // Un segundo clic mientras sale no lanza otra salida.
    if (!resources || leaving.current) return;
    leaving.current = true;
    const fromDialog = logoutPhase !== "closed";
    if (fromDialog) setLogoutPhase("exiting");
    setLogoutFailure(null);
    try {
      await logoutSession();
    } catch {
      // Las cookies son httpOnly: si el servidor no las limpió la sesión sigue abierta, así
      // que la réplica se conserva (sigue siendo de este usuario).
      leaving.current = false;
      setLogoutFailure("logout");
      setLogoutPhase(fromDialog ? "asking" : "closed");
      return;
    }
    await serial(async () => {
      await resources.close();
      await destroyLocalDb(resources.db);
    });
    navigate("/login", { replace: true });
  }, [resources, logoutPhase, navigate]);

  const value = useMemo<SyncContextValue | null>(() => {
    if (!resources || !status) return null;
    // Un cambio rechazado tampoco está en el servidor: cuenta como no confirmado.
    const unconfirmed = status.pending || rejections.length > 0;
    return {
      vaults: resources.vaults,
      dataVersion,
      replicating: !paused,
      status,
      rejections,
      conflicts,
      resolveConflict: resources.conflicts.resolve,
      requestLogout() {
        setLogoutFailure(null);
        if (unconfirmed) setLogoutPhase("asking");
        else void exit();
      },
      logout: {
        phase: logoutPhase,
        failure: logoutFailure,
        async syncAndExit() {
          setLogoutPhase("syncing");
          setLogoutFailure(null);
          if (await pushOnce(resources)) return exit();
          setLogoutFailure("sync");
          setLogoutPhase("asking");
        },
        discardAndExit: exit,
        cancel() {
          setLogoutFailure(null);
          setLogoutPhase("closed");
        },
      },
    };
  }, [resources, status, rejections, conflicts, dataVersion, paused, logoutPhase, logoutFailure, exit]);

  if (phase.kind === "error") return <p role="alert">No se pudo abrir la copia local de tus bóvedas.</p>;
  if (!value) return <p>Cargando…</p>;
  return <SyncContext.Provider value={value}>{children}</SyncContext.Provider>;
}
