import { afterEach, expect, test, vi } from "vitest";
import { createAgentKey, listAgentKeys, revokeAgentKey } from "./apiKeys";
import { ApiError } from "../api/problems";

function json(status: number, body: unknown = {}): Response {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

function problem(status: number, slug: string, title: string, path = "/auth/agent-keys"): Response {
  const body = { type: `urn:synapse:problem:${slug}`, title, status, detail: title, instance: path };
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/problem+json" } });
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

test("C-1: lista las keys del usuario con GET /auth/agent-keys", async () => {
  const keys = [
    { id: "k1", label: "CI", created_at: "2026-10-01T00:00:00Z", last_used_at: null, revoked_at: null },
    { id: "k2", label: "viejo", created_at: "2026-09-01T00:00:00Z", last_used_at: "2026-09-02T00:00:00Z", revoked_at: "2026-10-01T00:00:00Z" },
  ];
  const fetchMock = vi.fn().mockResolvedValueOnce(json(200, keys));
  vi.stubGlobal("fetch", fetchMock);

  await expect(listAgentKeys()).resolves.toEqual(keys);
  expect(fetchMock.mock.calls[0][0]).toBe("/auth/agent-keys");
  expect(fetchMock.mock.calls[0][1]).toMatchObject({ credentials: "include" });
});

test("C-2: crea una key con POST y devuelve el secreto en texto plano una vez", async () => {
  const created = { id: "k3", label: "nueva", key: "sk_live_abc123", created_at: "2026-10-28T00:00:00Z" };
  const fetchMock = vi.fn().mockResolvedValueOnce(json(201, created));
  vi.stubGlobal("fetch", fetchMock);

  await expect(createAgentKey("nueva")).resolves.toEqual(created);
  expect(fetchMock.mock.calls[0][0]).toBe("/auth/agent-keys");
  expect(fetchMock.mock.calls[0][1]).toMatchObject({ method: "POST", body: JSON.stringify({ label: "nueva" }) });
});

test("C-3: un label duplicado llega como ApiError con su type (409)", async () => {
  vi.stubGlobal("fetch", vi.fn().mockResolvedValueOnce(problem(409, "agent-key-label-taken", "Agent key label already in use")));

  const err = await createAgentKey("CI").catch((e) => e);
  expect(err).toBeInstanceOf(ApiError);
  expect(err).toMatchObject({ status: 409, type: "urn:synapse:problem:agent-key-label-taken" });
});

test("C-4: revoca una key con DELETE /auth/agent-keys/{id}, escapando el id", async () => {
  const fetchMock = vi.fn().mockResolvedValueOnce(new Response(null, { status: 204 }));
  vi.stubGlobal("fetch", fetchMock);

  await expect(revokeAgentKey("a b/c")).resolves.toBeUndefined();
  expect(fetchMock.mock.calls[0][0]).toBe("/auth/agent-keys/a%20b%2Fc");
  expect(fetchMock.mock.calls[0][1]).toMatchObject({ method: "DELETE" });
});
