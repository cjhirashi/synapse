// Datos y utilidades de la verificación visual (SPEC-0009 RF-006; PLAN-0009 §5.2, §5.3).
//
// - Siembra por la API REST (usuario, bóvedas) y por la UI (árbol de notas: 2 niveles de carpetas,
//   4 notas con contenido, un nombre de 120 caracteres), una vez por *worker*.
// - `icon` ya lo acepta el servidor (bloque E): las bóvedas se siembran con él por la API REST.
// - `measure` devuelve caja y estilos computados; `tokens` lee `src/styles/tokens.css` para que las
//   comparaciones de color no dependan de una copia de los valores.
import { readFileSync, existsSync, mkdirSync, writeFileSync } from "node:fs";
import { expect, test as base, type Browser, type BrowserContext, type Page } from "@playwright/test";
import { OUT_DIR } from "./out-dir";

export const THEMES = ["dark", "light"] as const;
export type Theme = (typeof THEMES)[number];

/** Mismos tamaños que las capturas del mockup (PLAN-0009 §5.3) y el de humo móvil. */
export const SIZES = [
  { width: 1440, height: 900 },
  { width: 1024, height: 768 },
] as const;
export const MOBILE = { width: 390, height: 844 } as const;
export type Size = { width: number; height: number };

/** Ícono simulado de cada bóveda sembrada (gramática de `contracts/vault-icon.schema.json`). */
export interface SeedVault {
  id: string;
  name: string;
  icon: string | null;
}

export interface Seeded {
  email: string;
  password: string;
  vaults: SeedVault[];
  /** Nombre de 120 caracteres de la nota larga (RF-010). */
  longNoteName: string;
}

export const VAULT_SEEDS: Array<{ name: string; icon: string | null }> = [
  { name: "Investigación de mercado", icon: "folder-heart:accent" },
  { name: "Diario personal", icon: "initials:success" },
  { name: "Archivo", icon: null },
];

export const LONG_NOTE_NAME = `Nota con un nombre excesivamente largo ${"para comprobar la elipsis ".repeat(8)}`.slice(0, 120).trimEnd();

/** Notas del árbol sembrado: ruta (con `/` = carpetas) y contenido markdown. */
const PARAGRAPH =
  "Este párrafo es lo bastante largo para ocupar varias líneas dentro de la columna de lectura y así " +
  "poder medir su tipografía y su interlineado en un navegador real, igual que en el mockup del editor.";
export const NOTE_SEEDS: Array<{ title: string; content: string }> = [
  { title: "Guías/Diseño/Sistema de tokens", content: `# Sistema de tokens\n\n${PARAGRAPH}\n\n${PARAGRAPH}` },
  { title: "Guías/Diseño/Tipografía", content: `# Tipografía\n\n${PARAGRAPH}` },
  { title: "Guías/Notas rápidas", content: `# Notas rápidas\n\n${PARAGRAPH}` },
  { title: "Bienvenida", content: `# Bienvenida\n\n${PARAGRAPH}` },
  { title: LONG_NOTE_NAME, content: `# ${LONG_NOTE_NAME}\n\n${PARAGRAPH}` },
];

// --- API REST -------------------------------------------------------------------------------

const base_url = () => process.env.BASE_URL ?? "http://127.0.0.1:8010";

async function api(path: string, init: { method?: string; body?: unknown; cookie?: string } = {}): Promise<Response> {
  const res = await fetch(base_url() + path, {
    method: init.method ?? "GET",
    headers: { "Content-Type": "application/json", ...(init.cookie ? { Cookie: init.cookie } : {}) },
    body: init.body === undefined ? undefined : JSON.stringify(init.body),
  });
  if (!res.ok) throw new Error(`${init.method ?? "GET"} ${path} → ${res.status}: ${await res.text()}`);
  return res;
}

/** Cookies de una respuesta de login como cabecera `Cookie` (todas las que fija). */
function cookieHeader(res: Response): string {
  return res.headers
    .getSetCookie()
    .map((line) => line.split(";")[0])
    .join("; ");
}

let userCounter = 0;

/** Usuario nuevo (lo crea el admin y hace el cambio de contraseña forzado, RF-002 de 0002). */
export async function createUser(): Promise<{ email: string; password: string; cookie: string }> {
  const admin = cookieHeader(
    await api("/auth/login", { method: "POST", body: { email: process.env.ADMIN_EMAIL, password: process.env.E2E_ADMIN_PASSWORD } }),
  );
  userCounter += 1;
  const email = `visual-${Date.now()}-${userCounter}@example.com`;
  const temporary = "temporal-1234";
  await api("/admin/users", { method: "POST", body: { email, password: temporary }, cookie: admin });
  const first = cookieHeader(await api("/auth/login", { method: "POST", body: { email, password: temporary } }));
  const password = "definitiva-1234";
  await api("/auth/change-password", { method: "POST", body: { current_password: temporary, new_password: password }, cookie: first });
  const cookie = cookieHeader(await api("/auth/login", { method: "POST", body: { email, password } }));
  return { email, password, cookie };
}

