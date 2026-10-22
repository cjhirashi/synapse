import "@testing-library/jest-dom/vitest";

// jsdom no implementa matchMedia (gap conocido, no un bug de la app) - lo necesita
// useTheme (1.1.4.1 - Sistema de Diseño) para resolver el modo "sistema". Sin esto cada
// prueba que monta cualquier página con <ThemeToggle> (prácticamente todas las privadas,
// vía AppLayout) truena al montar.
if (typeof window.matchMedia !== "function") {
  window.matchMedia = (query: string) =>
    ({
      matches: false,
      media: query,
      onchange: null,
      addListener: () => {},
      removeListener: () => {},
      addEventListener: () => {},
      removeEventListener: () => {},
      dispatchEvent: () => false,
    }) as unknown as MediaQueryList;
}
