import { afterEach, expect, test, vi } from "vitest";
import {
  ALLOWED_IMAGE_TYPES,
  MAX_FILE_SIZE,
  UploadTooLargeError,
  UploadTypeError,
  uploadFile,
} from "./uploadFile";
import { ApiError } from "../api/problems";

const VAULT = "11111111-1111-4111-8111-111111111111";

function json(status: number, body: unknown = {}): Response {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

function problem(status: number, slug: string, title: string): Response {
  const body = { type: `urn:synapse:problem:${slug}`, title, status, detail: title, instance: "/files" };
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/problem+json" } });
}

function pngFile(name = "foto.png", size = 16): File {
  return new File([new Uint8Array(size)], name, { type: "image/png" });
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

test("C-1/C-6: sube con POST /files multipart (vault_id + file) y devuelve el id", async () => {
  const created = { id: "f-1", vault_id: VAULT, name: "foto.png", content_type: "image/png", size: 16, visibility: "private", created_at: "2026-10-30T00:00:00Z" };
  const fetchMock = vi.fn().mockResolvedValueOnce(json(201, created));
  vi.stubGlobal("fetch", fetchMock);

  await expect(uploadFile(pngFile(), VAULT)).resolves.toEqual(created);

  const [path, init] = fetchMock.mock.calls[0];
  expect(path).toBe("/files");
  expect(init).toMatchObject({ method: "POST", credentials: "include" });
  // El cuerpo es FormData con los dos campos; NO se fija Content-Type (lo pone el navegador).
  expect(init.body).toBeInstanceOf(FormData);
  expect((init.body as FormData).get("vault_id")).toBe(VAULT);
  expect((init.body as FormData).get("file")).toBeInstanceOf(File);
  expect(init.headers).toEqual({});
});

test("C-6: un tipo no admitido se rechaza en el cliente, sin llamar a la red", async () => {
  const fetchMock = vi.fn();
  vi.stubGlobal("fetch", fetchMock);
  const exe = new File([new Uint8Array(16)], "malware.exe", { type: "application/x-msdownload" });

  await expect(uploadFile(exe, VAULT)).rejects.toBeInstanceOf(UploadTypeError);
  expect(fetchMock).not.toHaveBeenCalled();
});

test("C-6: un archivo de más de 5 MB se rechaza en el cliente, sin llamar a la red", async () => {
  const fetchMock = vi.fn();
  vi.stubGlobal("fetch", fetchMock);
  const big = pngFile("big.png", MAX_FILE_SIZE + 1);

  await expect(uploadFile(big, VAULT)).rejects.toBeInstanceOf(UploadTooLargeError);
  expect(fetchMock).not.toHaveBeenCalled();
});

test("todos los tipos admitidos pasan la validación de cliente (png/jpeg/webp/gif/svg)", async () => {
  const fetchMock = vi.fn().mockImplementation(() => Promise.resolve(json(201, { id: "f" })));
  vi.stubGlobal("fetch", fetchMock);
  for (const type of ALLOWED_IMAGE_TYPES) {
    await expect(uploadFile(new File([new Uint8Array(8)], "x", { type }), VAULT)).resolves.toBeDefined();
  }
  expect(fetchMock).toHaveBeenCalledTimes(ALLOWED_IMAGE_TYPES.length);
});

test("un error del servidor llega como ApiError (p. ej. 413)", async () => {
  vi.stubGlobal("fetch", vi.fn().mockResolvedValueOnce(problem(413, "file-too-large", "File too large")));
  const err = await uploadFile(pngFile(), VAULT).catch((e) => e);
  expect(err).toBeInstanceOf(ApiError);
  expect(err).toMatchObject({ status: 413, type: "urn:synapse:problem:file-too-large" });
});

test("renameFile: PATCH /files/{id} con {name} y devuelve metadatos", async () => {
  const updated = { id: "f-1", vault_id: VAULT, name: "nuevo.png", content_type: "image/png", size: 16, visibility: "private", created_at: "2026-10-30T00:00:00Z" };
  const fetchMock = vi.fn().mockResolvedValueOnce(json(200, updated));
  vi.stubGlobal("fetch", fetchMock);

  const { renameFile } = await import("./uploadFile");
  await expect(renameFile("f-1", "nuevo.png")).resolves.toEqual(updated);

  const [path, init] = fetchMock.mock.calls[0];
  expect(path).toBe("/files/f-1");
  expect(init).toMatchObject({ method: "PATCH", credentials: "include" });
  expect(JSON.parse(init.body)).toEqual({ name: "nuevo.png" });
});

test("setFileVisibility: PATCH /files/{id} con {visibility} y devuelve metadatos", async () => {
  const updated = { id: "f-1", vault_id: VAULT, name: "foto.png", content_type: "image/png", size: 16, visibility: "public", created_at: "2026-10-30T00:00:00Z" };
  const fetchMock = vi.fn().mockResolvedValueOnce(json(200, updated));
  vi.stubGlobal("fetch", fetchMock);

  const { setFileVisibility } = await import("./uploadFile");
  await expect(setFileVisibility("f-1", "public")).resolves.toEqual(updated);

  const [path, init] = fetchMock.mock.calls[0];
  expect(path).toBe("/files/f-1");
  expect(init).toMatchObject({ method: "PATCH", credentials: "include" });
  expect(JSON.parse(init.body)).toEqual({ visibility: "public" });
});

test("deleteFile: DELETE /files/{id} y devuelve void", async () => {
  const fetchMock = vi.fn().mockResolvedValueOnce({
    ok: true,
    status: 204,
    headers: new Headers({ "Content-Type": "application/json" }),
    json: async () => undefined,
  });
  vi.stubGlobal("fetch", fetchMock);

  const { deleteFile } = await import("./uploadFile");
  await expect(deleteFile("f-1")).resolves.toBeUndefined();

  const [path, init] = fetchMock.mock.calls[0];
  expect(path).toBe("/files/f-1");
  expect(init).toMatchObject({ method: "DELETE", credentials: "include" });
});

test("renameFile con nombre inválido (ej: con /) se rechaza en cliente", async () => {
  const fetchMock = vi.fn();
  vi.stubGlobal("fetch", fetchMock);

  const { renameFile } = await import("./uploadFile");
  await expect(renameFile("f-1", "carpeta/archivo.txt")).rejects.toBeInstanceOf(Error);
  expect(fetchMock).not.toHaveBeenCalled();
});

test("errores del servidor llegan como ApiError para PATCH y DELETE", async () => {
  vi.stubGlobal("fetch", vi.fn().mockResolvedValueOnce(problem(404, "file-not-found", "File not found")));

  const { renameFile } = await import("./uploadFile");
  const err = await renameFile("f-notexist", "x.txt").catch((e) => e);
  expect(err).toBeInstanceOf(ApiError);
  expect(err).toMatchObject({ status: 404 });
});
