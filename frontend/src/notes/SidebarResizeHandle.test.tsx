// H-023 C-4 y C-5: el asa de la orilla de la barra se arrastra con el mouse y se opera con el teclado.
import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, test, vi } from "vitest";
import SidebarResizeHandle from "./SidebarResizeHandle";
import { SIDEBAR_MAX, SIDEBAR_MIN, SIDEBAR_STEP } from "./useSidebarWidth";

// jsdom no tiene PointerEvent y `fireEvent.pointer*` descarta `clientX`: el arrastre se dispara con un
// MouseEvent del mismo tipo, que sí lo lleva.
function pointer(target: EventTarget, type: "pointerdown" | "pointermove" | "pointerup", clientX: number) {
  return fireEvent(target, new MouseEvent(type, { bubbles: true, cancelable: true, clientX }));
}

function renderHandle(width: number) {
  const onChange = vi.fn();
  const onReset = vi.fn();
  render(<SidebarResizeHandle width={width} onChange={onChange} onReset={onReset} />);
  return { handle: screen.getByRole("separator"), onChange, onReset };
}

afterEach(() => document.body.classList.remove("is-resizing"));

test("H-023 C-5: el separador es vertical y expone su ancho actual y el rango 240–384", () => {
  const { handle } = renderHandle(288);

  expect(handle).toHaveAttribute("aria-orientation", "vertical");
  expect(handle).toHaveAttribute("aria-valuenow", "288");
  expect(handle).toHaveAttribute("aria-valuemin", String(SIDEBAR_MIN));
  expect(handle).toHaveAttribute("aria-valuemax", String(SIDEBAR_MAX));
});

test("H-023 C-4: arrastrar el asa hacia la derecha ensancha la barra según el desplazamiento", () => {
  const { handle, onChange } = renderHandle(240);

  pointer(handle, "pointerdown", 240);
  pointer(window, "pointermove", 280);

  expect(onChange).toHaveBeenLastCalledWith(280);
  pointer(window, "pointerup", 280);
});

test("H-023 C-4: el arrastre se acota a 240–384 px en ambos sentidos", () => {
  const { handle, onChange } = renderHandle(288);

  pointer(handle, "pointerdown", 288);
  pointer(window, "pointermove", 900);
  expect(onChange).toHaveBeenLastCalledWith(SIDEBAR_MAX);

  pointer(window, "pointermove", 0);
  expect(onChange).toHaveBeenLastCalledWith(SIDEBAR_MIN);
  pointer(window, "pointerup", 0);
});

test("H-023 C-4: al soltar el mouse deja de cambiar el ancho", () => {
  const { handle, onChange } = renderHandle(240);

  pointer(handle, "pointerdown", 240);
  pointer(window, "pointerup", 240);
  onChange.mockClear();
  pointer(window, "pointermove", 300);

  expect(onChange).not.toHaveBeenCalled();
});

test("H-023 C-4: durante el arrastre el cuerpo lleva is-resizing y lo suelta al terminar", () => {
  const { handle } = renderHandle(240);

  pointer(handle, "pointerdown", 240);
  expect(document.body).toHaveClass("is-resizing");

  pointer(window, "pointerup", 240);
  expect(document.body).not.toHaveClass("is-resizing");
});

test("H-023 C-4: el pointerdown no inicia selección de texto ni deja pasar el evento por defecto", () => {
  const { handle } = renderHandle(240);

  expect(pointer(handle, "pointerdown", 240)).toBe(false);
  pointer(window, "pointerup", 240);
});

test("H-023 C-5: ←/→ ajustan el ancho en 16 px dentro del rango", () => {
  const { handle, onChange } = renderHandle(256);

  fireEvent.keyDown(handle, { key: "ArrowRight" });
  expect(onChange).toHaveBeenLastCalledWith(256 + SIDEBAR_STEP);

  fireEvent.keyDown(handle, { key: "ArrowLeft" });
  expect(onChange).toHaveBeenLastCalledWith(256 - SIDEBAR_STEP);
});

test("H-023 C-5: ← no baja de 240 px", () => {
  const { handle, onChange } = renderHandle(SIDEBAR_MIN);

  fireEvent.keyDown(handle, { key: "ArrowLeft" });

  expect(onChange).toHaveBeenLastCalledWith(SIDEBAR_MIN);
});

test("H-023 C-5: Inicio vuelve a 240 px", () => {
  const { handle, onReset } = renderHandle(360);

  fireEvent.keyDown(handle, { key: "Home" });

  expect(onReset).toHaveBeenCalledTimes(1);
});

test("H-023 C-4: doble clic en el asa vuelve a 240 px", () => {
  const { handle, onReset } = renderHandle(360);

  fireEvent.doubleClick(handle);

  expect(onReset).toHaveBeenCalledTimes(1);
});
