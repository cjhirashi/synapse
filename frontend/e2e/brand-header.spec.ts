// Identidad de marca en Chromium real: cabecera y login (SPEC-0011; PLAN-0011 §5.3).
// Cada prueba lleva en el título su id (B-n) y el RF que cubre (Art. 9). Capturas y medidas van a
// VISUAL_OUT_DIR (/tmp/s11/e2e), fuera del repo, para la aprobación de Carlos (RNF-002).
import { mkdirSync, writeFileSync } from "node:fs";
import { MOBILE, newSession, openWorkspace, SIZES, test, THEMES, type Size, type Theme } from "./fixtures";
import { OUT_DIR } from "./out-dir";

/** Anchos de la verificación: los dos de escritorio del mockup más el móvil. */
const WIDTHS: Size[] = [MOBILE, SIZES[1], SIZES[0]];

/**
 * Alto de `.app-header` ANTES de tocar `AppLayout` (B-0, RF-010), medido sobre el HEAD previo al
 * logo. 1024/1440 miden 71 (70 de contenido + 1 de borde inferior; dentro de 70 ± 1); a 390 px la cabecera se envuelve y su alto es el que fija
 * esta línea base. Clave: `${tema}-${ancho}`.
 */
export const HEADER_BASELINE: Record<string, number> = {
  "dark-390": 112,
  "dark-1024": 71,
  "dark-1440": 71,
  "light-390": 112,
  "light-1024": 71,
  "light-1440": 71,
};

// B-0 · línea base de la cabecera (RF-010)
test("B-0 línea base del alto de la cabecera antes del logo (RF-010)", async ({ browser, seeded }) => {
  const heights: Record<string, number> = {};
  for (const theme of THEMES) {
    for (const size of WIDTHS) {
      const { context, page } = await openWorkspace(browser, seeded, { theme, size });
      heights[`${theme}-${size.width}`] = (await page.locator(".app-header").boundingBox())!.height;
      await context.close();
    }
  }
  mkdirSync(OUT_DIR, { recursive: true });
  writeFileSync(`${OUT_DIR}/header-baseline.json`, JSON.stringify(heights, null, 1));
});
