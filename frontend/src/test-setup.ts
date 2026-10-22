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

// jsdom no implementa la geometría de Range ni elementFromPoint (gap conocido, no un bug de
// la app): ProseMirror (Milkdown) y CodeMirror los consultan al medir y al hacer scroll, y
// sin estos stubs truenan al montar el editor. Devuelven geometría vacía: las pruebas no
// verifican posición, sólo el comportamiento del documento.
const emptyRect = {
  x: 0,
  y: 0,
  width: 0,
  height: 0,
  top: 0,
  right: 0,
  bottom: 0,
  left: 0,
  toJSON: () => ({}),
} as DOMRect;

if (typeof Range.prototype.getClientRects !== "function") {
  Range.prototype.getClientRects = () =>
    ({ length: 0, item: () => null, [Symbol.iterator]: function* () {} }) as unknown as DOMRectList;
}
if (typeof Range.prototype.getBoundingClientRect !== "function") {
  Range.prototype.getBoundingClientRect = () => emptyRect;
}
if (typeof document.elementFromPoint !== "function") {
  document.elementFromPoint = () => null;
}
