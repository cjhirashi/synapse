/**
 * Base remota del canal de sincronización (SPEC-0005 RF-002, RF-016; PLAN-0005 §2.5).
 *
 * PouchDB habla con `/sync/db` del mismo origen usando un `fetch` propio: siempre con las
 * cookies de sesión y, ante un 401, una renovación con `refreshSession()` (la misma que usa
 * el resto de la API, serializada entre pestañas) y un único reintento. Si la sesión no se
 * puede renovar, avisa "sesión caducada" y devuelve el 401 a PouchDB; el replicador se
 * detiene sin tocar la réplica (RF-016).
 */
import PouchDB from "pouchdb-browser";
import { refreshSession } from "../api/auth";

/** Ruta de la base del usuario en el canal (PLAN-0005 §2.1). */
export const REMOTE_PATH = "/sync/db";

type Fetch = (url: string | Request, init?: RequestInit) => Promise<Response>;

export interface RemoteOptions {
  /** Se llama cuando un 401 no se puede resolver renovando la sesión. */
  onSessionExpired: () => void;
  /** Origen de la SPA; por defecto el de la página. */
  origin?: string;
}

/**
 * `fetch` para PouchDB con la política de sesión del canal. Los 503 y los fallos de red
 * pasan tal cual: PouchDB los trata como "sin conexión" y reintenta (RF-019).
 */
export function syncFetch(onSessionExpired: () => void, baseFetch: Fetch = (url, init) => fetch(url, init)): Fetch {
  return async (url, init = {}) => {
    const send = () => baseFetch(url, { ...init, credentials: "include" });
    let res = await send();
    if (res.status !== 401) return res;
    // Los cuerpos de PouchDB son cadenas JSON, así que la petición se puede repetir igual.
    if (await refreshSession()) {
      res = await send();
      if (res.status !== 401) return res;
    }
    onSessionExpired();
    return res;
  };
}

/** Base PouchDB remota del usuario (`{origen}/sync/db`). */
export function createRemoteDb({ onSessionExpired, origin = window.location.origin }: RemoteOptions): PouchDB.Database {
  // PouchDB sólo usa el adaptador HTTP con una URL absoluta: una ruta relativa sería el
  // nombre de otra base local. `skip_setup`: el canal no permite crear la base (404).
  return new PouchDB(origin + REMOTE_PATH, {
    adapter: "http",
    skip_setup: true,
    fetch: syncFetch(onSessionExpired),
  } as PouchDB.Configuration.RemoteDatabaseConfiguration);
}
