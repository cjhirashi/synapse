import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { openImageViewer } from "./imageViewer";

const q = <T extends Element = HTMLElement>(selector: string): T => document.querySelector(selector) as T;
const label = () => q(".image-viewer-zoom-reset").textContent;
const transform = () => q<HTMLImageElement>(".image-viewer-img").style.transform;

let clock = 1000;
/** Evento de puntero (jsdom no trae `PointerEvent`): un MouseEvent con las propiedades que lee el visor. */
function fire(target: Element, type: string, id: number, x: number, y: number, extra: Record<string, unknown> = {}, at = clock) {
  const event = new MouseEvent(type, { bubbles: true, cancelable: true, clientX: x, clientY: y, button: 0 });
  for (const [key, value] of Object.entries({ pointerId: id, pointerType: "touch", ...extra })) Object.defineProperty(event, key, { value });
  Object.defineProperty(event, "timeStamp", { value: at });
  target.dispatchEvent(event);
}
const tap = (target: Element, x: number, y: number, at: number) => {
  fire(target, "pointerdown", 1, x, y, {}, at);
  fire(target, "pointerup", 1, x, y, {}, at + 40);
};

/** Da tamaño a la imagen (400 × 300) y al visor (400 × 800): jsdom no hace maquetación. */
function size() {
  Object.defineProperty(q(".image-viewer-img"), "offsetWidth", { configurable: true, value: 400 });
  Object.defineProperty(q(".image-viewer-img"), "offsetHeight", { configurable: true, value: 300 });
  Object.defineProperty(q(".image-viewer-stage"), "clientWidth", { configurable: true, value: 400 });
  Object.defineProperty(q(".image-viewer-stage"), "clientHeight", { configurable: true, value: 800 });
  q(".image-viewer-stage").getBoundingClientRect = () => ({ left: 0, top: 0, width: 400, height: 800, right: 400, bottom: 800, x: 0, y: 0, toJSON: () => ({}) });
}

beforeEach(() => {
  clock = 1000;
  openImageViewer("https://synapse.cjhirashi.com/files/x.png", "Foto");
});
afterEach(() => {
  document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
});

