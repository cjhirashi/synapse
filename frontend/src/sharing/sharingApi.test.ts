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
