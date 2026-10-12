import { afterEach, expect, test, vi } from "vitest";
import { ApiError } from "./problems";
import {
  createVault,
  deleteVault,
  getVault,
  listVaults,
  restoreVault,
  updateVault,
  VAULT_PROBLEM,
} from "./vaults";

const BODY = {
  id: "7d1c9a8e-0000-4000-8000-000000000001",
  name: "Notas",
  description: null,
  tags: ["work"],
  owner_id: "u1",
  created_at: "2026-10-12T09:00:00.000000Z",
  updated_at: "2026-10-12T09:00:00.000000Z",
  deleted_at: null,
};

function json(status: number, body: unknown, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...headers },
  });
}

function problem(status: number, slug: string): Response {
  const body = { type: `urn:synapse:problem:${slug}`, title: slug, status, instance: "/vaults" };
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/problem+json" } });
}

function mockFetch(...responses: Response[]) {
  const fetchMock = vi.fn();
  for (const res of responses) fetchMock.mockResolvedValueOnce(res);
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

/** Método, cabeceras y cuerpo de la llamada `n` a `fetch`. */
function call(fetchMock: ReturnType<typeof vi.fn>, n = 0) {
  const [path, init] = fetchMock.mock.calls[n] as [string, RequestInit];
  return { path, method: init.method ?? "GET", headers: new Headers(init.headers), body: init.body };
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

test("RF-018: listVaults pide la primera página sin cursor y devuelve cada bóveda con su etag", async () => {
  const page = { items: [{ ...BODY, etag: '"1-a"' }], next_cursor: "c1" };
  const fetchMock = mockFetch(json(200, page));
  await expect(listVaults()).resolves.toEqual(page);
  expect(call(fetchMock).path).toBe("/vaults");
});

test("RF-018 / RF-028: listVaults envía `cursor` y `deleted` cuando se piden", async () => {
  const fetchMock = mockFetch(json(200, { items: [], next_cursor: null }));
  await listVaults({ deleted: true, cursor: "a b/c" });
  const url = new URL(call(fetchMock).path, "http://x");
  expect(url.pathname).toBe("/vaults");
  expect(Object.fromEntries(url.searchParams)).toEqual({ deleted: "true", cursor: "a b/c" });
});

test("getVault toma el etag de la cabecera `ETag`", async () => {
  mockFetch(json(200, BODY, { ETag: '"2-b"' }));
  await expect(getVault(BODY.id)).resolves.toEqual({ ...BODY, etag: '"2-b"' });
});

test("RF-019: createVault envía el formulario y devuelve la bóveda con su etag", async () => {
  const fetchMock = mockFetch(json(201, BODY, { ETag: '"1-a"' }));
  const input = { name: "Notas", description: null, tags: ["work"] };
  await expect(createVault(input)).resolves.toEqual({ ...BODY, etag: '"1-a"' });
  const sent = call(fetchMock);
  expect([sent.path, sent.method, JSON.parse(String(sent.body))]).toEqual(["/vaults", "POST", input]);
  expect(sent.headers.get("Content-Type")).toBe("application/json");
});

test("RF-019: updateVault envía PATCH con If-Match y devuelve el etag nuevo", async () => {
  const fetchMock = mockFetch(json(200, { ...BODY, name: "Otra" }, { ETag: '"2-b"' }));
  const saved = await updateVault(BODY.id, { name: "Otra" }, '"1-a"');
  expect(saved).toEqual({ ...BODY, name: "Otra", etag: '"2-b"' });
  const sent = call(fetchMock);
  expect([sent.path, sent.method]).toEqual([`/vaults/${BODY.id}`, "PATCH"]);
  expect(sent.headers.get("If-Match")).toBe('"1-a"');
  expect(sent.headers.get("Content-Type")).toBe("application/json");
});

test("RF-020: deleteVault envía DELETE con If-Match", async () => {
  const fetchMock = mockFetch(new Response(null, { status: 204 }));
  await expect(deleteVault(BODY.id, '"1-a"')).resolves.toBeUndefined();
  const sent = call(fetchMock);
  expect([sent.path, sent.method, sent.headers.get("If-Match")]).toEqual([`/vaults/${BODY.id}`, "DELETE", '"1-a"']);
});

test("RF-028: restoreVault envía POST a /restore con el etag de la papelera", async () => {
  const fetchMock = mockFetch(json(200, BODY, { ETag: '"3-c"' }));
  await expect(restoreVault(BODY.id, '"2-b"')).resolves.toEqual({ ...BODY, etag: '"3-c"' });
  const sent = call(fetchMock);
  expect([sent.path, sent.method, sent.headers.get("If-Match")]).toEqual([`/vaults/${BODY.id}/restore`, "POST", '"2-b"']);
});

test("los ids se codifican en la ruta", async () => {
  const fetchMock = mockFetch(json(200, BODY, { ETag: '"1-a"' }));
  await getVault("a/b");
  expect(call(fetchMock).path).toBe("/vaults/a%2Fb");
});

test.each([
  [409, "vault-name-taken", VAULT_PROBLEM.nameTaken],
  [412, "precondition-failed", VAULT_PROBLEM.preconditionFailed],
  [404, "vault-not-found", VAULT_PROBLEM.notFound],
])("los errores llegan como ApiError con su type (%i)", async (status, slug, type) => {
  mockFetch(problem(status, slug));
  const err = await restoreVault(BODY.id, '"1-a"').catch((e) => e);
  expect(err).toBeInstanceOf(ApiError);
  expect([err.status, err.type]).toEqual([status, type]);
});
