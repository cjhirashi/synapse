// Preparación de las pruebas de sincronización real (vitest.sync.config.ts): las réplicas de
// cada dispositivo simulado viven en memoria; la remota es HTTP contra el backend real.
//
// El entorno es `node` (no `jsdom`): el `fetch`, `AbortController` y `Headers` de Node son los
// que hablan con el backend. `pouchdb-browser` lee el global de los navegadores y workers,
// `self`, que en Node se llama `globalThis`; se define antes de cargar PouchDB (por eso la
// importación dinámica: las estáticas se evaluarían antes de esta línea).
Object.defineProperty(globalThis, "self", { value: globalThis, configurable: true });

// Módulo ES (no script global): habilita el `await` de nivel superior de abajo.
export {};

const { default: PouchDB } = await import("pouchdb-browser");
const { default: memory } = await import("pouchdb-adapter-memory");
PouchDB.plugin(memory);

// Defecto de PouchDB 9 (`replicate`, tras escribir cada lote): actualiza sus `activeTasks` con
// `src.info().then(...)` sin `catch`. Si la red cae durante esa petición, la promesa derivada
// de ese `then` queda rechazada sin manejar —en el navegador, un "Uncaught (in promise)" en
// consola; la replicación no se entera y sigue con su reintento—. Las pruebas cortan la red en
// cualquier momento, y vitest falla la corrida ante cualquier rechazo sin manejar.
//
// `info()` devuelve aquí una promesa cuyas derivadas directas (`then`/`catch`/`finally`) nacen
// ya observadas. Quien las espera o encadena recibe el rechazo igual; sólo deja de contar como
// "sin manejar" la que nadie mira, que es justo la de PouchDB.
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

/** Hace que `info()` de esta instancia devuelva promesas observadas (ver arriba). */
function observeInfo(db: PouchDB.Database): void {
  const info = db.info; // PouchDB lo define ya ligado a la instancia.
  db.info = ((...args: unknown[]) => {
    const result = (info as (...a: unknown[]) => unknown)(...args);
    if (!(result instanceof Promise)) return result;
    const observed = ObservedPromise.resolve(result);
    // La propia `observed` también puede quedar sin mirar (p. ej. si alguien sólo la descarta).
    observed.catch(() => undefined);
    return observed;
  }) as typeof info;
}

// PouchDB asigna `info` en cada instancia (en su constructor), no en el prototipo; el punto de
// extensión es su registro de adaptadores: el constructor llama al adaptador con la instancia
// ya armada. Sólo la remota (`http`/`https`) hace peticiones que la red puede cortar.
type Adapter = ((this: PouchDB.Database, ...args: unknown[]) => unknown) & Record<string, unknown>;
const adapters = (PouchDB as unknown as { adapters: Record<string, Adapter> }).adapters;
for (const name of ["http", "https"]) {
  const adapter = adapters[name];
  const observed = function (this: PouchDB.Database, ...args: unknown[]) {
    observeInfo(this);
    return adapter.apply(this, args);
  };
  // Conserva lo que PouchDB lee del adaptador (`valid()`, `use_prefix`).
  adapters[name] = Object.assign(observed, adapter);
}
