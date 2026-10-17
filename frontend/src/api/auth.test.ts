import { afterEach, expect, test, vi } from "vitest";
import { ApiError, getMe, login } from "./auth";
import { ApiError as ProblemApiError } from "./problems";

function json(status: number, body: unknown = {}): Response {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

/** Respuesta de error como la emite el backend (SPEC-0004). */
function problem(status: number, slug: string, title: string, path = "/auth/me"): Response {
  const body = { type: `urn:synapse:problem:${slug}`, title, status, detail: title, instance: path };
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/problem+json" } });
}

const ME = { user_id: "1", role: "guest", must_change_password: false };

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

test("RF-023: tras un 401 renueva la sesión una vez y repite la petición", async () => {
  const fetchMock = vi
    .fn()
    .mockResolvedValueOnce(problem(401, "invalid-token", "Invalid token"))
    .mockResolvedValueOnce(json(200))
    .mockResolvedValueOnce(json(200, ME));
  vi.stubGlobal("fetch", fetchMock);

  await expect(getMe()).resolves.toEqual(ME);
  expect(fetchMock.mock.calls.map((c) => c[0])).toEqual(["/auth/me", "/auth/refresh", "/auth/me"]);
});

test("RF-023: si la renovación falla, la sesión se trata como cerrada (401)", async () => {
  const fetchMock = vi
    .fn()
    .mockResolvedValueOnce(problem(401, "invalid-token", "Invalid token"))
    .mockResolvedValueOnce(problem(401, "invalid-refresh-token", "Invalid refresh token", "/auth/refresh"));
  vi.stubGlobal("fetch", fetchMock);

  const err = await getMe().catch((e) => e);
  expect(err).toBeInstanceOf(ApiError);
  expect(err.status).toBe(401);
  expect(fetchMock).toHaveBeenCalledTimes(2);
});

test("RF-023: varias peticiones con 401 a la vez comparten una única renovación", async () => {
  let meCalls = 0;
  const fetchMock = vi.fn(async (path: string) => {
    if (path === "/auth/refresh") return json(200);
    meCalls += 1;
    return meCalls <= 2 ? json(401) : json(200, ME);
  });
  vi.stubGlobal("fetch", fetchMock);

  await Promise.all([getMe(), getMe()]);
  expect(fetchMock.mock.calls.filter((c) => c[0] === "/auth/refresh")).toHaveLength(1);
});

test("RF-023: la renovación se serializa entre pestañas con Web Locks cuando existen", async () => {
  const request = vi.fn((_name: string, cb: () => Promise<unknown>) => cb());
  vi.stubGlobal("navigator", { ...navigator, locks: { request } });
  const fetchMock = vi
    .fn()
    .mockResolvedValueOnce(json(401))
    .mockResolvedValueOnce(json(200))
    .mockResolvedValueOnce(json(200, ME));
  vi.stubGlobal("fetch", fetchMock);

  await getMe();
  expect(request).toHaveBeenCalledWith("synapse-auth-refresh", expect.any(Function));
});

test("RF-023: un 401 de login no dispara renovación", async () => {
  const fetchMock = vi.fn().mockResolvedValueOnce(problem(401, "invalid-credentials", "Invalid credentials", "/auth/login"));
  vi.stubGlobal("fetch", fetchMock);

  await expect(login("a@b.co", "x")).rejects.toMatchObject({ status: 401 });
  expect(fetchMock).toHaveBeenCalledTimes(1);
});

test("RF-010: un error de la API llega como ApiError con su type y detail", async () => {
  vi.stubGlobal("fetch", vi.fn().mockResolvedValueOnce(problem(401, "invalid-credentials", "Invalid credentials", "/auth/login")));

  const err = await login("a@b.co", "x").catch((e) => e);
  expect(err).toBeInstanceOf(ApiError);
  expect(err).toBeInstanceOf(ProblemApiError);
  expect(err).toMatchObject({
    status: 401,
    type: "urn:synapse:problem:invalid-credentials",
    detail: "Invalid credentials",
    message: "Invalid credentials",
  });
});