/** Crea una bóveda por la API REST y devuelve su id. */
export async function createVault(cookie: string, name: string, icon: string | null = null): Promise<string> {
  const res = await api("/vaults", { method: "POST", body: { name, icon }, cookie });
  return ((await res.json()) as { id: string }).id;
}

// --- Sesión y contexto de navegador ---------------------------------------------------------

export interface OpenOptions {
  theme?: Theme | null;
  size?: Size;
  /** Preferencia del sistema del navegador (lo que resolvería el modo "sistema"). */
  colorScheme?: "light" | "dark";
}

/**
 * Contexto nuevo con la sesión del usuario ya iniciada (cookies por la API) y, si se pide, el tema
 * guardado. `theme: null` deja `localStorage` vacío (V-8).
 */
export async function newSession(browser: Browser, user: { email: string; password: string }, options: OpenOptions = {}): Promise<BrowserContext> {
  const { theme = "dark", size = SIZES[0], colorScheme } = options;
  // `reducedMotion` aquí y no sólo en la config: `browser.newContext` no hereda `use.contextOptions`, y sin él las
  // transiciones de fondo (120 ms en los botones) hacen que una medida justo tras un cambio lea el color a medias.
  const context = await browser.newContext({ baseURL: base_url(), viewport: size, colorScheme, reducedMotion: "reduce" });
  if (theme !== null) await context.addInitScript((mode) => localStorage.setItem("synapse-theme", mode), theme);
  const login = await context.request.post("/auth/login", { data: { email: user.email, password: user.password } });
  if (!login.ok()) throw new Error(`login → ${login.status()}`);
  return context;
}

/** Espera a que el riel muestre las `count` bóvedas (la réplica ya trajo los datos del servidor). */
export async function waitForVaults(page: Page, count: number): Promise<void> {
  await expect(page.getByRole("navigation", { name: "Bóvedas abiertas" }).getByRole("link")).toHaveCount(count);
}

/** Espera a que la sincronización no tenga cambios pendientes. */
export async function waitForSynced(page: Page): Promise<void> {
  await expect(page.getByRole("region", { name: "Sincronización" }).getByRole("status")).toHaveText(/^Sincronizado/);
}

/** Abre `/vaults/{id}` y espera al árbol de notas (o al aviso de bóveda vacía). */
export async function openVault(page: Page, vaultId: string): Promise<void> {
  await page.goto(`/vaults/${vaultId}`);
  await expect(page.getByRole("complementary", { name: "Notas de la bóveda" })).toBeVisible();
}

// --- Siembra (una vez por worker) -----------------------------------------------------------

/** Crea una nota por la UI y escribe su contenido en la vista de código. */
async function createNote(page: Page, title: string, content: string): Promise<void> {
  await page.getByLabel("Título de la nota nueva (opcional)").fill(title);
  await page.getByRole("button", { name: "Nueva nota" }).click();
  await page.getByRole("button", { name: "Código" }).click();
  await page.locator(".cm-content").click();
  await page.keyboard.insertText(content);
  await page.getByRole("button", { name: "Guardar" }).click();
  await expect(page.getByRole("button", { name: "Guardar" })).toBeDisabled();
}

/** ~4 KiB de contenido por nota: el árbol no debe cargarlo (`list` lo omite). */
const FILLER = "lorem ipsum dolor sit amet ".repeat(150);

/**
 * `count` notas de una bóveda con la misma distribución que `tree.perf.test.tsx` (100 en la raíz, el resto en
 * carpetas de hasta 3 niveles), escritas directamente en la base CouchDB del usuario (admin de pruebas): la
 * réplica del navegador las trae por el pull, como si otro dispositivo las hubiera creado. Devuelve cuántos
 * elementos tiene el primer nivel del árbol (carpetas + notas de la raíz).
 */
