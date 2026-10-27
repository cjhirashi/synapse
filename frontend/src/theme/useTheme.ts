import { useEffect, useState } from "react";

export type ThemeMode = "light" | "system" | "dark";

const STORAGE_KEY = "synapse-theme";
/**
 * Modo con el que arranca quien aún no eligió uno (SPEC-0009 RF-006a). Es sólo el valor que se
 * lee: no se guarda en `localStorage`, así "sin preferencia" sigue siendo distinguible. El script
 * previo al pintado de `index.html` repite este valor; `useTheme.test.tsx` vigila que coincidan.
 */
export const DEFAULT_THEME_MODE: ThemeMode = "dark";
/**
 * `--bg-secondary` de cada tema: el color de la cabecera, que el chrome del navegador continúa
 * (`<meta name="theme-color">`, SPEC-0011 RF-016, D-10). El script previo al pintado de `index.html`
 * repite esta tabla; `useTheme.test.tsx` vigila que ambas coincidan con `tokens.css`.
 */
export const THEME_COLOR: Record<"light" | "dark", string> = { dark: "#1a1a24", light: "#f8fafc" };
const THEME_ORDER: ThemeMode[] = ["light", "system", "dark"];

function resolve(mode: ThemeMode): "light" | "dark" {
  if (mode !== "system") return mode;
  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

/**
 * Aplica el tema ya resuelto: `data-theme` en `<html>` y el `theme-color` del navegador. Es el ÚNICO
 * punto que escribe ambos (lo usan el efecto de `mode` y el oyente de «sistema»), así el color del
 * chrome nunca se desincroniza del tema (RF-016); sin el `<meta>` (pruebas sin index.html) no hace nada.
 */
export function applyResolvedTheme(resolved: "light" | "dark"): void {
  document.documentElement.setAttribute("data-theme", resolved);
  document.querySelector('meta[name="theme-color"]')?.setAttribute("content", THEME_COLOR[resolved]);
}

function readStored(): ThemeMode {
  const stored = localStorage.getItem(STORAGE_KEY);
  return stored === "light" || stored === "dark" || stored === "system" ? stored : DEFAULT_THEME_MODE;
}

/**
 * Control de tema claro/sistema/oscuro (1.1.4.1 - Sistema de Diseño). El modo elegido se
 * guarda en `localStorage` (persistencia por cuenta real queda para una feature aparte,
 * nota del propio doc de diseño) y "sistema" sigue reaccionando a cambios del SO en vivo
 * mientras la pestaña está abierta.
 */
export function useTheme() {
  const [mode, setModeState] = useState<ThemeMode>(readStored);

  useEffect(() => {
    applyResolvedTheme(resolve(mode));
  }, [mode]);

  useEffect(() => {
    if (mode !== "system") return;
    const media = window.matchMedia("(prefers-color-scheme: dark)");
    const onChange = () => applyResolvedTheme(resolve("system"));
    media.addEventListener("change", onChange);
    return () => media.removeEventListener("change", onChange);
  }, [mode]);

  function setMode(next: ThemeMode) {
    localStorage.setItem(STORAGE_KEY, next);
    setModeState(next);
  }

  return { mode, setMode, order: THEME_ORDER };
}