describe("visor de imagen con zoom", () => {
  it("abre al 100 % con los controles: alejar deshabilitado, porcentaje y acercar", () => {
    expect(q(".image-viewer-img").getAttribute("src")).toBe("https://synapse.cjhirashi.com/files/x.png");
    expect(q('[role="toolbar"]').getAttribute("aria-label")).toBe("Zoom de la imagen");
    expect(label()).toBe("100 %");
    expect(q<HTMLButtonElement>('[aria-label="Alejar"]').disabled).toBe(true);
    expect(q<HTMLButtonElement>('[aria-label="Acercar"]').disabled).toBe(false);
    expect(transform()).toBe("");
  });

  it("los botones acercan por pasos de 1.5, alejan, restablecen y respetan el máximo", () => {
    size();
    q('[aria-label="Acercar"]').click();
    expect(label()).toBe("150 %");
    expect(transform()).toBe("translate(0px, 0px) scale(1.5)");
    q('[aria-label="Acercar"]').click();
    expect(label()).toBe("225 %");
    q('[aria-label="Alejar"]').click();
    expect(label()).toBe("150 %");
    q('[aria-label="Restablecer zoom"]').click();
    expect(label()).toBe("100 %");
    expect(transform()).toBe("");
    for (let i = 0; i < 12; i += 1) q('[aria-label="Acercar"]').click();
    expect(label()).toBe("800 %");
    expect(q<HTMLButtonElement>('[aria-label="Acercar"]').disabled).toBe(true);
  });

  it("usar los controles no cierra el visor", () => {
    q('[aria-label="Acercar"]').click();
    q('[aria-label="Restablecer zoom"]').click();
    expect(q(".image-viewer")).not.toBeNull();
  });

  it("teclas + - 0 y Esc", () => {
    document.dispatchEvent(new KeyboardEvent("keydown", { key: "+" }));
    expect(label()).toBe("150 %");
    document.dispatchEvent(new KeyboardEvent("keydown", { key: "-" }));
    expect(label()).toBe("100 %");
    document.dispatchEvent(new KeyboardEvent("keydown", { key: "+" }));
    document.dispatchEvent(new KeyboardEvent("keydown", { key: "0" }));
    expect(label()).toBe("100 %");
    document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
    expect(document.querySelector(".image-viewer")).toBeNull();
  });

  it("la rueda acerca y aleja, y no desplaza la página", () => {
    size();
    const up = new WheelEvent("wheel", { bubbles: true, cancelable: true, deltaY: -200, clientX: 200, clientY: 400 });
    q(".image-viewer-stage").dispatchEvent(up);
    expect(up.defaultPrevented).toBe(true);
    expect(label()).toBe("135 %"); // exp(0.3) ≈ 1.35
    q(".image-viewer-stage").dispatchEvent(new WheelEvent("wheel", { bubbles: true, cancelable: true, deltaY: 400, clientX: 200, clientY: 400 }));
    expect(label()).toBe("100 %");
  });

  it("pellizco con dos dedos: al doble de distancia queda al 200 %, y al juntarlos vuelve", () => {
    size();
    const stage = q(".image-viewer-stage");
    fire(stage, "pointerdown", 1, 150, 400);
    fire(stage, "pointerdown", 2, 250, 400);
    fire(stage, "pointermove", 1, 100, 400);
    fire(stage, "pointermove", 2, 300, 400);
    expect(label()).toBe("200 %");
    expect(transform()).toBe("translate(0px, 0px) scale(2)");
    fire(stage, "pointermove", 1, 140, 400);
    fire(stage, "pointermove", 2, 260, 400);
    expect(label()).toBe("120 %");
    fire(stage, "pointerup", 2, 260, 400);
    fire(stage, "pointerup", 1, 140, 400);
  });

  it("ampliada se arrastra con un dedo y no se sale de la imagen", () => {
    size();
    const stage = q(".image-viewer-stage");
    q('[aria-label="Acercar"]').click();
    q('[aria-label="Acercar"]').click(); // 225 %: el ancho cubre 900 contra 400 visibles → ±250
    fire(stage, "pointerdown", 1, 200, 400);
    fire(stage, "pointermove", 1, 260, 400);
    expect(transform()).toBe("translate(60px, 0px) scale(2.25)");
    fire(stage, "pointermove", 1, 900, 400);
    expect(transform()).toBe("translate(250px, 0px) scale(2.25)");
    fire(stage, "pointerup", 1, 900, 400);
  });

  it("a 100 % arrastrar no mueve la imagen", () => {
    size();
    const stage = q(".image-viewer-stage");
    fire(stage, "pointerdown", 1, 200, 400);
    fire(stage, "pointermove", 1, 300, 450);
    expect(transform()).toBe("");
    fire(stage, "pointerup", 1, 300, 450);
  });

  it("doble toque en la imagen acerca al 250 % y otro doble toque restablece; un toque solo no hace nada", () => {
    size();
    const img = q(".image-viewer-img");
    tap(img, 200, 400, 1000);
    expect(label()).toBe("100 %");
    expect(q(".image-viewer")).not.toBeNull();
    tap(img, 202, 401, 1150);
    expect(label()).toBe("250 %");
    tap(img, 200, 400, 2000);
    tap(img, 200, 400, 2150);
    expect(label()).toBe("100 %");
  });

  it("un toque limpio en el fondo cierra; un arrastre que termina en el fondo no", () => {
    // El fondo es el área de gestos misma (no la imagen): se arrastra y se suelta sin cerrar.
    const stage = q(".image-viewer-stage");
    fire(stage, "pointerdown", 1, 20, 20, {}, 1000);
    fire(stage, "pointermove", 1, 80, 90, {}, 1050);
    fire(stage, "pointerup", 1, 80, 90, {}, 1100);
    expect(q(".image-viewer")).not.toBeNull();
    tap(stage, 20, 20, 3000);
    expect(document.querySelector(".image-viewer")).toBeNull();
  });

  it("el botón × cierra", () => {
    q(".image-viewer-close").click();
    expect(document.querySelector(".image-viewer")).toBeNull();
  });
});
