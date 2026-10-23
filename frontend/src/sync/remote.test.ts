// Base remota del canal /sync (SPEC-0005 RF-002, RF-016; PLAN-0005 §2.5).
import { refreshSession } from "../api/auth";
import { BULK_CHUNK_BYTES, REMOTE_PATH, createRemoteDb, syncFetch } from "./remote";

vi.mock("../api/auth", () => ({ refreshSession: vi.fn() }));

const refresh = vi.mocked(refreshSession);
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
const unauthorized = () => json({ type: "about:blank", title: "Unauthorized", status: 401 }, 401);

beforeEach(() => {
  refresh.mockReset();
});

describe("syncFetch", () => {
  it("envía siempre las cookies de sesión y conserva la petición de PouchDB", async () => {
    const base = vi.fn().mockResolvedValue(json({ ok: true }));
    const fetcher = syncFetch(vi.fn(), base);
    await fetcher("https://app.test/sync/db/_bulk_docs", { method: "POST", body: "{}", credentials: "omit" });
    expect(base).toHaveBeenCalledWith("https://app.test/sync/db/_bulk_docs", { method: "POST", body: "{}", credentials: "include" });
    expect(refresh).not.toHaveBeenCalled();
  });

  it("401 → renueva la sesión y repite la misma petición una vez", async () => {
    const base = vi.fn().mockResolvedValueOnce(unauthorized()).mockResolvedValueOnce(json({ ok: true }));
    refresh.mockResolvedValue(true);
    const expired = vi.fn();
    const res = await syncFetch(expired, base)("https://app.test/sync/db/", { method: "GET" });
    expect(res.status).toBe(200);
    expect(base).toHaveBeenCalledTimes(2);
    expect(base.mock.calls[1]).toEqual(base.mock.calls[0]);
    expect(expired).not.toHaveBeenCalled();
  });

  it("401 y la renovación falla → avisa sesión caducada y devuelve el 401 sin repetir", async () => {
    const base = vi.fn().mockResolvedValue(unauthorized());
    refresh.mockResolvedValue(false);
    const expired = vi.fn();
    const res = await syncFetch(expired, base)("https://app.test/sync/db/");
    expect(res.status).toBe(401);
    expect(base).toHaveBeenCalledTimes(1);
    expect(expired).toHaveBeenCalledTimes(1);
  });

  it("401 también tras renovar → sesión caducada", async () => {
    const base = vi.fn().mockResolvedValue(unauthorized());
    refresh.mockResolvedValue(true);
    const expired = vi.fn();
    expect((await syncFetch(expired, base)("https://app.test/sync/db/")).status).toBe(401);
    expect(base).toHaveBeenCalledTimes(2);
    expect(expired).toHaveBeenCalledTimes(1);
  });

  it("otros errores (503) y fallos de red llegan tal cual a PouchDB: son 'sin conexión' (RF-019)", async () => {
    const expired = vi.fn();
    const unavailable = vi.fn().mockResolvedValue(json({ status: 503 }, 503));
    expect((await syncFetch(expired, unavailable)("https://app.test/sync/db/")).status).toBe(503);
    const offline = vi.fn().mockRejectedValue(new TypeError("Failed to fetch"));
    await expect(syncFetch(expired, offline)("https://app.test/sync/db/")).rejects.toThrow("Failed to fetch");
    expect(refresh).not.toHaveBeenCalled();
    expect(expired).not.toHaveBeenCalled();
  });

  it("con una renovación propia (otro dispositivo en las pruebas de integración) usa ésa", async () => {
    const base = vi.fn().mockResolvedValueOnce(unauthorized()).mockResolvedValueOnce(json({ ok: true }));
    const ownRefresh = vi.fn().mockResolvedValue(true);
    const res = await syncFetch(vi.fn(), base, ownRefresh)("https://app.test/sync/db/");
    expect(res.status).toBe(200);
    expect(ownRefresh).toHaveBeenCalledOnce();
    expect(refresh).not.toHaveBeenCalled();
  });
});

