import { afterEach, expect, test, vi } from "vitest";
import { AVATAR_SIDE, squareAvatar } from "./avatarImage";

afterEach(() => vi.unstubAllGlobals());

test("sin createImageBitmap devuelve el archivo original", async () => {
  vi.stubGlobal("createImageBitmap", undefined);
  const file = new File(["x"], "a.png", { type: "image/png" });
  expect(await squareAvatar(file)).toBe(file);
});

test("si la imagen no se puede decodificar devuelve el original", async () => {
  vi.stubGlobal("createImageBitmap", vi.fn().mockRejectedValue(new Error("no decodifica")));
  const file = new File(["x"], "a.png", { type: "image/png" });
  expect(await squareAvatar(file)).toBe(file);
});

test("recorta al centro un cuadrado y reduce a AVATAR_SIDE en WebP", async () => {
  const bitmap = { width: 4000, height: 3000, close: vi.fn() };
  vi.stubGlobal("createImageBitmap", vi.fn().mockResolvedValue(bitmap));
  const drawImage = vi.fn();
  const canvas = {
    width: 0,
    height: 0,
    getContext: () => ({ drawImage, imageSmoothingQuality: "low" }),
    toBlob: (cb: (b: Blob | null) => void, type: string) => cb(new Blob(["w"], { type })),
  };
  vi.spyOn(document, "createElement").mockReturnValue(canvas as unknown as HTMLElement);

  const out = await squareAvatar(new File(["x"], "a.jpg", { type: "image/jpeg" }));

  expect(out.type).toBe("image/webp");
  expect(canvas.width).toBe(AVATAR_SIDE);
  // 3000 px de lado, centrado en horizontal: (4000 - 3000) / 2 = 500
  expect(drawImage).toHaveBeenCalledWith(bitmap, 500, 0, 3000, 3000, 0, 0, AVATAR_SIDE, AVATAR_SIDE);
  expect(bitmap.close).toHaveBeenCalled();
});

test("si el navegador no codifica WebP cae a JPEG", async () => {
  vi.stubGlobal("createImageBitmap", vi.fn().mockResolvedValue({ width: 100, height: 100, close: vi.fn() }));
  const canvas = {
    getContext: () => ({ drawImage: vi.fn() }),
    toBlob: (cb: (b: Blob | null) => void, type: string) => cb(type === "image/webp" ? new Blob(["p"], { type: "image/png" }) : new Blob(["j"], { type })),
  };
  vi.spyOn(document, "createElement").mockReturnValue(canvas as unknown as HTMLElement);
  expect((await squareAvatar(new File(["x"], "a.png", { type: "image/png" }))).type).toBe("image/jpeg");
});
