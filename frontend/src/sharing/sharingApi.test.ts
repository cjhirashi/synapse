import { afterEach, beforeEach, expect, test, vi } from "vitest";
import * as api from "./sharingApi";
import * as auth from "../api/auth";

beforeEach(() => {
  vi.spyOn(auth, "request").mockClear();
});
afterEach(() => vi.restoreAllMocks());

test("listInvitations llama a GET /invitations", async () => {
  const mockReq = vi.spyOn(auth, "request").mockResolvedValue({
    json: async () => ({ items: [] }),
  } as Response);
  await api.listInvitations();
  expect(mockReq).toHaveBeenCalledWith("/invitations");
});

test("acceptInvitation llama a POST /invitations/{id}/accept con id codificado", async () => {
  const mockReq = vi.spyOn(auth, "request").mockResolvedValue({} as Response);
  await api.acceptInvitation("inv-123/special");
  expect(mockReq).toHaveBeenCalledWith(
    `/invitations/${encodeURIComponent("inv-123/special")}/accept`,
    { method: "POST" }
  );
});

test("rejectInvitation llama a POST /invitations/{id}/reject con id codificado", async () => {
  const mockReq = vi.spyOn(auth, "request").mockResolvedValue({} as Response);
  await api.rejectInvitation("inv-456/test");
  expect(mockReq).toHaveBeenCalledWith(
    `/invitations/${encodeURIComponent("inv-456/test")}/reject`,
    { method: "POST" }
  );
});

test("leaveInvitation llama a POST /invitations/{id}/leave con id codificado", async () => {
  const mockReq = vi.spyOn(auth, "request").mockResolvedValue({} as Response);
  await api.leaveInvitation("inv-789/leave");
  expect(mockReq).toHaveBeenCalledWith(
    `/invitations/${encodeURIComponent("inv-789/leave")}/leave`,
    { method: "POST" }
  );
});

test("listMembers llama a GET /vaults/{id}/members con id codificado", async () => {
  const mockReq = vi.spyOn(auth, "request").mockResolvedValue({
    json: async () => ({ items: [] }),
  } as Response);
  await api.listMembers("vault-123/special");
  expect(mockReq).toHaveBeenCalledWith(`/vaults/${encodeURIComponent("vault-123/special")}/members`);
});

test("inviteMember llama a POST /vaults/{id}/members con email y grants", async () => {
  const mockReq = vi.spyOn(auth, "request").mockResolvedValue({
    json: async () => ({ id: "member-1", grants: [] }),
  } as Response);
  const grants = [{ folder: "*", level: "lectura" as const }];
  await api.inviteMember("vault-123", "test@example.com", grants);
  expect(mockReq).toHaveBeenCalledWith(
    "/vaults/vault-123/members",
    {
      method: "POST",
      body: JSON.stringify({ email: "test@example.com", grants }),
    }
  );
});

test("updateMemberGrants llama a PUT /vaults/{id}/members/{id}/grants", async () => {
  const mockReq = vi.spyOn(auth, "request").mockResolvedValue({
    json: async () => ({ id: "member-1", grants: [] }),
  } as Response);
  const grants = [{ folder: "Docs", level: "escritura" as const }];
  await api.updateMemberGrants("vault-123", "member-456/test", grants);
  expect(mockReq).toHaveBeenCalledWith(
    `/vaults/vault-123/members/${encodeURIComponent("member-456/test")}/grants`,
    {
      method: "PUT",
      body: JSON.stringify({ grants }),
    }
  );
});

test("removeMember llama a DELETE /vaults/{id}/members/{id} con ids codificados", async () => {
  const mockReq = vi.spyOn(auth, "request").mockResolvedValue({} as Response);
  await api.removeMember("vault-789/special", "member-999/delete");
  expect(mockReq).toHaveBeenCalledWith(
    `/vaults/${encodeURIComponent("vault-789/special")}/members/${encodeURIComponent("member-999/delete")}`,
    { method: "DELETE" }
  );
});
