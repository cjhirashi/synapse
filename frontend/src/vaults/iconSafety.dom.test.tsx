// Comportamiento con un `icon` hostil (SPEC-0009 RF-001, RF-011, RF-012): ningún atributo `href`/`src`/`style`
// del DOM de los consumidores contiene el valor, ni `javascript:` ni `url(`. Complementa al guardián estático
// de `iconSafety.test.ts`, que no ve lo que el código hace en tiempo de ejecución.
import { render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { expect, test } from "vitest";
import VaultRail from "../notes/VaultRail";
import { seedStore, syncValue, WithSync } from "../test-utils/sync";
import IconPicker from "./IconPicker";
import VaultListPage from "./VaultListPage";
import { PALETTE } from "./vaultIcon";

// Valores que la gramática del servidor admite (`javascript:x` es `glifo:color`) o que un documento
// manipulado de la réplica podría traer.
const HOSTILE = ["javascript:x", "url(x)", "javascript:alert(1)", "star:red;background:url(x)", "<img src=x onerror=alert(1)>"];

/** Atributos que podrían cargar o ejecutar algo, o inyectar estilo, en todo el DOM renderizado. */
function dangerousAttributes(root: ParentNode): string[] {
  const found: string[] = [];
  for (const el of root.querySelectorAll("*")) {
    for (const name of ["href", "src", "srcset", "action", "formaction", "style"]) {
      const value = el.getAttribute(name);
      if (value !== null) found.push(`${name}=${value}`);
    }
  }
  return found;
}

function expectHarmless(attributes: string[], raw: string) {
  for (const attribute of attributes) {
    expect(attribute, `atributo con el valor hostil «${raw}»`).not.toMatch(/javascript|url\(|onerror|<|alert/i);
    expect(attribute).not.toContain(raw);
    // Sólo se admiten enlaces internos de bóveda y estilos hechos de variables de la paleta.
    if (attribute.startsWith("href=")) expect(attribute).toMatch(/^href=\/vaults\//);
    if (attribute.startsWith("style=")) {
      expect(attribute).toMatch(new RegExp(`^style=--chip-color: var\\(--(${PALETTE.join("|")})\\);?$`));
    }
  }
}

async function seedHostile(icon: string) {
  const { value, db } = syncValue();
  const vault = await seedStore(db).create({ name: "Notas", description: null, tags: [] });
  await db.put({ ...(await db.get(`vault:${vault.id}`)), icon });
  return value;
}

test.each(HOSTILE)("riel: «%s» no llega a ningún href, src ni style", async (raw) => {
  const value = await seedHostile(raw);
  const { container } = render(
    <WithSync value={value}>
      <MemoryRouter>
        <VaultRail />
      </MemoryRouter>
    </WithSync>,
  );
  await screen.findByRole("navigation", { name: "Bóvedas abiertas" });
  await screen.findAllByRole("link");
  const attributes = dangerousAttributes(container);
  expect(attributes.some((a) => a.startsWith("href=/vaults/"))).toBe(true);
  expectHarmless(attributes, raw);
});

test.each(HOSTILE)("lista de bóvedas: «%s» no llega a ningún href, src ni style", async (raw) => {
  const value = await seedHostile(raw);
  const { container } = render(
    <WithSync value={value}>
      <MemoryRouter initialEntries={["/vaults"]}>
        <Routes>
          <Route path="/vaults" element={<VaultListPage />} />
        </Routes>
      </MemoryRouter>
    </WithSync>,
  );
  await screen.findByRole("listitem", { name: "Notas" });
  expectHarmless(
    dangerousAttributes(container).filter((a) => !a.startsWith("href=/vaults/")),
    raw,
  );
  for (const a of dangerousAttributes(container).filter((a) => a.startsWith("href="))) expect(a).toMatch(/^href=\/vaults\//);
});

test.each(HOSTILE)("selector: «%s» no llega a ningún href, src ni style, y marca Iniciales", (raw) => {
  const { container } = render(<IconPicker vaultId="5f0c1d52-7a3e-4f6b-9a1d-0b2c3d4e5f60" name="Notas" value={raw} onChange={() => undefined} />);
  expect(screen.getByRole("radio", { name: "Iniciales" })).toBeChecked();
  const attributes = dangerousAttributes(container).filter((a) => !a.startsWith("style=--swatch"));
  expectHarmless(attributes, raw);
});