describe("reparto de `_bulk_docs` en sub-peticiones (SPEC-0008 RF-016; PLAN-0008 P-6)", () => {
  const URL_BULK = "https://app.test/sync/db/_bulk_docs";
  const MIB = 1024 * 1024;
  const bytes = (text: string) => new TextEncoder().encode(text).length;
  /** Documento cuyo cuerpo serializado pesa ~`size` bytes (texto ASCII en `content`). */
  const doc = (id: string, size: number) => ({ _id: id, _rev: "1-a", content: "x".repeat(size) });
  const body = (docs: object[]) => JSON.stringify({ docs, new_edits: false });
  const post = (docs: object[]) => ({ method: "POST", body: body(docs) });
  const rejection = (id: string) => ({ id, rev: "1-a", error: "forbidden", reason: "vault-not-found" });
  /** Ids de los documentos de cada sub-petición enviada a `base`. */
  const sentIds = (base: ReturnType<typeof vi.fn>) =>
    base.mock.calls.map(([, init]) => (JSON.parse(init.body).docs as { _id: string }[]).map((d) => d._id));

  it("un lote de hasta 8 MiB pasa sin cambios, en una sola petición", async () => {
    const base = vi.fn().mockResolvedValue(json([rejection("a")], 201));
    const init = post([doc("a", 3 * MIB), doc("b", 3 * MIB)]);
    const res = await syncFetch(vi.fn(), base)(URL_BULK, init);
    expect(base).toHaveBeenCalledTimes(1);
    expect(base).toHaveBeenCalledWith(URL_BULK, { ...init, credentials: "include" });
    expect(await res.json()).toEqual([rejection("a")]);
  });

  it("un lote de más de 8 MiB se parte en sub-peticiones de ≤ 8 MiB, en orden", async () => {
    // Una `Response` nueva por llamada: su cuerpo sólo se puede leer una vez.
    const base = vi.fn().mockImplementation(async () => json([], 201));
    const docs = [doc("a", 4 * MIB), doc("b", 4 * MIB), doc("c", 1024), doc("d", 5 * MIB)];
    await syncFetch(vi.fn(), base)(URL_BULK, post(docs));
    expect(sentIds(base)).toEqual([["a"], ["b", "c"], ["d"]]);
    for (const [url, init] of base.mock.calls) {
      expect(url).toBe(URL_BULK);
      expect(bytes(init.body)).toBeLessThanOrEqual(BULK_CHUNK_BYTES);
      expect(JSON.parse(init.body).new_edits).toBe(false);
      expect(init.method).toBe("POST");
    }
  });

  it("concatena los rechazos de las sub-peticiones en el orden de envío", async () => {
    const base = vi
      .fn()
      .mockResolvedValueOnce(json([rejection("a")], 201))
      .mockResolvedValueOnce(json([], 201))
      .mockResolvedValueOnce(json([rejection("d"), rejection("e")], 201));
    const res = await syncFetch(vi.fn(), base)(
      URL_BULK,
      post([doc("a", 5 * MIB), doc("b", 5 * MIB), doc("d", 5 * MIB)]),
    );
    expect(res.status).toBe(201);
    expect(await res.json()).toEqual([rejection("a"), rejection("d"), rejection("e")]);
  });

  it("un documento mayor de 8 MiB va solo", async () => {
    // Una `Response` nueva por llamada: su cuerpo sólo se puede leer una vez.
    const base = vi.fn().mockImplementation(async () => json([], 201));
    await syncFetch(vi.fn(), base)(URL_BULK, post([doc("a", 1024), doc("big", 9 * MIB), doc("b", 1024)]));
    expect(sentIds(base)).toEqual([["a"], ["big"], ["b"]]);
  });

  it("si una sub-petición falla devuelve ese fallo tal cual y no envía las siguientes", async () => {
    const base = vi
      .fn()
      .mockResolvedValueOnce(json([], 201))
      .mockResolvedValueOnce(json({ type: "about:blank", title: "Unavailable", status: 503 }, 503));
    const res = await syncFetch(vi.fn(), base)(URL_BULK, post([doc("a", 5 * MIB), doc("b", 5 * MIB), doc("c", 5 * MIB)]));
    expect(res.status).toBe(503);
    expect(await res.json()).toMatchObject({ status: 503 });
    expect(base).toHaveBeenCalledTimes(2);
  });

  it("sólo reparte `_bulk_docs`: otras rutas grandes pasan enteras", async () => {
    const base = vi.fn().mockResolvedValue(json({ results: [] }));
    const init = { method: "POST", body: JSON.stringify({ docs: [doc("a", 9 * MIB)] }) };
    await syncFetch(vi.fn(), base)("https://app.test/sync/db/_bulk_get", init);
    expect(base).toHaveBeenCalledTimes(1);
  });

  it("cada sub-petición sigue la política de sesión (401 → renueva y repite)", async () => {
    refresh.mockResolvedValue(true);
    const base = vi
      .fn()
      .mockResolvedValueOnce(unauthorized())
      .mockImplementation(async () => json([], 201));
    await syncFetch(vi.fn(), base)(URL_BULK, post([doc("a", 5 * MIB), doc("b", 5 * MIB)]));
    // 401 + reintento de la 1.ª, y la 2.ª.
    expect(base).toHaveBeenCalledTimes(3);
  });
});

