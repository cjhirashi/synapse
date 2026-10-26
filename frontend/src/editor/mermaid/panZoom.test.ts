// RF-052 (SPEC-0010; PLAN-0010 §2.3-f, P-10): zoom y desplazamiento de los diagramas anchos con `svg-pan-zoom`
// (simulado aquí: lo que se prueba es la lógica de la aplicación; el efecto real sobre el SVG lo ve V-9).
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { attachPanZoom, type ZoomButtons } from "./panZoom";

interface FakeOptions {
  onZoom?: (zoom: number) => void;
  onPan?: (pan: { x: number; y: number }) => void;
  [key: string]: unknown;
}

// La «biblioteca»: estado de zoom (1 = ajustado) y de desplazamiento, con los límites que pide la aplicación.
const lib = vi.hoisted(() => {
  const state = { zoom: 1, pan: { x: 10, y: 20 }, options: {} as Record<string, unknown>, loads: 0 };
  const instance = {
    zoomBy: vi.fn(),
    zoomAtPointBy: vi.fn(),
    panBy: vi.fn(),
    getZoom: () => state.zoom,
    getPan: () => ({ ...state.pan }),
    fit: vi.fn(),
    center: vi.fn(),
    resize: vi.fn(),
    destroy: vi.fn(),
  };
  return { state, instance };
});
vi.mock("svg-pan-zoom", () => {
  lib.state.loads += 1;
  return { default: vi.fn((_svg: unknown, options: Record<string, unknown>) => ((lib.state.options = options), lib.instance)) };
});

const SVG_NS = "http://www.w3.org/2000/svg";

function mount() {
  const area = document.createElement("div");
  const svg = document.createElementNS(SVG_NS, "svg");
  area.append(svg);
  const buttons: ZoomButtons = { zoomIn: document.createElement("button"), zoomOut: document.createElement("button"), reset: document.createElement("button") };
  document.body.append(area, buttons.zoomIn, buttons.zoomOut, buttons.reset);
  return { area, svg, buttons };
}

/** El factor de la última llamada a un método de zoom. */
const lastFactor = (fn: { mock: { lastCall?: unknown[] } }) => fn.mock.lastCall?.[0] as number;

const opts = () => lib.state.options as FakeOptions;

/** Cambia el zoom como lo haría la biblioteca (respetando 0,2…10) y avisa por `onZoom`. */
function wire() {
  lib.instance.zoomBy.mockImplementation((factor: number) => {
    lib.state.zoom = Math.min(10, Math.max(0.2, lib.state.zoom * factor));
    opts().onZoom?.(lib.state.zoom);
  });
  lib.instance.panBy.mockImplementation((delta: { x: number; y: number }) => {
    lib.state.pan = { x: lib.state.pan.x + delta.x, y: lib.state.pan.y + delta.y };
    opts().onPan?.(lib.state.pan);
  });
  lib.instance.fit.mockImplementation(() => {
    lib.state.zoom = 1;
    opts().onZoom?.(1);
  });
  lib.instance.center.mockImplementation(() => {
    lib.state.pan = { x: 10, y: 20 };
    opts().onPan?.(lib.state.pan);
  });
}

beforeEach(() => {
  document.body.replaceChildren();
  lib.state.zoom = 1;
  lib.state.pan = { x: 10, y: 20 };
  for (const fn of Object.values(lib.instance)) if (typeof fn === "function" && "mockReset" in fn) (fn as ReturnType<typeof vi.fn>).mockReset();
  wire();
});

const press = (target: HTMLElement, key: string, init: KeyboardEventInit = {}) => {
  const event = new KeyboardEvent("keydown", { key, bubbles: true, cancelable: true, ...init });
  target.dispatchEvent(event);
  return event;
};

