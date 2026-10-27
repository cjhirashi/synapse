// RF-006a (SPEC-0009; PLAN-0009 §2.1, P-7): el tema oscuro es el defecto cuando no hay preferencia
// guardada, sin escribir `localStorage`; una preferencia guardada se respeta siempre; y el script
// previo al primer pintado de `index.html` usa el mismo defecto que el hook.
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { act, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import ThemeToggle from "./ThemeToggle";
import { token } from "../test-utils/wcag";
import { DEFAULT_THEME_MODE, THEME_COLOR } from "./useTheme";

const STORAGE_KEY = "synapse-theme";

beforeEach(() => {
  localStorage.clear();
  document.documentElement.removeAttribute("data-theme");
});
afterEach(() => localStorage.clear());

test("RF-006a: sin preferencia guardada el tema es oscuro y no se escribe localStorage", () => {
  render(<ThemeToggle />);

  expect(DEFAULT_THEME_MODE).toBe("dark");
  expect(document.documentElement).toHaveAttribute("data-theme", "dark");
  expect(screen.getByRole("button", { name: "Tema oscuro" })).toHaveAttribute("aria-pressed", "true");
  expect(localStorage.getItem(STORAGE_KEY)).toBeNull();
});

test.each([
  ["light", "Tema claro", "light"],
  ["dark", "Tema oscuro", "dark"],
  // matchMedia de jsdom (test-setup) no coincide con "oscuro": "sistema" resuelve a claro.
  ["system", "Tema del sistema", "light"],
] as const)("RF-006a: la preferencia guardada «%s» se respeta", (stored, label, resolved) => {
  localStorage.setItem(STORAGE_KEY, stored);
  render(<ThemeToggle />);

  expect(document.documentElement).toHaveAttribute("data-theme", resolved);
  expect(screen.getByRole("button", { name: label })).toHaveAttribute("aria-pressed", "true");
});

test("RF-006a: elegir un tema lo guarda; un valor guardado inválido cae al defecto", async () => {
  localStorage.setItem(STORAGE_KEY, "morado");
  render(<ThemeToggle />);
  expect(document.documentElement).toHaveAttribute("data-theme", "dark");

  await userEvent.setup().click(screen.getByRole("button", { name: "Tema claro" }));
  expect(localStorage.getItem(STORAGE_KEY)).toBe("light");
  expect(document.documentElement).toHaveAttribute("data-theme", "light");
});

test("RF-006a: el script previo al pintado de index.html usa el mismo defecto que el hook", () => {
  const html = readFileSync(resolve(__dirname, "../../index.html"), "utf8");
  // SPEC-0011 L-1: el defecto ahora es el respaldo de un valor guardado ausente O inválido.
  expect(html).toContain(`localStorage.getItem("synapse-theme")`);
  expect(html).toContain(`? stored : "${DEFAULT_THEME_MODE}"`);
});

// --- theme-color (SPEC-0011 RF-016; PLAN-0011 §2.2, P-10) -------------------------------------

/** `<meta name="theme-color">` del documento de prueba (en producción lo trae index.html). */
const themeColorMeta = () => document.head.querySelector<HTMLMetaElement>('meta[name="theme-color"]')!;

test("RF-016: THEME_COLOR es el --bg-secondary de cada tema en tokens.css", () => {
  expect(THEME_COLOR.dark).toBe(token("dark", "--bg-secondary"));
  expect(THEME_COLOR.light).toBe(token("light", "--bg-secondary"));
});

test("RF-016: el theme-color acompaña al tema resuelto al montar y al cambiarlo con ThemeToggle, sin recargar", async () => {
  document.head.insertAdjacentHTML("beforeend", '<meta name="theme-color" content="#000000">');
  try {
    render(<ThemeToggle />);
    expect(themeColorMeta()).toHaveAttribute("content", "#1a1a24");

    await userEvent.setup().click(screen.getByRole("button", { name: "Tema claro" }));
    expect(document.documentElement).toHaveAttribute("data-theme", "light");
    expect(themeColorMeta()).toHaveAttribute("content", "#f8fafc");

    await userEvent.setup().click(screen.getByRole("button", { name: "Tema oscuro" }));
    expect(themeColorMeta()).toHaveAttribute("content", "#1a1a24");
  } finally {
    themeColorMeta().remove();
  }
});

test("RF-016: en modo «sistema» un cambio de prefers-color-scheme cambia data-theme y el theme-color a la vez", () => {
  document.head.insertAdjacentHTML("beforeend", '<meta name="theme-color" content="#000000">');
  // matchMedia controlable: guarda el oyente que registra el hook para dispararlo a mano.
  let prefersDark = false;
  const listeners = new Set<() => void>();
  const original = window.matchMedia;
  window.matchMedia = ((query: string) => ({
    get matches() {
      return prefersDark;
    },
    media: query,
    addEventListener: (_: string, fn: () => void) => listeners.add(fn),
    removeEventListener: (_: string, fn: () => void) => listeners.delete(fn),
  })) as unknown as typeof window.matchMedia;
  try {
    localStorage.setItem(STORAGE_KEY, "system");
    render(<ThemeToggle />);
    expect(document.documentElement).toHaveAttribute("data-theme", "light");
    expect(themeColorMeta()).toHaveAttribute("content", "#f8fafc");

    prefersDark = true;
    act(() => listeners.forEach((fn) => fn()));
    expect(document.documentElement).toHaveAttribute("data-theme", "dark");
    expect(themeColorMeta()).toHaveAttribute("content", "#1a1a24");
  } finally {
    window.matchMedia = original;
    themeColorMeta().remove();
    vi.restoreAllMocks();
  }
});

test("RF-016: index.html trae el meta estático y su script previo al pintado usa la misma tabla que THEME_COLOR", () => {
  const html = readFileSync(resolve(__dirname, "../../index.html"), "utf8");
  expect(html).toContain(`<meta name="theme-color" content="${THEME_COLOR.dark}"`);
  expect(html).toContain(`dark: "${THEME_COLOR.dark}"`);
  expect(html).toContain(`light: "${THEME_COLOR.light}"`);
});

// L-1 (Converge 1): el script previo al pintado debe tener el mismo respaldo que `readStored`: un valor
// guardado inválido cae al defecto (oscuro) tanto en data-theme como en el theme-color (sin "undefined").
test.each([["morado"], [""], ["undefined"]])("RF-016: el script de index.html con synapse-theme=%j cae al defecto oscuro (data-theme y theme-color)", (stored) => {
  const html = readFileSync(resolve(__dirname, "../../index.html"), "utf8");
  const script = /<script>([\s\S]*?)<\/script>/.exec(html)![1];
  document.head.insertAdjacentHTML("beforeend", '<meta name="theme-color" content="#000000">');
  try {
    localStorage.setItem(STORAGE_KEY, stored);
    new Function(script)();
    expect(document.documentElement).toHaveAttribute("data-theme", DEFAULT_THEME_MODE);
    expect(themeColorMeta()).toHaveAttribute("content", THEME_COLOR[DEFAULT_THEME_MODE as "dark"]);
  } finally {
    themeColorMeta().remove();
  }
});
