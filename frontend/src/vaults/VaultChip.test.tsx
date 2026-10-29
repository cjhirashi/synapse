// Chip de bóveda: ícono del set o iniciales, con color elegido o derivado (SPEC-0009 RF-001;
// PLAN-0009 §2.3 b, P-1, P-2). Es decorativo: el nombre accesible lo pone quien lo usa.
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { render } from "@testing-library/react";
import { expect, test } from "vitest";
import VaultChip from "./VaultChip";
import { derivedColor, PALETTE } from "./vaultIcon";

const ID = "5f0c1d52-7a3e-4f6b-9a1d-0b2c3d4e5f60";

function chipOf(icon: string | null, name = "Notas", id = ID) {
  const { container } = render(<VaultChip id={id} name={name} icon={icon} />);
  const chip = container.querySelector<HTMLElement>(".vault-chip")!;
  return { container, chip, color: chip.style.getPropertyValue("--chip-color") };
}

test("RF-001: un glifo del set se dibuja como svg con data-icon y el color elegido", () => {
  const { chip, color } = chipOf("star:success");
  expect(chip.querySelector('svg[data-icon="star"]')).not.toBeNull();
  expect(chip).not.toHaveTextContent("NO");
  expect(color).toBe("var(--success)");
});

test("RF-001: sin ícono (null) se muestran las iniciales con el color derivado del id", () => {
  const { chip, color } = chipOf(null);
  expect(chip).toHaveTextContent("NO");
  expect(chip.querySelector("svg")).toBeNull();
  expect(color).toBe(`var(--${derivedColor(ID)})`);
});

test("RF-001: «initials:color» muestra iniciales con el color elegido", () => {
  const { chip, color } = chipOf("initials:warning", "Diario personal");
  expect(chip).toHaveTextContent("DP");
  expect(color).toBe("var(--warning)");
});

test("RF-001: un glifo desconocido cae a las iniciales y conserva el color elegido", () => {
  const { chip, color } = chipOf("carpeta-rara:danger");
  expect(chip).toHaveTextContent("NO");
  expect(chip.querySelector("svg")).toBeNull();
  expect(color).toBe("var(--danger)");
});

test("RF-001: un color desconocido nunca llega al style: se usa el derivado", () => {
  const { chip, color } = chipOf("star:fucsia");
  expect(chip.querySelector('svg[data-icon="star"]')).not.toBeNull();
  expect(color).toBe(`var(--${derivedColor(ID)})`);
  expect(chip.getAttribute("style")).not.toContain("fucsia");
});

test.each(["<svg onload=alert(1)>", "javascript:alert(1)", "star:red;background:url(x)", "a:b:c"])(
  "RF-001: un valor hostil («%s») no inyecta marcado ni estilo",
  (icon) => {
    const { container, chip, color } = chipOf(icon);
    expect(container.innerHTML).not.toMatch(/onload|javascript|url\(/);
    expect(chip.getAttribute("style") ?? "").not.toMatch(/url|javascript|;\s*background/);
    // Lo único que sale al estilo es una variable de la paleta.
    expect(PALETTE.map((key) => `var(--${key})`)).toContain(color);
  },
);

test("RF-001: el color derivado no cambia al renombrar la bóveda", () => {
  expect(chipOf(null, "Notas").color).toBe(chipOf(null, "Otro nombre").color);
});

test("RF-001: el chip es decorativo (aria-hidden): el nombre accesible lo da el enlace que lo contiene", () => {
  expect(chipOf("star").chip).toHaveAttribute("aria-hidden", "true");
});

// H-008: el chip deja de ser tinte del 18 % + aro; pasa a relleno con degradado del color y glifo
// recortado en el fondo de la app. (jsdom no resuelve `color-mix`/`linear-gradient`, así que el
// contrato del estilo se verifica sobre la hoja; el contraste resultante lo prueba vaultIcon.test.ts.)
const chipCss = readFileSync(resolve(__dirname, "VaultChip.css"), "utf8").replace(/\/\*[\s\S]*?\*\//g, "");
const chipRule = (selector: string) =>
  chipCss.match(new RegExp(`${selector.replace(/[.[\]"=:()-]/g, "\\$&")}\\s*\\{([^}]*)\\}`))?.[1] ?? "";

test("H-008 C-6: el chip se rellena con un degradado de dos tonos del color (color-mix), no el tinte del 18 % ni un aro", () => {
  // Relleno: un linear-gradient hecho de color-mix sobre --chip-color (sin tokens nuevos por color).
  expect(chipCss).toMatch(/linear-gradient\(/);
  expect(chipCss).toMatch(/color-mix\(in srgb, var\(--chip-color/);
  // Ya no queda el tinte del 18 % ni el aro de 2 px del diseño anterior.
  expect(chipCss).not.toMatch(/18%/);
  expect(chipRule(".vault-chip")).not.toMatch(/box-shadow:\s*inset[^;]*var\(--chip-color/);
});

test("H-008 C-7: el glifo/iniciales toman el fondo de la app (--bg-secondary), no --text-primary", () => {
  expect(chipRule(".vault-chip")).toMatch(/color:\s*var\(--bg-secondary\)/);
  expect(chipRule(".vault-chip")).not.toMatch(/color:\s*var\(--text-primary\)/);
});

test("H-008 C-8: el extremo más claro del degradado es el que vaultIcon.test.ts verifica (80% oscuro, 65% claro, mezcla hacia --text-primary)", () => {
  expect(chipCss).toMatch(/color-mix\(in srgb, var\(--chip-color\) 80%, var\(--text-primary\)\)/);
  expect(chipCss).toMatch(/color-mix\(in srgb, var\(--chip-color\) 65%, var\(--text-primary\)\)/);
});
