// Dispositivos simulados para la sincronización real (SPEC-0005 RNF-002; PLAN-0005 §5).
//
// Cada `Device` es un navegador: sus propias cookies, su red (que se puede cortar) y su
// réplica PouchDB en memoria, abierta con `openSyncResources` —el mismo cableado que usa
// `SyncProvider`— y el `replicator.ts` real contra el backend real. Nada del protocolo de
// replicación está simulado.
import { inject, vi } from "vitest";
import { destroyLocalDb } from "../sync/localDb";
import { createRemoteDb, type Fetch } from "../sync/remote";
import { createReplicator, type SyncEvent } from "../sync/replicator";
import { openSyncResources, type SyncResources } from "../sync/resources";
import { seqNumber, SYNC_STATE_DOC_ID, type SyncStatus } from "../sync/status";

declare module "vitest" {
  export interface ProvidedContext {
    /** Origen del backend que levantó `scripts/sync-integration.sh`. */
    backendUrl: string;
    adminEmail: string;
    /** Contraseña del admin tras el cambio forzado (la cambia `integration-global.ts`). */
    adminPassword: string;
  }
}

/** Dirección sin servidor (puerto `discard`): un backend caído da ECONNREFUSED de verdad. */
const DEAD_ORIGIN = "http://127.0.0.1:9";

/** Cookies de un navegador: nombre → valor y ruta (el refresh token sólo viaja a `/auth`). */
class CookieJar {
  private readonly cookies = new Map<string, { value: string; path: string }>();

  header(url: string): string {
    const path = new URL(url).pathname;
    return [...this.cookies]
      .filter(([, cookie]) => path === cookie.path || path.startsWith(cookie.path.replace(/\/?$/, "/")))
      .map(([name, cookie]) => `${name}=${cookie.value}`)
      .join("; ");
  }

  /** Aplica los `Set-Cookie` de una respuesta; `Max-Age=0` o una fecha pasada la borran. */
  store(res: Response): void {
    for (const line of res.headers.getSetCookie()) {
      const [pair, ...attributes] = line.split(";").map((part) => part.trim());
      const [name, value = ""] = pair.split(/=(.*)/s, 2);
      let path = "/";
      let expired = false;
      for (const attribute of attributes) {
        const [key, raw = ""] = attribute.split(/=(.*)/s, 2);
        const lower = key.toLowerCase();
        if (lower === "path") path = raw;
        if (lower === "max-age" && Number(raw) <= 0) expired = true;
        if (lower === "expires" && Date.parse(raw) <= Date.now()) expired = true;
      }
      if (expired) this.cookies.delete(name);
      else this.cookies.set(name, { value: value.replace(/^"(.*)"$/, "$1"), path });
    }
  }
}

/** Un navegador con sesión propia: cookies y peticiones JSON al backend. */
export class Browser {
  protected readonly jar = new CookieJar();
  readonly origin = inject("backendUrl");

  /** `fetch` con las cookies de este navegador (lo que `credentials: "include"` haría). */
  protected async send(url: string, init: RequestInit = {}): Promise<Response> {
    const headers = new Headers(init.headers);
    const cookie = this.jar.header(url);
    if (cookie) headers.set("Cookie", cookie);
    const res = await fetch(url, { ...init, headers });
    this.jar.store(res);
    return res;
  }

