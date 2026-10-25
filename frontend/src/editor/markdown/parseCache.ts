/**
 * Caché en memoria del mdast por `(id, rev)` (SPEC-0010 RNF-001, RNF-003; PLAN-0010 §10.4).
 *
 * Sólo memoria (un `Map` LRU): nada en IndexedDB/`sessionStorage`/`localStorage` — la réplica sigue
 * siendo la única persistencia (P-1 de 0005) y no se deja una segunda copia del contenido del usuario
 * fuera de ella. La caché y el Worker pertenecen al `Workspace`: `dispose()` termina el Worker y vacía
 * el `Map` (cambio de bóveda y logout). El parseo pesado (micromark) corre en el Worker; aquí sólo se
 * guardan cadenas JSON por clave, con tope de bytes (LRU) y tamaño mínimo de nota. No importa
 * `parseStage` (ni remark): ese código pesado vive sólo en el Worker, fuera del chunk de la entrada.
 */

/** Respuesta del Worker: el mdast como cadena JSON, o un error (que nunca rompe la apertura). */
export type ParseWorkerResponse = { key: string; json: string } | { key: string; error: string };

/** Lo mínimo que la caché necesita de un Worker (el real o uno simulado en pruebas). */
export interface ParseWorkerLike {
  postMessage(message: { key: string; text: string }): void;
  addEventListener(type: "message", listener: (event: { data: ParseWorkerResponse }) => void): void;
  terminate(): void;
}

export interface ParseCacheOptions {
  /** Tope de bytes de cadenas mdast guardadas (LRU por encima). Por defecto 24 MiB (§10.4). */
  maxBytes?: number;
  /** Tamaño mínimo de `content` (en caracteres) para cachear; por debajo el frío ya cumple. 32 KiB. */
  minSize?: number;
}

const DEFAULT_MAX_BYTES = 24 * 1024 * 1024;
const DEFAULT_MIN_SIZE = 32 * 1024;

interface Entry {
  json: string;
  /** Longitud del `content` que produjo este mdast: se verifica antes de usar la entrada. */
  length: number;
}

const idOf = (key: string): string => key.slice(0, key.lastIndexOf("@"));

export class ParseCache {
  readonly #worker: ParseWorkerLike;
  readonly #maxBytes: number;
  readonly #minSize: number;
  /** `Map` ordenado por uso (el último es el más reciente): clave `"{id}@{rev}"`. */
  readonly #store = new Map<string, Entry>();
  /** Peticiones en vuelo, para deduplicar por clave. */
  readonly #inflight = new Map<string, Promise<string | null>>();
  readonly #pending = new Map<string, { resolve: (value: string | null) => void; length: number }>();
  #bytes = 0;
  #disposed = false;

  constructor(worker: ParseWorkerLike, options: ParseCacheOptions = {}) {
    this.#worker = worker;
    this.#maxBytes = options.maxBytes ?? DEFAULT_MAX_BYTES;
    this.#minSize = options.minSize ?? DEFAULT_MIN_SIZE;
    this.#worker.addEventListener("message", this.#onMessage);
  }

  /** Pide el mdast de la nota; resuelve el JSON (o null si es pequeña o el Worker falla). */
  request(id: string, rev: string, text: string): Promise<string | null> {
    if (this.#disposed || text.length < this.#minSize) return Promise.resolve(null);
    const key = `${id}@${rev}`;
    const cached = this.#store.get(key);
    if (cached && cached.length === text.length) {
      this.#touch(key);
      return Promise.resolve(cached.json);
    }
    const existing = this.#inflight.get(key);
    if (existing) return existing;
    const promise = new Promise<string | null>((resolve) => {
      this.#pending.set(key, { resolve, length: text.length });
    });
    this.#inflight.set(key, promise);
    this.#worker.postMessage({ key, text });
    return promise;
  }

  /**
   * La petición en vuelo de esa revisión, si la hay (p. ej. empezó al pasar el puntero), o `null`.
   * El editor la espera en vez de reparsear en el hilo principal (§10.6). No arranca una nueva.
   */
  pending(id: string, rev: string): Promise<string | null> | null {
    return this.#inflight.get(`${id}@${rev}`) ?? null;
  }

  /** Lectura síncrona: el JSON cacheado de esa revisión sólo si la longitud del texto coincide. */
  get(id: string, rev: string, textLength: number): string | null {
    const key = `${id}@${rev}`;
    const cached = this.#store.get(key);
    if (cached && cached.length === textLength) {
      this.#touch(key);
      return cached.json;
    }
    return null;
  }

  /** Termina el Worker y vacía la caché. Ningún dato sobrevive a la sesión. */
  dispose(): void {
    this.#disposed = true;
    this.#worker.terminate();
    this.#store.clear();
    this.#inflight.clear();
    this.#pending.clear();
    this.#bytes = 0;
  }

  #onMessage = ({ data }: { data: ParseWorkerResponse }): void => {
    const pending = this.#pending.get(data.key);
    if (!pending) return;
    this.#pending.delete(data.key);
    this.#inflight.delete(data.key);
    if ("json" in data) {
      this.#set(data.key, data.json, pending.length);
      pending.resolve(data.json);
    } else {
      pending.resolve(null);
    }
  };

  #set(key: string, json: string, length: number): void {
    // Una revisión nueva invalida las anteriores del mismo id (y acota la memoria por nota).
    for (const other of [...this.#store.keys()]) {
      if (other !== key && idOf(other) === idOf(key)) {
        this.#bytes -= this.#store.get(other)!.json.length;
        this.#store.delete(other);
      }
    }
    const previous = this.#store.get(key);
    if (previous) this.#bytes -= previous.json.length;
    this.#store.set(key, { json, length });
    this.#bytes += json.length;
    this.#evict();
  }

  /** Mueve la clave al final (más reciente) para la política LRU. */
  #touch(key: string): void {
    const entry = this.#store.get(key);
    if (!entry) return;
    this.#store.delete(key);
    this.#store.set(key, entry);
  }

  /** Desaloja desde el principio (menos usado) hasta volver bajo el tope de bytes. */
  #evict(): void {
    while (this.#bytes > this.#maxBytes && this.#store.size > 0) {
      const oldest = this.#store.keys().next().value as string;
      this.#bytes -= this.#store.get(oldest)!.json.length;
      this.#store.delete(oldest);
    }
  }
}
