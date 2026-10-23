import "@testing-library/jest-dom/vitest";
import { configure } from "@testing-library/react";
import { ASYNC_TIMEOUT_MS } from "./test-utils/waits";

// Plazo de `findBy*`/`waitFor` de toda la suite (`ASYNC_TIMEOUT_MS`, 4 s en vez del 1 s por omisión;
// las esperas con `vi.waitFor` lo usan por `waitForCondition`, F-4). Las pantallas de
// notas encadenan PouchDB en memoria, relecturas y redibujados; con varias suites a la vez (CI,
// Converge) la CPU saturada hace que un paso legítimo pase de 1 s sin que haya ningún defecto.
// Un plazo mayor sólo espera más cuando algo falla de verdad: no relaja ninguna aserción (F-2).
configure({ asyncUtilTimeout: ASYNC_TIMEOUT_MS });

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

// Los data routers de React Router (`createMemoryRouter`, necesarios para `useBlocker`)
// construyen un `Request` con el `AbortSignal` de cada navegación. En jsdom ese signal es el
// de jsdom, y el `Request` global es el de Node (undici), que sólo acepta el suyo: lanza
// "Expected signal to be an instance of AbortSignal". Las pruebas no abortan navegaciones,
// así que el `Request` descarta el signal ajeno (gap conocido de jsdom, no un bug de la app).
const NativeRequest = globalThis.Request;
globalThis.Request = class extends NativeRequest {
  constructor(input: RequestInfo | URL, init?: RequestInit) {
    super(input, init?.signal ? { ...init, signal: undefined } : init);
  }
} as typeof Request;
