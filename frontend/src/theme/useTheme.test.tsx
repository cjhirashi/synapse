// RF-006a (SPEC-0009; PLAN-0009 §2.1, P-7): el tema oscuro es el defecto cuando no hay preferencia
// guardada, sin escribir `localStorage`; una preferencia guardada se respeta siempre; y el script
// previo al primer pintado de `index.html` usa el mismo defecto que el hook.
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, expect, test } from "vitest";
import ThemeToggle from "./ThemeToggle";
import { DEFAULT_THEME_MODE } from "./useTheme";

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
  expect(html).toContain(`localStorage.getItem("synapse-theme") || "${DEFAULT_THEME_MODE}"`);
});
