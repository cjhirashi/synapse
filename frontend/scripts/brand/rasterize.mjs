// Rasteriza el logo a los PNG de los iconos (SPEC-0011; PLAN-0011 §2.5, P-5, P-9).
// Corre DENTRO del contenedor de Playwright 1.56.0 (`build.sh` lo lanza): Chromium pinta el SVG igual
// que el navegador y no hace falta rsvg/inkscape en la máquina.
//
// Uso: node rasterize.mjs <directorio-con-los-.raw.svg> <directorio-de-salida>
// Salida: PNG sin pérdida (la cuantización y el ICO los hace `pack_icons.py`):
//   ico-16/32/48, any-192, any-512  paleta `neutral`, TRANSPARENTES, silueta a lo ancho del lienzo (P-4)
//   apple-180, maskable-512         paleta `dark`, OPACOS sobre #12121a, logo al 72 % del lado (P-9)
import { readFileSync, mkdirSync } from "node:fs";
import { chromium } from "playwright-core";

const [rawDir, outDir] = process.argv.slice(2);
mkdirSync(outDir, { recursive: true });

// `fraction`: ancho del logo respecto al lado del lienzo. Radio máximo de la silueta = 0,503 × ancho
// del logo → al 72 % ≈ 185 px en 512, dentro de la zona segura maskable (círculo de 80 % = 204,8 px).
const OPAQUE_BACKGROUND = "#12121a"; // --bg-primary oscuro (D-10)
const JOBS = [
  ...[16, 32, 48].map((size) => ({ name: `ico-${size}`, size, svg: "neutral", fraction: 1, background: null })),
  ...[192, 512].map((size) => ({ name: `any-${size}`, size, svg: "neutral", fraction: 1, background: null })),
  { name: "apple-180", size: 180, svg: "dark", fraction: 0.72, background: OPAQUE_BACKGROUND },
  { name: "maskable-512", size: 512, svg: "dark", fraction: 0.72, background: OPAQUE_BACKGROUND },
];

const browser = await chromium.launch();
try {
  for (const job of JOBS) {
    const svg = readFileSync(`${rawDir}/logo-synapse-${job.svg}.raw.svg`).toString("base64");
    const page = await browser.newPage({ viewport: { width: job.size, height: job.size }, deviceScaleFactor: 1 });
    await page.setContent(
      `<body style="margin:0;display:flex;align-items:center;justify-content:center;height:100vh;` +
        `background:${job.background ?? "transparent"}"><img src="data:image/svg+xml;base64,${svg}" ` +
        `style="width:${job.fraction * 100}%;display:block"></body>`,
    );
    await page.waitForFunction(() => document.images[0].complete && document.images[0].naturalWidth > 0);
    // `omitBackground` deja el lienzo transparente cuando el fondo no se pinta.
    await page.screenshot({ path: `${outDir}/${job.name}.png`, omitBackground: job.background === null });
    await page.close();
  }
} finally {
  await browser.close();
}