describe("panZoom · RF-052", () => {
  it("carga la biblioteca bajo demanda, ajustada y centrada, con zoom 0,2…10 y sin rueda ni doble clic propios", async () => {
    const before = lib.state.loads;
    const { area, svg, buttons } = mount();
    expect(lib.state.loads).toBe(before);
    await attachPanZoom(area, svg, buttons);
    expect(lib.state.loads).toBe(before + 1);
    expect(opts()).toMatchObject({
      fit: true,
      center: true,
      minZoom: 0.2,
      maxZoom: 10,
      panEnabled: true,
      zoomEnabled: true,
      mouseWheelZoomEnabled: false,
      dblClickZoomEnabled: false,
      controlIconsEnabled: false,
    });
  });

  it("los botones: «Reajustar» arranca deshabilitado; acercar y alejar escalan; reajustar vuelve a ajustar y centrar", async () => {
    const { area, svg, buttons } = mount();
    await attachPanZoom(area, svg, buttons);
    expect(buttons.reset).toBeDisabled();
    expect(buttons.zoomIn).toBeEnabled();
    expect(buttons.zoomOut).toBeEnabled();
    buttons.zoomIn.click();
    expect(lastFactor(lib.instance.zoomBy)).toBeGreaterThan(1);
    expect(buttons.reset).toBeEnabled();
    buttons.zoomOut.click();
    expect(lastFactor(lib.instance.zoomBy)).toBeLessThan(1);
    lib.instance.fit.mockClear();
    lib.instance.center.mockClear();
    buttons.zoomIn.click();
    buttons.reset.click();
    expect(lib.instance.fit).toHaveBeenCalled();
    expect(lib.instance.center).toHaveBeenCalled();
    expect(buttons.reset).toBeDisabled();
  });

  it("los límites deshabilitan el botón correspondiente (10 ×, 0,2 ×)", async () => {
    const { area, svg, buttons } = mount();
    await attachPanZoom(area, svg, buttons);
    for (let i = 0; i < 30; i++) buttons.zoomIn.click();
    expect(lib.state.zoom).toBe(10);
    expect(buttons.zoomIn).toBeDisabled();
    expect(buttons.zoomOut).toBeEnabled();
    buttons.reset.click();
    for (let i = 0; i < 30; i++) buttons.zoomOut.click();
    expect(lib.state.zoom).toBeCloseTo(0.2);
    expect(buttons.zoomOut).toBeDisabled();
    expect(buttons.zoomIn).toBeEnabled();
  });

  it("arrastrar (desplazar) también habilita «Reajustar»", async () => {
    const { area, svg, buttons } = mount();
    await attachPanZoom(area, svg, buttons);
    lib.instance.panBy({ x: 30, y: 0 });
    expect(buttons.reset).toBeEnabled();
  });

  it("teclado: flechas desplazan 40 px (160 con Mayús); + y - acercan y alejan; 0 reajusta", async () => {
    const { area, svg, buttons } = mount();
    await attachPanZoom(area, svg, buttons);
    lib.instance.panBy.mockClear();
    press(area, "ArrowRight");
    expect(lib.instance.panBy).toHaveBeenLastCalledWith({ x: -40, y: 0 });
    press(area, "ArrowLeft");
    expect(lib.instance.panBy).toHaveBeenLastCalledWith({ x: 40, y: 0 });
    press(area, "ArrowDown");
    expect(lib.instance.panBy).toHaveBeenLastCalledWith({ x: 0, y: -40 });
    press(area, "ArrowUp", { shiftKey: true });
    expect(lib.instance.panBy).toHaveBeenLastCalledWith({ x: 0, y: 160 });
    press(area, "+");
    expect(lib.state.zoom).toBeGreaterThan(1);
    press(area, "-");
    press(area, "-");
    expect(lib.state.zoom).toBeLessThan(1);
    lib.instance.fit.mockClear();
    press(area, "0");
    expect(lib.instance.fit).toHaveBeenCalled();
  });

  it("teclado: las teclas atendidas no llegan al editor (preventDefault) y las demás o con Ctrl/⌘ se dejan pasar", async () => {
    const { area, svg, buttons } = mount();
    await attachPanZoom(area, svg, buttons);
    expect(press(area, "+").defaultPrevented).toBe(true);
    expect(press(area, "ArrowLeft").defaultPrevented).toBe(true);
    expect(press(area, "a").defaultPrevented).toBe(false);
    expect(press(area, "Tab").defaultPrevented).toBe(false);
    for (const init of [{ ctrlKey: true }, { metaKey: true }, { altKey: true }]) expect(press(area, "+", init).defaultPrevented).toBe(false);
  });

  it("rueda: sólo con Ctrl o ⌘ hace zoom en el puntero; sin ellas no se toca (la página se desplaza)", async () => {
    const { area, svg, buttons } = mount();
    await attachPanZoom(area, svg, buttons);
    const wheel = (init: WheelEventInit) => {
      const event = new WheelEvent("wheel", { bubbles: true, cancelable: true, clientX: 50, clientY: 30, ...init });
      area.dispatchEvent(event);
      return event;
    };
    const plain = wheel({ deltaY: -100 });
    expect(plain.defaultPrevented).toBe(false);
    expect(lib.instance.zoomAtPointBy).not.toHaveBeenCalled();
    const ctrl = wheel({ deltaY: -100, ctrlKey: true });
    expect(ctrl.defaultPrevented).toBe(true);
    expect(lastFactor(lib.instance.zoomAtPointBy)).toBeGreaterThan(1);
    expect(lib.instance.zoomAtPointBy.mock.lastCall?.[1]).toEqual({ x: expect.any(Number), y: expect.any(Number) });
    wheel({ deltaY: 100, metaKey: true });
    expect(lastFactor(lib.instance.zoomAtPointBy)).toBeLessThan(1);
  });

  it("destroy suelta la instancia y los oyentes", async () => {
    const { area, svg, buttons } = mount();
    const handle = await attachPanZoom(area, svg, buttons);
    handle.destroy();
    expect(lib.instance.destroy).toHaveBeenCalledTimes(1);
    lib.instance.zoomBy.mockClear();
    buttons.zoomIn.click();
    press(area, "+");
    expect(lib.instance.zoomBy).not.toHaveBeenCalled();
  });

  it("si la biblioteca no carga no lanza: los botones quedan deshabilitados y el bloque sigue legible", async () => {
    vi.resetModules();
    vi.doMock("svg-pan-zoom", () => {
      throw new Error("chunk abortado");
    });
    const { attachPanZoom: attachFresh } = await import("./panZoom");
    const { area, svg, buttons } = mount();
    await expect(attachFresh(area, svg, buttons)).resolves.toBeDefined();
    for (const button of Object.values(buttons)) expect(button).toBeDisabled();
    vi.doUnmock("svg-pan-zoom");
  });
});

describe("panZoom · reduced-motion (RF-052)", () => {
  it("no anima por su cuenta: ninguna transición en el viewport del diagrama y la regla global anula las del resto", () => {
    const css = (rel: string) => readFileSync(resolve(__dirname, rel), "utf8");
    expect(css("../editor.css")).not.toMatch(/svg-pan-zoom_viewport[^{]*\{[^}]*transition/);
    expect(css("../../styles/global.css")).toMatch(/prefers-reduced-motion: reduce\)[\s\S]*transition-duration:\s*0\.01ms/);
  });
});
