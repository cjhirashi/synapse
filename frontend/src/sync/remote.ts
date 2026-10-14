/**
 * Base remota del canal de sincronización (SPEC-0005 RF-002, RF-016; PLAN-0005 §2.5).
 *
 * PouchDB habla con `/sync/db` del mismo origen usando un `fetch` propio: siempre con las
 * cookies de sesión y, ante un 401, una renovación con `refreshSession()` (la misma que usa
 * el resto de la API, serializada entre pestañas) y un único reintento. Si la sesión no se
 * puede renovar, avisa "sesión caducada" y devuelve el 401 a PouchDB; el replicador se
 * detiene sin tocar la réplica (RF-016).
 *
 * También contiene un defecto de PouchDB 9 (PLAN-0005 §2.5 nota (i), enmienda 1 VC-7): ver
 * `observeInfo`.
 */
import PouchDB from "pouchdb-browser";
import { refreshSession } from "../api/auth";

/** Ruta de la base del usuario en el canal (PLAN-0005 §2.1). */
export const REMOTE_PATH = "/sync/db";

export type Fetch = (url: string | Request, init?: RequestInit) => Promise<Response>;
/** Renueva la sesión; `true` si el servidor emitió cookies nuevas. */
export type Refresh = () => Promise<boolean>;

export interface RemoteOptions {
  /** Se llama cuando un 401 no se puede resolver renovando la sesión. */
  onSessionExpired: () => void;
  /** Origen de la SPA; por defecto el de la página. */
  origin?: string;
  /**
   * `fetch` y renovación de sesión; por defecto los del navegador y `refreshSession()`. Las
   * pruebas de integración dan los de cada dispositivo simulado (sus propias cookies).
   */
  fetch?: Fetch;
  refresh?: Refresh;
}

/**
 * `fetch` para PouchDB con la política de sesión del canal. Los 503 y los fallos de red
 * pasan tal cual: PouchDB los trata como "sin conexión" y reintenta (RF-019).
 */
export function syncFetch(
  onSessionExpired: () => void,
  baseFetch: Fetch = (url, init) => fetch(url, init),
  refresh: Refresh = refreshSession,
): Fetch {
  return async (url, init = {}) => {
    const send = () => baseFetch(url, { ...init, credentials: "include" });
    let res = await send();
    if (res.status !== 401) return res;
    // Los cuerpos de PouchDB son cadenas JSON, así que la petición se puede repetir igual.
    if (await refresh()) {
      res = await send();
      if (res.status !== 401) return res;
    }
    onSessionExpired();
    return res;
  };
}

/**
 * Defecto de PouchDB 9 (`replicate`, tras escribir cada lote): actualiza sus `activeTasks` con
 * `src.info().then(...)` sin `catch`. Si la red cae durante esa petición, la promesa derivada
 * de ese `then` queda rechazada sin manejar: un "Uncaught (in promise)" en la consola del
 * navegador (y un fallo en las pruebas). La replicación no se entera y sigue con su reintento.
 *
 * `info()` de la remota devuelve una promesa cuyas derivadas directas (`then`/`catch`/
 * `finally`) nacen ya observadas. Quien las espera o encadena recibe el rechazo igual; sólo
 * deja de contar como "sin manejar" la que nadie mira, que es justo la de PouchDB.
 */
class ObservedPromise<T> extends Promise<T> {
  // Las derivadas son promesas normales: sin esto, observarlas crearía otra derivada observada
  // y así sin fin.
  static override get [Symbol.species]() {
    return Promise;
  }

  override then<R1 = T, R2 = never>(
    onFulfilled?: ((value: T) => R1 | PromiseLike<R1>) | null,
    onRejected?: ((reason: unknown) => R2 | PromiseLike<R2>) | null,
  ): Promise<R1 | R2> {
    const derived = super.then(onFulfilled, onRejected);
    derived.catch(() => undefined);
    return derived;
  }
}

/** Hace que `info()` de esta instancia devuelva promesas observadas (ver `ObservedPromise`). */
function observeInfo(db: PouchDB.Database): PouchDB.Database {
  const info = db.info; // PouchDB lo define ya ligado a la instancia.
  db.info = ((...args: unknown[]) => {
    const result = (info as (...a: unknown[]) => unknown)(...args);
    if (!(result instanceof Promise)) return result;
    const observed = ObservedPromise.resolve(result);
    // La propia `observed` también puede quedar sin mirar (p. ej. si alguien sólo la descarta).
    observed.catch(() => undefined);
    return observed;
  }) as typeof info;
  return db;
}

/** Base PouchDB remota del usuario (`{origen}/sync/db`). */
export function createRemoteDb({
  onSessionExpired,
  origin = window.location.origin,
  fetch: baseFetch,
  refresh,
}: RemoteOptions): PouchDB.Database {
  // PouchDB sólo usa el adaptador HTTP con una URL absoluta: una ruta relativa sería el
  // nombre de otra base local. `skip_setup`: el canal no permite crear la base (404).
  const remote = new PouchDB(origin + REMOTE_PATH, {
    adapter: "http",
    skip_setup: true,
    fetch: syncFetch(onSessionExpired, baseFetch, refresh),
  } as PouchDB.Configuration.RemoteDatabaseConfiguration);
  // PouchDB asigna `info` en el constructor de cada instancia: se envuelve en la ya creada.
  return observeInfo(remote);
}
