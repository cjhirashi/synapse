// Chip de bóveda: ícono del set o iniciales, con color elegido o derivado (SPEC-0009 RF-001;
// PLAN-0009 §2.3 b, P-1, P-2). Es decorativo: el nombre accesible lo pone quien lo usa.
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
