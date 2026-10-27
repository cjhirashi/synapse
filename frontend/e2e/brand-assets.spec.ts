// Iconos y archivos de marca servidos por el backend real, medidos en Chromium (SPEC-0011;
// PLAN-0011 §5.3: A-1…A-4). Los PNG se decodifican en el navegador (`decodePng`) tal como los ve un
// cliente. Cada prueba lleva su RF en el título (Art. 9). Capturas y medidas en VISUAL_OUT_DIR.
import { decodePng, expectAtLeast } from "./brand-support";
import { expect, test } from "./fixtures";

/** --bg-primary oscuro (D-10): el fondo opaco de apple-touch y maskable. */
const BG = [0x12, 0x12, 0x1a] as const;

// A-2 · apple-touch (180) y maskable (512): opacos y con la silueta dentro de la zona segura (RF-003, RF-006)
for (const { path, side } of [
  { path: "/apple-touch-icon.png", side: 180 },
  { path: "/icons/icon-maskable-512.png", side: 512 },
]) {
  test(`A-2 ${path}: ${side}×${side}, todos los píxeles opacos y silueta dentro del círculo del 80 % (RF-003, RF-006)`, async ({ browser, request }) => {
    const res = await request.get(path);
    expect(res.status()).toBe(200);
    const page = await browser.newPage();
    const px = await decodePng(page, Buffer.from(await res.body()));
    await page.close();
    expect([px.w, px.h]).toEqual([side, side]);

    let transparent = 0;
    let maxRadius = 0;
    for (let y = 0; y < px.h; y++) {
      for (let x = 0; x < px.w; x++) {
        const i = (y * px.w + x) * 4;
        if (px.data[i + 3] !== 255) transparent++;
        const diff = Math.abs(px.data[i] - BG[0]) + Math.abs(px.data[i + 1] - BG[1]) + Math.abs(px.data[i + 2] - BG[2]);
        if (diff > 12) maxRadius = Math.max(maxRadius, Math.hypot(x + 0.5 - side / 2, y + 0.5 - side / 2));
      }
    }
    expect(transparent, "píxeles con alfa < 255").toBe(0);
    // Zona segura de RF-006: círculo de diámetro 80 % del lado = radio 0,4·lado.
    expect(maxRadius, `radio máximo ${maxRadius.toFixed(1)} px`).toBeLessThanOrEqual(0.4 * side);
    expectAtLeast(`RF-006 holgura ${side}`, "margen entre la silueta y el borde de la zona segura (px)", 0.4 * side - maxRadius, 0);
  });
}

// A-4 · cada archivo de marca contra el backend real: 200 y tipo MIME (RF-001…RF-005)
const FILES: Record<string, string> = {
  "/favicon.svg": "image/svg+xml",
  "/favicon.ico": "image/vnd.microsoft.icon",
  "/apple-touch-icon.png": "image/png",
  "/icons/icon-192.png": "image/png",
  "/icons/icon-512.png": "image/png",
  "/icons/icon-maskable-512.png": "image/png",
  "/logo-synapse-dark.svg": "image/svg+xml",
  "/logo-synapse-light.svg": "image/svg+xml",
  "/manifest.webmanifest": "application/manifest+json",
};
for (const [path, type] of Object.entries(FILES)) {
  test(`A-4 ${path} responde 200 con ${type} (RF-001…RF-005)`, async ({ request }) => {
    const res = await request.get(path);
    expect(res.status()).toBe(200);
    expect(res.headers()["content-type"].split(";")[0]).toBe(type);
  });
}