describe("createRemoteDb", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("base HTTP absoluta en el mismo origen, sin crearla, con las cookies de sesión", async () => {
    const calls: [string, RequestInit][] = [];
    vi.stubGlobal("fetch", vi.fn(async (url: string, init: RequestInit) => {
      calls.push([String(url), init]);
      return json({ db_name: "db", update_seq: "0", instance_start_time: "0" });
    }));
    const remote = createRemoteDb({ onSessionExpired: vi.fn(), origin: "https://app.test" });
    expect(remote.name).toBe(`https://app.test${REMOTE_PATH}`);
    // `adapter` existe en tiempo de ejecución, pero los tipos de PouchDB no lo declaran.
    expect((remote as unknown as { adapter: string }).adapter).toBe("http");

    await remote.info();
    expect(calls.length).toBeGreaterThan(0);
    for (const [url, init] of calls) {
      expect(url.startsWith("https://app.test/sync/db")).toBe(true);
      expect(init.credentials).toBe("include");
      // El canal no permite crear la base (`PUT /sync/db/` → 404): `skip_setup`.
      expect(init.method ?? "GET").not.toBe("PUT");
    }
  });

  it("con `fetch` y `refresh` propios no usa los globales (un dispositivo por instancia)", async () => {
    const global = vi.fn();
    vi.stubGlobal("fetch", global);
    const own = vi.fn()
      .mockResolvedValueOnce(unauthorized())
      .mockResolvedValue(json({ db_name: "db", update_seq: "0", instance_start_time: "0" }));
    const ownRefresh = vi.fn().mockResolvedValue(true);
    const remote = createRemoteDb({ onSessionExpired: vi.fn(), origin: "http://127.0.0.1:1", fetch: own, refresh: ownRefresh });

    await remote.info();
    expect(own).toHaveBeenCalled();
    expect(ownRefresh).toHaveBeenCalledOnce();
    expect(global).not.toHaveBeenCalled();
    expect(refresh).not.toHaveBeenCalled();
  });

  describe("defecto de PouchDB 9: `info()` sin `catch` en la replicación (VC-7, enmienda 1)", () => {
    /** Base remota cuya red cae en cada petición. */
    const offline = () =>
      createRemoteDb({
        onSessionExpired: vi.fn(),
        origin: "https://app.test",
        fetch: vi.fn().mockRejectedValue(new TypeError("Failed to fetch")),
        refresh: vi.fn(),
      });

    /** Rechazos sin manejar que Node detecta durante `run` (tras vaciar las microtareas). */
    async function unhandledDuring(run: () => void): Promise<unknown[]> {
      const seen: unknown[] = [];
      const listener = (reason: unknown) => seen.push(reason);
      process.prependListener("unhandledRejection", listener);
      try {
        run();
        // Node avisa de los rechazos sin manejar al acabar cada macrotarea. Justificado (F-3): son
        // turnos del bucle de eventos (`setTimeout(0)`), no un plazo de reloj: no dependen de la carga.
        for (let i = 0; i < 5; i += 1) await new Promise((resolve) => setTimeout(resolve, 0));
      } finally {
        process.off("unhandledRejection", listener);
      }
      return seen;
    }

    it("una derivada de `info()` que nadie mira no es un rechazo sin manejar", async () => {
      const remote = offline();
      // Lo que hace PouchDB al actualizar `activeTasks`: `then` sin `catch`, descartado.
      expect(await unhandledDuring(() => void remote.info().then(() => undefined))).toEqual([]);
    });

    it("quien espera `info()` recibe el rechazo igual", async () => {
      await expect(offline().info()).rejects.toThrow();
      await expect(offline().info().then(() => "nunca")).rejects.toThrow();
    });
  });
});
