// H-023 C-7 y C-8: el ancho de la barra va de 240 a 384 px, se recuerda entre sesiones y se valida al
// leerlo (corrupto o fuera de rango → 240). Sin `localStorage` utilizable, el ancho sigue en la sesión.
import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { SIDEBAR_MAX, SIDEBAR_MIN, useSidebarWidth } from "./useSidebarWidth";

const STORAGE_KEY = "synapse.sidebar-width";

beforeEach(() => localStorage.clear());
afterEach(() => {
  vi.restoreAllMocks();
  localStorage.clear();
});

test("H-023 C-7: sin preferencia guardada el ancho es 240 px y no se escribe localStorage", () => {
  const { result } = renderHook(() => useSidebarWidth());

  expect(result.current.width).toBe(SIDEBAR_MIN);
  expect(localStorage.getItem(STORAGE_KEY)).toBeNull();
});

test("H-023 C-7: el ancho elegido se guarda y se lee en la siguiente sesión", () => {
  const first = renderHook(() => useSidebarWidth());
  act(() => first.result.current.setWidth(320));

  expect(first.result.current.width).toBe(320);
  expect(localStorage.getItem(STORAGE_KEY)).toBe("320");

  const next = renderHook(() => useSidebarWidth());
  expect(next.result.current.width).toBe(320);
});

test("H-023 C-7: setWidth acota al rango 240–384 antes de guardar", () => {
  const { result } = renderHook(() => useSidebarWidth());

  act(() => result.current.setWidth(100));
  expect(result.current.width).toBe(SIDEBAR_MIN);

  act(() => result.current.setWidth(999));
  expect(result.current.width).toBe(SIDEBAR_MAX);
  expect(localStorage.getItem(STORAGE_KEY)).toBe(String(SIDEBAR_MAX));
});

test.each(["abc", "", "NaN", "320px", "100", "999", "1e9"])(
  "H-023 C-7: el valor guardado %j no es válido y el ancho vuelve a 240",
  (stored) => {
    localStorage.setItem(STORAGE_KEY, stored);

    const { result } = renderHook(() => useSidebarWidth());

    expect(result.current.width).toBe(SIDEBAR_MIN);
  },
);

test("H-023 C-7: reset vuelve a 240 px y lo guarda", () => {
  const { result } = renderHook(() => useSidebarWidth());
  act(() => result.current.setWidth(360));

  act(() => result.current.reset());

  expect(result.current.width).toBe(SIDEBAR_MIN);
  expect(localStorage.getItem(STORAGE_KEY)).toBe(String(SIDEBAR_MIN));
});

test("H-023 C-7: sin localStorage utilizable el ancho cambia en la sesión y no falla", () => {
  vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
    throw new DOMException("denegado", "SecurityError");
  });
  vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
    throw new DOMException("cuota llena", "QuotaExceededError");
  });

  const { result } = renderHook(() => useSidebarWidth());
  expect(result.current.width).toBe(SIDEBAR_MIN);

  act(() => result.current.setWidth(300));
  expect(result.current.width).toBe(300);
});
