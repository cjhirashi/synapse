// Selector de ícono y color de una bóveda (SPEC-0009 RF-011; PLAN-0009 §2.3 e): dos radiogroups
// controlados que emiten el texto «glifo[:color]» de `formatIcon`; no persisten nada por sí solos.
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { expect, test, vi } from "vitest";
import IconPicker from "./IconPicker";
import { COLOR_LABELS, ICON_LABELS, PALETTE } from "./vaultIcon";

function setup(value: string | null = null, name = "Notas") {
  const onChange = vi.fn();
  render(<IconPicker vaultId="5f0c1d52-7a3e-4f6b-9a1d-0b2c3d4e5f60" name={name} value={value} onChange={onChange} />);
  return {
    onChange,
    user: userEvent.setup(),
    icons: screen.getByRole("radiogroup", { name: "Ícono" }),
    colors: screen.getByRole("radiogroup", { name: "Color" }),
  };
}

test("RF-011: «Ícono» ofrece Iniciales + los 24 glifos y «Color» Automático + los 5 colores, con nombres en español", () => {
  const { icons, colors } = setup();
  const iconNames = within(icons).getAllByRole("radio").map((radio) => radio.getAttribute("aria-label"));
  expect(iconNames).toEqual(["Iniciales", ...Object.values(ICON_LABELS)]);
  const colorNames = within(colors).getAllByRole("radio").map((radio) => radio.getAttribute("aria-label"));
  expect(colorNames).toEqual(["Automático", ...PALETTE.map((key) => COLOR_LABELS[key])]);
});

// H-008 C-12: el selector muestra las 17 familias sin tocar su código (ya itera PALETTE); el layout
// de muestras no se rompe con 17 en vez de 5 (cada opción sigue siendo un círculo con su color).
test("C-12: «Color» ofrece Automático + los 17 colores, cada muestra con su token de la paleta", () => {
  const { colors } = setup();
  const radios = within(colors).getAllByRole("radio");
  expect(radios).toHaveLength(1 + PALETTE.length);
  expect(radios).toHaveLength(18);
  // Las 12 familias nuevas están presentes y seleccionables.
  for (const label of ["Naranja", "Amarillo", "Lima", "Esmeralda", "Verde azulado", "Azul real", "Índigo", "Violeta", "Púrpura", "Fucsia", "Rosa", "Rosado"]) {
    expect(within(colors).getByRole("radio", { name: label })).toBeInTheDocument();
  }
  // Cada muestra de color (todas menos «Automático») lleva su variable de color en el estilo.
  const swatches = radios.slice(1).filter((r) => (r.getAttribute("style") ?? "").includes("--swatch: var(--"));
  expect(swatches).toHaveLength(PALETTE.length);
});

test("C-12: elegir una familia nueva emite «glifo:color» con su clave", async () => {
  const { user, onChange, colors } = setup("star");
  await user.click(within(colors).getByRole("radio", { name: "Rosado" }));
  expect(onChange).toHaveBeenLastCalledWith("star:rose");
});

test.each([
  [null, "Iniciales", "Automático"],
  ["star", "Estrella", "Automático"],
  ["star:success", "Estrella", "Verde"],
  ["initials:warning", "Iniciales", "Ámbar"],
  // Valores que el catálogo no conoce: se muestran como «Iniciales»/«Automático» (igual que el riel).
  ["carpeta-rara:fucsia", "Iniciales", "Automático"],
])("RF-011: el valor «%s» marca %s y %s", (value, icon, color) => {
  const { icons, colors } = setup(value);
  expect(within(icons).getByRole("radio", { name: icon })).toBeChecked();
  expect(within(colors).getByRole("radio", { name: color })).toBeChecked();
});

test("RF-011: elegir un glifo o un color emite el texto «glifo[:color]» que formatIcon construye", async () => {
  const sin = setup(null);
  await sin.user.click(within(sin.icons).getByRole("radio", { name: "Cohete" }));
  expect(sin.onChange).toHaveBeenLastCalledWith("rocket");
  await sin.user.click(within(sin.colors).getByRole("radio", { name: "Rojo" }));
  // Controlado: `value` no cambió, así que el color se aplica sobre el valor recibido (null → sólo color).
  expect(sin.onChange).toHaveBeenLastCalledWith("initials:danger");
});

