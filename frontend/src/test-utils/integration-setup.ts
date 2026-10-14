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

// El defecto de PouchDB 9 con `info()` sin `catch` lo contiene `createRemoteDb` (sync/remote.ts),
// que es también la que usan los dispositivos simulados.
