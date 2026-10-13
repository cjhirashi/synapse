// Base remota del canal /sync (SPEC-0005 RF-002, RF-016; PLAN-0005 §2.5).
import { refreshSession } from "../api/auth";
import { REMOTE_PATH, createRemoteDb, syncFetch } from "./remote";

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
});
