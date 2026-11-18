// H-059: ayudas comunes de las capturas del Manual de Operación (ver GUION.md). Cada captura puede llevar marcadores numerados
// (círculo rojo con borde blanco y recuadro) sobre los elementos que cita el texto del manual, y se enmascara el correo real del usuario.
import { mkdirSync } from "node:fs";
import type { Locator, Page } from "@playwright/test";
import { OUT_DIR } from "../out-dir";

export const MANUAL_DIR = `${OUT_DIR}/manual`;
export const DESKTOP = { width: 1280, height: 800 } as const;
export const PHONE = { width: 390, height: 844 } as const;
export const MASKED_EMAIL = "ana@cafeaurora.mx";

export interface Mark {
  /** Elemento que se señala. */
  target: Locator;
  /** Número que se dibuja (el texto del manual lo cita como ①, ②…). */
  n: number;
  /** Corrimiento del círculo respecto a la esquina superior izquierda del elemento (por omisión, algo afuera). */
  dx?: number;
  dy?: number;
  /** Sin recuadro alrededor (solo el círculo). */
  noBox?: boolean;
}

export interface CaptureOptions {
  marks?: Mark[];
  /** Recorte en píxeles de la ventana; por omisión, la ventana completa. */
  clip?: { x: number; y: number; width: number; height: number };
  /** Recorta al rectángulo de este elemento (con `pad` píxeles de margen). */
  around?: Locator;
  pad?: number;
}

/** Cambia el correo real del usuario por uno de ejemplo en textos, valores de campos y atributos visibles. */
export async function maskIdentity(page: Page, realEmail: string): Promise<void> {
  await page.evaluate(([real, fake]) => {
    const swap = (s: string) => s.split(real).join(fake);
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    for (let node = walker.nextNode(); node; node = walker.nextNode()) if (node.nodeValue?.includes(real)) node.nodeValue = swap(node.nodeValue);
    document.querySelectorAll<HTMLElement>("*").forEach((el) => {
      for (const attr of ["aria-label", "title", "placeholder"]) {
        const v = el.getAttribute(attr);
        if (v?.includes(real)) el.setAttribute(attr, swap(v));
      }
    });
    document.querySelectorAll<HTMLInputElement>("input").forEach((el) => {
      if (el.value.includes(real)) el.value = swap(el.value);
    });
  }, [realEmail, MASKED_EMAIL]);
}

async function drawMarks(page: Page, marks: Mark[]): Promise<void> {
  const boxes = [];
  for (const m of marks) {
    await m.target.first().scrollIntoViewIfNeeded().catch(() => undefined);
    const box = await m.target.first().boundingBox();
    if (!box) throw new Error(`marcador ${m.n}: el elemento no está visible`);
    boxes.push({ n: m.n, box, dx: m.dx ?? -8, dy: m.dy ?? -8, noBox: m.noBox ?? false });
  }
  await page.evaluate((items) => {
    for (const { n, box, dx, dy, noBox } of items) {
      if (!noBox) {
        const frame = document.createElement("div");
        frame.setAttribute("data-manual-mark", "");
        frame.style.cssText = `position:fixed;z-index:2147483646;pointer-events:none;left:${box.x - 3}px;top:${box.y - 3}px;width:${box.width + 6}px;height:${box.height + 6}px;border:2px solid #dc2626;border-radius:8px;box-sizing:border-box`;
        (document.querySelector(".image-viewer") ?? document.body).appendChild(frame);
      }
      const dot = document.createElement("div");
      dot.setAttribute("data-manual-mark", "");
      const left = Math.max(2, Math.min(window.innerWidth - 30, box.x + dx));
      const top = Math.max(2, Math.min(window.innerHeight - 30, box.y + dy));
      dot.textContent = String(n);
      dot.style.cssText = `position:fixed;z-index:2147483647;pointer-events:none;left:${left}px;top:${top}px;width:28px;height:28px;border-radius:50%;background:#dc2626;color:#fff;border:2px solid #fff;box-shadow:0 1px 4px rgba(0,0,0,.45);font:700 15px/24px Inter,system-ui,sans-serif;text-align:center`;
      (document.querySelector(".image-viewer") ?? document.body).appendChild(dot);
    }
  }, boxes);
}

async function clearMarks(page: Page): Promise<void> {
  await page.evaluate(() => document.querySelectorAll("[data-manual-mark]").forEach((el) => el.remove()));
}

/**
 * Captura `MAN-<id>.png` en `MANUAL_DIR`: espera a que la pantalla se asiente, enmascara el correo, dibuja los marcadores,
 * fotografía y los quita. Devuelve la ruta del archivo.
 */
export function makeCapture(realEmail: string) {
  mkdirSync(MANUAL_DIR, { recursive: true });
  return async function capture(page: Page, id: string, options: CaptureOptions = {}): Promise<string> {
    const path = `${MANUAL_DIR}/MAN-${id}.png`;
    await page.waitForTimeout(500);
    await maskIdentity(page, realEmail);
    if (options.marks?.length) await drawMarks(page, options.marks);
    let clip = options.clip;
    if (options.around) {
      const box = await options.around.first().boundingBox();
      if (!box) throw new Error(`captura ${id}: el elemento a recortar no está visible`);
      const pad = options.pad ?? 16;
      const view = page.viewportSize()!;
      const x = Math.max(0, box.x - pad);
      const y = Math.max(0, box.y - pad);
      clip = { x, y, width: Math.min(view.width - x, box.width + pad * 2), height: Math.min(view.height - y, box.height + pad * 2) };
    }
    await page.screenshot({ path, clip, animations: "disabled", caret: "hide" });
    await clearMarks(page);
    return path;
  };
}
