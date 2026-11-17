import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import * as publicationApi from "./publicationApi";
import { usePublication } from "./usePublication";

afterEach(() => vi.restoreAllMocks());

describe("usePublication", () => {
  it("no llama si enabled es falso", () => {
    const getPublication = vi.spyOn(publicationApi, "getPublication");
    const { result } = renderHook(() => usePublication("v1", "note:v1:n1", false, "rev1"));
    expect(result.current.status).toBeNull();
    expect(getPublication).not.toHaveBeenCalled();
  });

  it("no llama si noteId es null", () => {
    const getPublication = vi.spyOn(publicationApi, "getPublication");
    const { result } = renderHook(() => usePublication("v1", null, true, "rev1"));
    expect(result.current.status).toBeNull();
    expect(getPublication).not.toHaveBeenCalled();
  });

  it("llama al montar si enabled y noteId están presentes", async () => {
    const statusData = { enabled: true, published: true, token: "tok", path: "/p/tok", published_at: "2026-11-17T10:00:00Z", republished_at: null, stale: false };
    const getPublication = vi.spyOn(publicationApi, "getPublication").mockResolvedValue(statusData);
    const { result } = renderHook(() => usePublication("v1", "note:v1:n1", true, "rev1"));
    await waitFor(() => expect(result.current.status).toEqual(statusData));
    expect(getPublication).toHaveBeenCalledWith("v1", "note:v1:n1");
  });

  it("al cambiar rev conserva el estado anterior mientras consulta, y al cambiar de documento lo vacía", async () => {
    const fresh = { enabled: true, published: true, token: "tok", path: "/p/tok", published_at: "2026-11-17T10:00:00Z", republished_at: null, stale: false };
    const stale = { ...fresh, stale: true };
    let release: (value: typeof stale) => void = () => undefined;
    const getPublication = vi.spyOn(publicationApi, "getPublication").mockResolvedValueOnce(fresh).mockImplementationOnce(() => new Promise((resolve) => { release = resolve; }));
    const { result, rerender } = renderHook(({ id, rev }) => usePublication("v1", id, true, rev), { initialProps: { id: "n1", rev: "r1" } });
    await waitFor(() => expect(result.current.status).toEqual(fresh));
    rerender({ id: "n1", rev: "r2" });
    await waitFor(() => expect(getPublication).toHaveBeenCalledTimes(2));
    expect(result.current.status).toEqual(fresh); // sin parpadeo mientras llega la respuesta nueva
    await act(async () => release(stale));
    await waitFor(() => expect(result.current.status).toEqual(stale));
    getPublication.mockReturnValue(new Promise(() => undefined));
    rerender({ id: "n2", rev: "r1" });
    expect(result.current.status).toBeNull(); // otro documento: nada del anterior
  });

  it("vuelve a llamar al cambiar rev", async () => {
    const statusData = { enabled: true, published: false, token: null, path: null, published_at: null, republished_at: null, stale: false };
    const getPublication = vi.spyOn(publicationApi, "getPublication").mockResolvedValue(statusData);
    const { result, rerender } = renderHook(
      ({ rev }) => usePublication("v1", "note:v1:n1", true, rev),
      { initialProps: { rev: "rev1" } }
    );
    await waitFor(() => expect(getPublication).toHaveBeenCalledTimes(1));
    rerender({ rev: "rev2" });
    await waitFor(() => expect(getPublication).toHaveBeenCalledTimes(2));
  });

  it("descarta una respuesta vieja si ya cambió algo", async () => {
    let callCount = 0;
    const getPublication = vi.spyOn(publicationApi, "getPublication").mockImplementation(
      () => new Promise((resolve) => {
        callCount++;
        const count = callCount;
        setTimeout(() => {
          if (count === 1) {
            resolve({ enabled: true, published: true, token: "tok", path: "/p/tok", published_at: "2026-11-17T10:00:00Z", republished_at: null, stale: false });
          } else {
            resolve({ enabled: true, published: false, token: null, path: null, published_at: null, republished_at: null, stale: false });
          }
        }, 100);
      })
    );
    const { result, rerender } = renderHook(
      ({ noteId }) => usePublication("v1", noteId, true, "rev1"),
      { initialProps: { noteId: "note:v1:n1" } }
    );
    expect(result.current.status).toBeNull();
    // Cambiar a otro documento inmediatamente, sin esperar la respuesta de n1.
    rerender({ noteId: "note:v1:n2" });
    // Esperar a que la primera llamada async termine (pero no afecte el estado porque alive es false para n1).
    await new Promise((r) => setTimeout(r, 150));
    // Status debe ser de n2 (segunda respuesta), no de n1.
    expect(result.current.status).toEqual({ enabled: true, published: false, token: null, path: null, published_at: null, republished_at: null, stale: false });
  });

  it("un error deja status null sin lanzar", async () => {
    const getPublication = vi.spyOn(publicationApi, "getPublication").mockRejectedValue(new Error("Network error"));
    const { result } = renderHook(() => usePublication("v1", "note:v1:n1", true, "rev1"));
    await waitFor(() => {
      expect(result.current.status).toBeNull();
    });
  });

  it("setStatus actualiza el estado sin otra llamada", async () => {
    const statusData = { enabled: true, published: false, token: null, path: null, published_at: null, republished_at: null, stale: false };
    const getPublication = vi.spyOn(publicationApi, "getPublication").mockResolvedValue(statusData);
    const { result } = renderHook(() => usePublication("v1", "note:v1:n1", true, "rev1"));
    await waitFor(() => expect(result.current.status).toEqual(statusData));
    const newStatus = { enabled: true, published: true, token: "newtok", path: "/p/newtok", published_at: "2026-11-17T10:30:00Z", republished_at: null, stale: false };
    await act(async () => {
      result.current.setStatus(newStatus);
    });
    expect(result.current.status).toEqual(newStatus);
    // No debe haber más llamadas (la anterior ya se contó).
    expect(getPublication).toHaveBeenCalledTimes(1);
  });

  it("refresh repite la consulta incluso sin cambios en dependencias", async () => {
    const statusData = { enabled: true, published: false, token: null, path: null, published_at: null, republished_at: null, stale: false };
    const getPublication = vi.spyOn(publicationApi, "getPublication").mockResolvedValue(statusData);
    const { result } = renderHook(() => usePublication("v1", "note:v1:n1", true, "rev1"));
    await waitFor(() => expect(getPublication).toHaveBeenCalledTimes(1));
    await result.current.refresh();
    expect(getPublication).toHaveBeenCalledTimes(2);
  });
});
