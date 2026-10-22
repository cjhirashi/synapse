/**
 * Base remota del canal de sincronización (SPEC-0005 RF-002, RF-016; PLAN-0005 §2.5).
 *
 * PouchDB habla con `/sync/db` del mismo origen usando un `fetch` propio: siempre con las
 * cookies de sesión y, ante un 401, una renovación con `refreshSession()` (la misma que usa
 * el resto de la API, serializada entre pestañas) y un único reintento. Si la sesión no se
 * puede renovar, avisa "sesión caducada" y devuelve el 401 a PouchDB; el replicador se
 * detiene sin tocar la réplica (RF-016).
 *
 * El `fetch` también parte un `POST _bulk_docs` de más de 8 MiB en sub-peticiones (SPEC-0008
 * RF-016; PLAN-0008 P-6): PouchDB sólo limita el lote por número de documentos, no por bytes,
 * y con notas de hasta 2 MiB un lote de 50 superaría el tope del servidor para siempre.
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

/** Tope de una sub-petición de `_bulk_docs` (el servidor admite 16 MiB, PLAN-0008 P-6). */
export const BULK_CHUNK_BYTES = 8 * 1024 * 1024;

const BULK_DOCS_URL = /\/_bulk_docs(\?|$)/;
const encoder = new TextEncoder();

function utf8Bytes(text: string): number {
  return encoder.encode(text).length;
}

/**
 * Reparte los documentos de un lote en grupos cuyo cuerpo serializado pesa ≤ `BULK_CHUNK_BYTES`,
 * conservando el orden. Un documento que por sí solo supera el tope va solo (el servidor decide).
 */
function chunkDocs(docs: unknown[], newEdits: unknown): unknown[][] {
  // Lo que añade el sobre `{"docs":[…],"new_edits":…}` a la suma de sus documentos.
  const envelope = utf8Bytes(JSON.stringify({ docs: [], new_edits: newEdits }));
  const chunks: unknown[][] = [];
  let current: unknown[] = [];
  let size = envelope;
  for (const doc of docs) {
    // +1 por la coma que separa a los documentos.
    const docSize = utf8Bytes(JSON.stringify(doc)) + 1;
    if (current.length > 0 && size + docSize > BULK_CHUNK_BYTES) {
      chunks.push(current);
      current = [];
      size = envelope;
    }
    current.push(doc);
    size += docSize;
  }
  if (current.length > 0) chunks.push(current);
  return chunks;
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
  /** Una petición con la política de sesión: cookies, y ante un 401 una renovación y un reintento. */
  const sendOnce: Fetch = async (url, init = {}) => {
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

  /**
   * `POST _bulk_docs` de más de `BULK_CHUNK_BYTES`: sub-peticiones secuenciales y la
   * concatenación de sus rechazos (el cuerpo de la respuesta es la lista de rechazos). Si una
   * falla, se devuelve ese fallo tal cual y no se envían las siguientes: PouchDB reintenta el
   * lote entero y el paso 2 del push del servidor es idempotente (PLAN-0008 P-6).
   */
  const sendSplit = async (url: string, init: RequestInit, text: string): Promise<Response> => {
    const { docs, new_edits } = JSON.parse(text) as { docs: unknown[]; new_edits: unknown };
    const rejections: unknown[] = [];
    let last: Response | null = null;
    for (const chunk of chunkDocs(docs, new_edits)) {
      last = await sendOnce(url, { ...init, body: JSON.stringify({ docs: chunk, new_edits }) });
      if (!last.ok) return last;
      rejections.push(...((await last.json()) as unknown[]));
    }
    // `last` existe: un cuerpo de más de 8 MiB tiene al menos un documento.
    return new Response(JSON.stringify(rejections), {
      status: (last as Response).status,
      headers: { "Content-Type": "application/json" },
    });
  };

  return (url, init = {}) => {
    if (typeof url === "string" && init.method === "POST" && BULK_DOCS_URL.test(url)
      && typeof init.body === "string" && utf8Bytes(init.body) > BULK_CHUNK_BYTES) {
      return sendSplit(url, init, init.body);
    }
    return sendOnce(url, init);
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
