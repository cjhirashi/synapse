// Barra de estado de la sincronización (SPEC-0005 RF-009, RF-010, RF-016, RF-019; PLAN-0005 §2.5).
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { expect, test } from "vitest";
import { syncValue, WithSync } from "../test-utils/sync";
import type { SyncStatus } from "./status";
import SyncStatusBar from "./SyncStatusBar";
import type { SyncContextValue } from "./useSync";

const VAULT_ID = "vault:11111111-1111-4111-8111-111111111111";
const LAST_SYNC = "2026-10-13T18:05:00.000000Z";

function renderBar(overrides: Partial<SyncContextValue>) {
  const { value } = syncValue(overrides);
  return render(
    <MemoryRouter>
      <WithSync value={value}>
        <SyncStatusBar />
      </WithSync>
    </MemoryRouter>,
  );
}

function status(state: SyncStatus["state"], pending = false, lastSyncAt: string | null = LAST_SYNC): SyncStatus {
  return { state, pending, lastSyncAt };
}

test.each([
  ["online", "Sincronizado"],
  ["syncing", "Sincronizando…"],
  ["pending", "Cambios pendientes"],
  ["offline", "Sin conexión"],
  ["session-expired", "La sesión caducó: inicia sesión para seguir sincronizando."],
] as const)("estado %s → «%s»", (state, text) => {
  renderBar({ status: status(state) });
  expect(screen.getByRole("status")).toHaveTextContent(text);
});

test("RF-009: sin conexión muestra la hora de la última sincronización correcta", () => {
  renderBar({ status: status("offline") });
  const time = screen.getByText((_, element) => element?.tagName === "TIME");
  expect(time).toHaveAttribute("dateTime", LAST_SYNC);
  expect(time.closest("p")).toHaveTextContent(/^Última sincronización: .+/);
});

test("sin ninguna sincronización todavía lo dice", () => {
  renderBar({ status: status("offline", true, null) });
  expect(screen.getByText("Aún no se ha sincronizado")).toBeInTheDocument();
});

test("RF-009/RF-010: sin conexión con cambios locales avisa de que están pendientes", () => {
  renderBar({ status: status("offline", true) });
  expect(screen.getByRole("status")).toHaveTextContent("Sin conexión · cambios pendientes");
});

test("RF-016: con la sesión caducada ofrece iniciar sesión", () => {
  renderBar({ status: status("session-expired") });
  expect(screen.getByRole("link", { name: "Iniciar sesión" })).toHaveAttribute("href", "/login");
});

test("cuenta los rechazos y los conflictos con enlace a sus vistas", () => {
  renderBar({
    rejections: [
      { id: VAULT_ID, rev: "1-a", reason: "vault-name-taken" },
      { id: "vault:22222222-2222-4222-8222-222222222222", rev: "1-b", reason: "owner-mismatch" },
    ],
    conflicts: [
      {
        kind: "vault",
        id: VAULT_ID,
        reason: "no-ancestor",
        fields: [],
        winner: { rev: "2-w", doc: doc("W") },
        loser: { rev: "2-l", doc: doc("L") },
      },
    ],
  });
  expect(screen.getByRole("link", { name: "2 cambios rechazados" })).toHaveAttribute("href", "/rejections");
  expect(screen.getByRole("link", { name: "1 conflicto" })).toHaveAttribute("href", "/conflicts");
});

test("sin rechazos ni conflictos no muestra sus enlaces", () => {
  renderBar({});
  expect(screen.queryByRole("link")).not.toBeInTheDocument();
});

test("no se muestra mientras no se replica (cambio de contraseña pendiente)", () => {
  const { container } = renderBar({ replicating: false });
  expect(container).toBeEmptyDOMElement();
});

function doc(name: string) {
  return { name, description: null, tags: [], owner_id: "u1", created_at: "t0", updated_at: "t1", deleted_at: null };
}