test("RF-011: cambiar el glifo conserva el color y viceversa; «Iniciales» y «Automático» quitan su parte", async () => {
  const { user, onChange, icons, colors } = setup("star:success");
  await user.click(within(icons).getByRole("radio", { name: "Cohete" }));
  expect(onChange).toHaveBeenLastCalledWith("rocket:success");
  await user.click(within(icons).getByRole("radio", { name: "Iniciales" }));
  expect(onChange).toHaveBeenLastCalledWith("initials:success");
  await user.click(within(colors).getByRole("radio", { name: "Azul" }));
  expect(onChange).toHaveBeenLastCalledWith("star:info");
  await user.click(within(colors).getByRole("radio", { name: "Automático" }));
  expect(onChange).toHaveBeenLastCalledWith("star");
});

test("RF-011: «Iniciales» con «Automático» no deja ningún valor (null)", async () => {
  const { user, onChange, icons } = setup("star");
  await user.click(within(icons).getByRole("radio", { name: "Iniciales" }));
  expect(onChange).toHaveBeenLastCalledWith(null);
});

test("RF-011: las flechas mueven la selección del grupo (con vuelta) y el foco la sigue", async () => {
  const { user, onChange, icons } = setup(null);
  within(icons).getByRole("radio", { name: "Iniciales" }).focus();
  await user.keyboard("{ArrowRight}");
  expect(onChange).toHaveBeenLastCalledWith("folder");
  expect(within(icons).getByRole("radio", { name: "Carpeta" })).toHaveFocus();
  await user.keyboard("{ArrowLeft}");
  expect(onChange).toHaveBeenLastCalledWith(null);
  expect(within(icons).getByRole("radio", { name: "Iniciales" })).toHaveFocus();
  // Desde el primero, hacia atrás da la vuelta al último.
  await user.keyboard("{ArrowUp}");
  expect(onChange).toHaveBeenLastCalledWith("dumbbell");
  expect(within(icons).getByRole("radio", { name: "Pesa" })).toHaveFocus();
});

test("RF-011: sólo la opción marcada es tabulable en cada grupo (roving tabindex)", () => {
  const { icons, colors } = setup("star:success");
  for (const group of [icons, colors]) {
    const tabbable = within(group).getAllByRole("radio").filter((radio) => radio.tabIndex === 0);
    expect(tabbable).toHaveLength(1);
    expect(tabbable[0]).toBeChecked();
  }
});

test("RF-011, RF-001: la vista previa es el chip de la bóveda con el valor actual", () => {
  const { icons } = setup("star:success", "Notas");
  const preview = icons.parentElement!.querySelector(".vault-chip")!;
  expect(preview.querySelector('svg[data-icon="star"]')).not.toBeNull();
});

// Enmienda 2 (F2-4): la vista previa tiene su rótulo visible y el foco se distingue de la selección.
test("RF-011: la vista previa lleva el rótulo visible «Vista previa»", () => {
  const { icons } = setup("star:success");
  expect(within(icons.parentElement!).getByText("Vista previa")).toBeVisible();
});

test("RF-011: el foco es un anillo (outline) y la selección un relleno, ambos con tokens", () => {
  const css = readFileSync(resolve(__dirname, "VaultChip.css"), "utf8").replace(/\/\*[\s\S]*?\*\//g, "");
  const rule = (selector: string) => css.match(new RegExp(`${selector.replace(/[.[\]"=:()-]/g, "\\$&")}(?:,[^{]*)?\\s*\\{([^}]*)\\}`))?.[1] ?? "";
  expect(rule('.icon-picker-option:focus-visible')).toMatch(/outline: 2px solid var\(--text-primary\)/);
  expect(rule('.icon-picker-option[aria-checked="true"]')).toMatch(/background: var\(--accent-soft\)/);
  // La selección no usa outline: así un grupo con foco y selección en opciones distintas se lee bien.
  expect(rule('.icon-picker-option[aria-checked="true"]')).not.toMatch(/outline/);
});