export async function seedNotesBulk(userCookie: string, vaultId: string, count: number): Promise<number> {
  const me = (await (await api("/auth/me", { cookie: userCookie })).json()) as { user_id: string };
  const stamp = "2026-10-12T09:00:00.000Z";
  const paths = Array.from({ length: count }, (_, i) => {
    const folder = i % 10 === 0 ? "" : `carpeta-${i % 40}/${i % 3 === 0 ? `sub-${i % 7}/` : ""}${i % 5 === 0 ? "hondo/" : ""}`;
    return `${folder}nota-${i}.md`;
  });
  const docs = paths.map((path) => ({
    _id: `note:${vaultId}:${crypto.randomUUID()}`,
    type: "note",
    vault_id: vaultId,
    path,
    frontmatter: {},
    content: FILLER,
    created_at: stamp,
    updated_at: stamp,
    deleted_at: null,
  }));
  const couch = process.env.COUCHDB_URL ?? "http://localhost:15984";
  const auth = `Basic ${Buffer.from(`${process.env.COUCHDB_USER ?? "admin"}:${process.env.COUCHDB_PASSWORD ?? "testpass"}`).toString("base64")}`;
  const res = await fetch(`${couch}/synapse_user_${me.user_id}/_bulk_docs`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: auth },
    body: JSON.stringify({ docs }),
  });
  if (!res.ok) throw new Error(`_bulk_docs → ${res.status}: ${await res.text()}`);
  const top = new Set(paths.map((path) => (path.includes("/") ? path.split("/")[0] : path)));
  return top.size;
}

/** Usuario con 3 bóvedas (REST) y el árbol de notas en la primera (UI), sincronizado al servidor. */
export async function seed(browser: Browser): Promise<Seeded> {
  const user = await createUser();
  const vaults: SeedVault[] = [];
  for (const spec of VAULT_SEEDS) vaults.push({ id: await createVault(user.cookie, spec.name, spec.icon), ...spec });

  const context = await newSession(browser, user);
  const page = await context.newPage();
  await openVault(page, vaults[0].id);
  for (const note of NOTE_SEEDS) await createNote(page, note.title, note.content);
  await waitForSynced(page);
  await context.close();
  return { email: user.email, password: user.password, vaults, longNoteName: LONG_NOTE_NAME };
}

/** Cantidad de bóvedas del usuario "lleno" que desborda el riel (V-6). */
export const CROWDED_VAULTS = 40;

/** Usuario con 40 bóvedas (REST) para comprobar el scroll propio del riel. */
export async function seedCrowded(): Promise<Seeded> {
  const user = await createUser();
  const vaults: SeedVault[] = [];
  for (let n = 1; n <= CROWDED_VAULTS; n++) {
    const name = `Bóveda ${String(n).padStart(2, "0")}`;
    vaults.push({ id: await createVault(user.cookie, name), name, icon: null });
  }
  return { email: user.email, password: user.password, vaults, longNoteName: LONG_NOTE_NAME };
}

/**
 * Sesión del usuario sembrado con la bóveda `vaultIndex` abierta, sincronizada y sin rechazos del push
 * (con `icon` real en el servidor no debe haber ninguno). El llamador cierra el `context`.
 */
export async function openWorkspace(
  browser: Browser,
  seeded: Seeded,
  options: OpenOptions & { vaultIndex?: number } = {},
): Promise<{ context: BrowserContext; page: Page }> {
  const { vaultIndex = 0, ...session } = options;
  const context = await newSession(browser, seeded, session);
  const page = await context.newPage();
  await openVault(page, seeded.vaults[vaultIndex].id);
  await waitForVaults(page, seeded.vaults.length);
  await waitForSynced(page);
  // Los íconos viajan por el servidor: ningún cambio rechazado puede asomar en la barra de sincronización.
  await expect(page.getByText(/cambios? rechazados?/), "sin rechazos del push").toHaveCount(0);
  return { context, page };
}

/**
 * Abre una nota del árbol con el teclado (foco + Enter). El clic de ratón se prueba aparte en V-3:
 * aquí sólo importa qué muestra el editor, no cómo se llegó a él.
 */
export async function openNote(page: Page, name: string): Promise<void> {
  const row = page.getByRole("tree", { name: "Notas" }).getByRole("treeitem", { name });
  await row.focus();
  await page.keyboard.press("Enter");
  await expect(row).toHaveAttribute("aria-selected", "true");
}

// --- Medición -------------------------------------------------------------------------------

export interface Measure {
  x: number;
  y: number;
  w: number;
  h: number;
  bg: string;
  color: string;
  borderColor: string;
  borderTopColor: string;
  borderBottomColor: string;
  borderRightColor: string;
  radius: string;
  fontSize: string;
  lineHeight: string;
  paddingLeft: string;
  scrollWidth: number;
  clientWidth: number;
  scrollHeight: number;
  clientHeight: number;
}

/** Caja y estilos computados del primer elemento que casa con `selector`. */
export async function measure(page: Page, selector: string): Promise<Measure> {
  return page.locator(selector).first().evaluate((el) => {
    const r = el.getBoundingClientRect();
    const c = getComputedStyle(el);
    return {
      x: r.x,
      y: r.y,
      w: r.width,
      h: r.height,
      bg: c.backgroundColor,
      color: c.color,
      borderColor: c.borderColor,
      borderTopColor: c.borderTopColor,
      borderBottomColor: c.borderBottomColor,
      borderRightColor: c.borderRightColor,
      radius: c.borderRadius,
      fontSize: c.fontSize,
      lineHeight: c.lineHeight,
      paddingLeft: c.paddingLeft,
      scrollWidth: el.scrollWidth,
      clientWidth: el.clientWidth,
      scrollHeight: el.scrollHeight,
      clientHeight: el.clientHeight,
    };
  });
}

