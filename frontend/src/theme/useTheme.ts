import { useEffect, useState } from "react";

export type ThemeMode = "light" | "system" | "dark";

const STORAGE_KEY = "synapse-theme";
const THEME_ORDER: ThemeMode[] = ["light", "system", "dark"];

function resolve(mode: ThemeMode): "light" | "dark" {
  if (mode !== "system") return mode;
  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

function readStored(): ThemeMode {
  const stored = localStorage.getItem(STORAGE_KEY);
  return stored === "light" || stored === "dark" || stored === "system" ? stored : "system";
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
    document.documentElement.setAttribute("data-theme", resolve(mode));
  }, [mode]);

  useEffect(() => {
    if (mode !== "system") return;
    const media = window.matchMedia("(prefers-color-scheme: dark)");
    const onChange = () => document.documentElement.setAttribute("data-theme", resolve("system"));
    media.addEventListener("change", onChange);
    return () => media.removeEventListener("change", onChange);
  }, [mode]);

  function setMode(next: ThemeMode) {
    localStorage.setItem(STORAGE_KEY, next);
    setModeState(next);
  }

  return { mode, setMode, order: THEME_ORDER };
}
