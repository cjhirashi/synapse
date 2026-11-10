// H-028: foto de perfil de punta a punta en navegador real: elegir, subir y verla en el riel, la tarjeta de identidad y Perfil;
// recargar, quitar. Necesita un MinIO real (el de la pila de pruebas).
import { deflateSync } from "node:zlib";
import { expect, newSession, shot, test, waitForSynced, waitForVaults } from "./fixtures";

function crc32(buf: Buffer): number {
  let c = ~0;
  for (const byte of buf) {
    c ^= byte;
    for (let k = 0; k < 8; k++) c = (c >>> 1) ^ (0xedb88320 & -(c & 1));
  }
  return ~c >>> 0;
}
function chunk(type: string, data: Buffer): Buffer {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
}
/** PNG RGB sólido de `width`×`height` (sin dependencias). */
function solidPng(width: number, height: number, [r, g, b]: [number, number, number]): Buffer {
  const row = Buffer.concat([Buffer.from([0]), Buffer.from(Array.from({ length: width }, () => [r, g, b]).flat())]);
  const raw = Buffer.concat(Array.from({ length: height }, () => row));
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;
  ihdr[9] = 2;
  return Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), chunk("IHDR", ihdr), chunk("IDAT", deflateSync(raw)), chunk("IEND", Buffer.alloc(0))]);
}

test("H-028: la foto subida se ve en el riel, en la tarjeta de identidad y en Perfil", async ({ browser, buzon: seeded }) => {
  const context = await newSession(browser, seeded, { theme: "dark", size: { width: 1280, height: 900 } });
  const page = await context.newPage();
  await page.goto(`/vaults/${seeded.vaults[0].id}`);
  await waitForVaults(page, seeded.vaults.length);
  await waitForSynced(page);

  const rail = page.getByRole("navigation", { name: "Bóvedas abiertas" });
  await rail.getByRole("link", { name: /^Usuario:/ }).click();
  await expect(page).toHaveURL(/\/settings\/profile$/);
  await expect(rail.locator(".vault-rail-avatar")).toHaveCount(0);

  // Un solo paso: elegir un archivo apaisado (1200x800) lo recorta, lo sube y lo muestra en todos los sitios.
  await page.locator("input[type='file']").setInputFiles({ name: "foto.png", mimeType: "image/png", buffer: solidPng(1200, 800, [220, 60, 90]) });
  await expect(page.getByRole("button", { name: "Quitar foto" })).toBeVisible({ timeout: 15_000 });
  await expect(rail.locator(".vault-rail-avatar")).toHaveCount(1, { timeout: 15_000 });
  await expect(page.locator(".settings-header img.settings-avatar")).toHaveCount(1);
  await expect(page.locator(".profile-page img.settings-avatar")).toHaveCount(1);
  for (const sel of [".vault-rail-avatar", ".settings-header img.settings-avatar", ".profile-page img.settings-avatar"]) {
    const loaded = await page.locator(sel).first().evaluate((img: HTMLImageElement) => img.complete && img.naturalWidth > 0);
    expect(loaded, `${sel} cargó la imagen`).toBe(true);
  }
  // Se guardó recortada a cuadrado y reducida a 512 px.
  const dims = await page.locator(".settings-header img.settings-avatar").first().evaluate((img: HTMLImageElement) => [img.naturalWidth, img.naturalHeight]);
  expect(dims).toEqual([512, 512]);
  await shot(page, "h028-foto-2-subida");

  // Persiste tras recargar.
  await page.reload();
  await expect(page.locator(".settings-header img.settings-avatar")).toHaveCount(1, { timeout: 15_000 });
  await expect(page.locator(".settings-header img.settings-avatar").first().evaluate((img: HTMLImageElement) => img.naturalWidth)).resolves.toBeGreaterThan(0);

  // Quitar vuelve a las iniciales.
  await page.getByRole("button", { name: "Quitar foto" }).click();
  await expect(page.locator(".settings-header img.settings-avatar")).toHaveCount(0, { timeout: 15_000 });
  await expect(rail.locator(".vault-rail-avatar")).toHaveCount(0);
  await context.close();
});