// --- Tokens (leídos de tokens.css) ----------------------------------------------------------

/** Color de CSS como lo devuelve `getComputedStyle`: `rgb(r, g, b)` o `rgba(r, g, b, a)`. */
function normalizeColor(value: string): string {
  const hex = value.trim().match(/^#([0-9a-f]{6})$/i);
  if (hex) {
    const n = parseInt(hex[1], 16);
    return `rgb(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255})`;
  }
  const rgba = value.trim().match(/^rgba\(\s*(\d+),\s*(\d+),\s*(\d+),\s*([\d.]+)\s*\)$/);
  if (rgba) return `rgba(${rgba[1]}, ${rgba[2]}, ${rgba[3]}, ${Number(rgba[4])})`;
  return value.trim();
}

/** Declaraciones `--nombre: valor;` de un bloque de `tokens.css`, por su selector. */
function block(css: string, selector: string): Record<string, string> {
  const start = css.indexOf(selector);
  if (start < 0) throw new Error(`tokens.css: sin el bloque ${selector}`);
  const body = css.slice(css.indexOf("{", start) + 1, css.indexOf("}", start));
  return Object.fromEntries([...body.matchAll(/(--[\w-]+):\s*([^;]+);/g)].map((m) => [m[1], m[2].trim()]));
}

export function tokens(theme: Theme): Record<string, string> {
  const css = readFileSync("src/styles/tokens.css", "utf8");
  return { ...block(css, ":root {"), ...block(css, `:root[data-theme="${theme}"]`) };
}

/** Valor de un token de color ya normalizado (`bg("dark", "--bg-secondary")`). */
export function tokenColor(theme: Theme, name: string): string {
  return normalizeColor(tokens(theme)[name]);
}

/** Todos los colores de tokens del tema, normalizados (más transparente y `currentcolor`). */
export function themeColors(theme: Theme): Set<string> {
  const colors = Object.values(tokens(theme))
    .filter((value) => /^(#|rgba?\()/.test(value))
    .map(normalizeColor);
  return new Set([...colors, "rgba(0, 0, 0, 0)"]);
}

// --- Salidas --------------------------------------------------------------------------------

export function shot(
  page: Page,
  name: string,
  options: { selector?: string; clip?: { x: number; y: number; width: number; height: number } } = {},
): Promise<Buffer> {
  mkdirSync(OUT_DIR, { recursive: true });
  const path = `${OUT_DIR}/${name}.png`;
  return options.selector ? page.locator(options.selector).first().screenshot({ path }) : page.screenshot({ path, clip: options.clip });
}

const MEASUREMENTS = `${OUT_DIR}/measurements.json`;

/**
 * Comprueba una medida R-n de PLAN-0009 §5.4 (`got` frente a `target` ± `tolerance`) y la deja en
 * `measurements.json` (fuera del repo) para la tabla de la revisión visual.
 */
function record(key: string, entry: { label: string; got: number | string; target: number | string; tolerance: number; ok: boolean }): void {
  mkdirSync(OUT_DIR, { recursive: true });
  const all: Record<string, unknown> = existsSync(MEASUREMENTS) ? JSON.parse(readFileSync(MEASUREMENTS, "utf8")) : {};
  all[key] = entry;
  writeFileSync(MEASUREMENTS, JSON.stringify(all, null, 1));
}

export function expectMeasure(key: string, label: string, got: number, target: number, tolerance: number): void {
  record(key, { label, got, target, tolerance, ok: Math.abs(got - target) <= tolerance });
  expect(Math.abs(got - target), `${key} ${label}: medido ${got}, objetivo ${target} ± ${tolerance}`).toBeLessThanOrEqual(tolerance);
}

/** Igual que `expectMeasure` para medidas exactas que no son números (colores de tokens, tipografía). */
export function expectExact(key: string, label: string, got: string, target: string): void {
  record(key, { label, got, target, tolerance: 0, ok: got === target });
  expect(got, `${key} ${label}`).toBe(target);
}

// --- Fixture de Playwright ------------------------------------------------------------------

export const test = base.extend<object, { seeded: Seeded; crowded: Seeded }>({
  crowded: [
    async ({}, use) => {
      await use(await seedCrowded());
    },
    { scope: "worker" },
  ],
  seeded: [
    async ({ browser }, use) => {
      await use(await seed(browser));
    },
    { scope: "worker" },
  ],
});

export { expect };