  /** Petición JSON a la API, sea cual sea la respuesta. */
  request(path: string, method = "GET", body?: unknown): Promise<Response> {
    return this.send(this.origin + path, {
      method,
      headers: { "Content-Type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  }

  /** Petición JSON a la API; falla la prueba si la respuesta no es 2xx. */
  async api(path: string, method = "GET", body?: unknown): Promise<Response> {
    const res = await this.request(path, method, body);
    if (!res.ok) throw new Error(`${method} ${path} → ${res.status}: ${await res.text()}`);
    return res;
  }

  async login(email: string, password: string): Promise<void> {
    await this.api("/auth/login", "POST", { email, password });
  }
}

export interface TestUser {
  id: string;
  email: string;
  password: string;
}

let userCounter = 0;

/**
 * Usuario nuevo con su base CouchDB recién creada (cada prueba parte de datos limpios): lo
 * crea el admin y el propio usuario hace el cambio de contraseña forzado (RF-002 de 0002).
 */
export async function createUser(): Promise<TestUser> {
  const admin = new Browser();
  await admin.login(inject("adminEmail"), inject("adminPassword"));
  userCounter += 1;
  const email = `sync-${Date.now()}-${userCounter}@example.com`;
  const temporary = "temporal-1234";
  const { id } = (await (await admin.api("/admin/users", "POST", { email, password: temporary })).json()) as { id: string };

  const password = "definitiva-1234";
  const user = new Browser();
  await user.login(email, temporary);
  await user.api("/auth/change-password", "POST", { current_password: temporary, new_password: password });
  return { id, email, password };
}

/** Red de un dispositivo: con conexión, sin conexión o con el backend caído. */
export type Network = "online" | "offline" | "backend-down";

/** Petición de PouchDB al canal, para comprobar qué se envió. */
export interface SentRequest {
  method: string;
  path: string;
  body: string | undefined;
}

let deviceCounter = 0;

export class Device extends Browser {
  private network: Network = "online";
  private readonly inflight = new Set<AbortController>();
  /** Nombre de la réplica en memoria: se conserva entre `close()` y `open()` (RF-016). */
  private readonly localName: string;
  readonly requests: SentRequest[] = [];
  /** Observadores de los eventos del replicador (además de los almacenes de estado). */
  private readonly eventListeners = new Set<(event: SyncEvent) => void>();
  private current: SyncResources | null = null;

  constructor(readonly user: TestUser) {
    super();
    deviceCounter += 1;
    this.localName = `device-${deviceCounter}`;
  }

  /** Los recursos abiertos; falla la prueba si el dispositivo no está abierto. */
  get sync(): SyncResources {
    if (!this.current) throw new Error("dispositivo cerrado: llama a open()");
    return this.current;
  }

  /**
   * `fetch` de la remota: sin red, falla como el del navegador (`TypeError`); con el backend
   * caído, la conexión se rechaza. Cortar la red aborta también las peticiones en curso.
   *
   * Una petición sigue "en curso" hasta leer el cuerpo entero, no sólo hasta las cabeceras:
   * el `longpoll` de `_changes` responde las cabeceras enseguida y mantiene el cuerpo abierto
   * con latidos hasta que hay cambios (o 60 s).
   */
  private readonly channelFetch: Fetch = async (input, init = {}) => {
    if (this.network === "offline") throw new TypeError("fetch failed: sin red");
    let url = typeof input === "string" ? input : input.url;
    if (this.network === "backend-down") url = url.replace(this.origin, DEAD_ORIGIN);
    this.requests.push({
      method: init.method ?? "GET",
      path: new URL(url).pathname,
      body: typeof init.body === "string" ? init.body : undefined,
    });
    const controller = new AbortController();
    const signal = init.signal ? AbortSignal.any([init.signal, controller.signal]) : controller.signal;
    const done = (): void => {
      this.inflight.delete(controller);
    };
    this.inflight.add(controller);
    signal.addEventListener("abort", done, { once: true });
    let res: Response;
    try {
      res = await this.send(url, { ...init, signal });
    } catch (err) {
      done();
      throw err;
    }
    if (!res.body) {
      done();
      return res;
    }
    // El cuerpo pasa tal cual; al terminar (o fallar) la petición deja de estar en curso.
    const body = res.body.pipeThrough(new TransformStream({ flush: done }));
    return new Response(body, { status: res.status, statusText: res.statusText, headers: res.headers });
  };

  /** Renovación de sesión de este navegador (la de `api/auth.ts`, con sus cookies). */
  private readonly refresh = async (): Promise<boolean> => {
    if (this.network !== "online") return false;
    return (await this.send(this.origin + "/auth/refresh", { method: "POST" })).ok;
  };

  /** Observa los eventos del replicador; devuelve la función para dejar de observar. */
  onSyncEvent(listener: (event: SyncEvent) => void): () => void {
    this.eventListeners.add(listener);
    return () => this.eventListeners.delete(listener);
  }

  setNetwork(network: Network): void {
    this.network = network;
    if (network === "online") return;
    for (const controller of this.inflight) controller.abort(new TypeError("fetch failed: red cortada"));
  }

  /** Inicia sesión con el usuario del dispositivo (por defecto, su contraseña actual). */
  async signIn(password = this.user.password): Promise<void> {
    await this.login(this.user.email, password);
  }

  /** Abre la réplica del usuario (la misma si ya existía) y arranca la replicación. */
  async open(): Promise<SyncResources> {
    this.current = await openSyncResources(this.user.id, {
      localDb: { name: this.localName, adapter: "memory" },
      createRemote: (onSessionExpired) =>
        createRemoteDb({ onSessionExpired, origin: this.origin, fetch: this.channelFetch, refresh: this.refresh }),
      // Sin Web Locks y con un canal propio: cada dispositivo es otro navegador.
      createReplicator: (options) =>
        createReplicator({
          ...options,
          locks: null,
          channelName: this.localName,
          onEvent: (event) => {
            options.onEvent(event);
            this.eventListeners.forEach((listener) => listener(event));
          },
        }),
    });
    this.current.replicator.start();
    return this.current;
  }

  /** Detiene la replicación y conserva la réplica (como desmontar `SyncProvider`). */
  async close(): Promise<void> {
    await this.current?.close();
    this.current = null;
  }

  /** Detiene todo y borra la réplica (fin de la prueba). */
  async destroy(): Promise<void> {
    const resources = this.current;
    await this.close();
    if (resources) await destroyLocalDb(resources.db);
  }

  /** Espera a que el estado de sincronización cumpla la condición. */
  async waitForStatus(check: (status: SyncStatus) => boolean, timeout = 20_000): Promise<SyncStatus> {
    return vi.waitFor(
      () => {
        const status = this.sync.status.current();
        if (!check(status)) throw new Error(`estado de ${this.localName}: ${JSON.stringify(status)}`);
        return status;
      },
      { timeout, interval: 50 },
    );
  }

  /**
   * Espera a que el servidor haya confirmado todo lo escrito hasta ahora en la réplica y el
   * estado diga "al día". El estado recalcula los pendientes en diferido tras cada escritura,
   * así que justo después de escribir todavía puede decir "al día": por eso se compara además
   * la secuencia confirmada por el push (`_local/synapse-sync-state`) con la local de ahora.
   */
  async synced(timeout = 20_000): Promise<SyncStatus> {
    const { db, status } = this.sync;
    const target = seqNumber((await db.info()).update_seq);
    return vi.waitFor(
      async () => {
        const confirmed = ((await db.get(SYNC_STATE_DOC_ID).catch(() => ({ push_seq: 0 }))) as { push_seq: number }).push_seq;
        const current = status.current();
        if (confirmed < target || current.state !== "online" || current.pending) {
          throw new Error(`${this.localName} sin confirmar: ${confirmed}/${target} ${JSON.stringify(current)}`);
        }
        return current;
      },
      { timeout, interval: 50 },
    );
  }
}

/** Espera a que `check` deje de lanzar (aserciones de `expect` dentro). */
export function eventually<T>(check: () => T | Promise<T>, timeout = 20_000): Promise<T> {
  return vi.waitFor(check, { timeout, interval: 50 });
}
