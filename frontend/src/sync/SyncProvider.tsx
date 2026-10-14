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
 * (`LogoutDialog`). Lo decide con el estado actual de la réplica y de los rechazos, no con el
 * del último render: una escritura recién hecha cuenta aunque la pantalla aún no la muestre.
 * Si la réplica no puede leerse también avisa, diciendo por qué (VE-2). "Sincronizar y salir"
 * es un push de una vez junto a la replicación continua y sale sólo si el servidor confirmó
 * todo. Salir es `logout()` y, sólo si el servidor cerró la sesión, detener todo y borrar la
 * réplica; si el borrado falla la sesión ya no existe, así que va igualmente al login con el
 * aviso de la copia conservada (`LocalCopyNotice`; RF-017, enmienda 3).
 */
import { ReactNode, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { logout as logoutSession } from "../api/auth";
import type { ManualConflict } from "./conflicts";
import { destroyLocalDb } from "./localDb";
import type { Rejection } from "./rejections";
import type { LocalCopyState } from "./LocalCopyNotice";
import { openSyncResources, pushOnce, type SyncEnv, type SyncResources, unconfirmedState } from "./resources";
import type { SyncStatus } from "./status";
import { SyncContext, type LogoutFailure, type LogoutPhase, type LogoutReason, type SyncContextValue } from "./useSync";
import { ID_PREFIX } from "./vaultStore";

interface Props {
  /** Usuario de la sesión: dueño de la réplica y de las bóvedas nuevas. */
  sub: string;
  /** Sin replicar mientras el usuario deba cambiar su contraseña (el canal responde 403, RF-002). */
  paused: boolean;
  env?: SyncEnv;
  children: ReactNode;
}

const DEFAULT_ENV: SyncEnv = {};

/** Cola de apertura y cierre compartida por todas las instancias (ver cabecera). */
let lifecycle: Promise<unknown> = Promise.resolve();

function serial<T>(task: () => Promise<T>): Promise<T> {
  const run = lifecycle.then(task);
  lifecycle = run.catch(() => undefined);
  return run;
}

type Phase = { kind: "loading" } | { kind: "ready"; resources: SyncResources } | { kind: "error" };

export default function SyncProvider({ sub, paused, env = DEFAULT_ENV, children }: Props) {
  const navigate = useNavigate();
  const [phase, setPhase] = useState<Phase>({ kind: "loading" });
  const [status, setStatus] = useState<SyncStatus | null>(null);
  const [rejections, setRejections] = useState<Rejection[]>([]);
  const [conflicts, setConflicts] = useState<ManualConflict[]>([]);
  const [dataVersion, setDataVersion] = useState(0);
  const [logoutPhase, setLogoutPhase] = useState<LogoutPhase>("closed");
  const [logoutReason, setLogoutReason] = useState<LogoutReason>("pending");
  const [logoutFailure, setLogoutFailure] = useState<LogoutFailure>(null);
  const leaving = useRef(false);

  // Abre los recursos del usuario y los cierra al desmontar o al cambiar de usuario.
  useEffect(() => {
    let alive = true;
    const unsubscribe: (() => void)[] = [];
    setPhase({ kind: "loading" });
    const opened = serial(() => openSyncResources(sub, env));
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
      // Un `close()` que falla (también el de una salida cuyo borrado falló, VE-1) se
      // registra: la cola sigue y no queda un rechazo sin manejar.
      void serial(async () => {
        const resources = await opened.catch(() => null);
        await resources?.close();
      }).catch((err: unknown) => console.error(err));
    };
  }, [sub, env]);

  const resources = phase.kind === "ready" ? phase.resources : null;

  // Replica en cuanto la réplica está abierta y el usuario puede usar el canal.
  useEffect(() => {
    if (resources && !paused) resources.replicator.start();
  }, [resources, paused]);

  /**
   * Cierra la sesión en el servidor y, sólo si lo consiguió, borra la réplica y va al login.
   * Nunca rechaza (lo llaman botones con `void`).
   */
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
    // La sesión ya está cerrada: pase lo que pase con la réplica, se va al login. `leaving`
    // queda en `true` (no hay otra salida que lanzar) y el proveedor se desmonta con la ruta.
    let state: LocalCopyState | null = null;
    try {
      await serial(async () => {
        await resources.close();
        await destroyLocalDb(resources.db);
      });
    } catch (err) {
      // IndexedDB con error: la copia sigue en el dispositivo hasta el próximo inicio de
      // sesión, que la borra si es otro usuario (RF-018) o la reutiliza si es el mismo.
      console.error(err);
      state = { localCopyKept: true };
    }
    navigate("/login", { replace: true, state });
  }, [resources, logoutPhase, navigate]);

  const value = useMemo<SyncContextValue | null>(() => {
    if (!resources || !status) return null;
    return {
      vaults: resources.vaults,
      dataVersion,
      replicating: !paused,
      status,
      rejections,
      conflicts,
      resolveConflict: resources.conflicts.resolve,
      async requestLogout() {
        setLogoutFailure(null);
        // Decide con el estado actual de la réplica (VC-4, VD-1); sin estado legible, avisa
        // diciendo por qué (VD-3, VE-2).
        const unconfirmed = await unconfirmedState(resources);
        if (unconfirmed === "none") return exit();
        setLogoutReason(unconfirmed);
        setLogoutPhase("asking");
      },
      logout: {
        phase: logoutPhase,
        reason: logoutReason,
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
  }, [resources, status, rejections, conflicts, dataVersion, paused, logoutPhase, logoutReason, logoutFailure, exit]);

  if (phase.kind === "error") return <p role="alert">No se pudo abrir la copia local de tus bóvedas.</p>;
  if (!value) return <p>Cargando…</p>;
  return <SyncContext.Provider value={value}>{children}</SyncContext.Provider>;
}
