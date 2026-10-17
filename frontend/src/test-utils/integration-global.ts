// Preparación global de la sincronización real (vitest.sync.config.ts): el admin que siembra el
// backend recién levantado debe cambiar su contraseña antes de poder crear usuarios (RF-002
// de 0002). Se hace una vez por corrida y la contraseña nueva se pasa a las pruebas.
import type { GlobalSetupContext } from "vitest/node";

export default async function setup({ provide }: GlobalSetupContext): Promise<void> {
  const origin = process.env.SYNC_BACKEND_URL!;
  const email = process.env.SYNC_ADMIN_EMAIL!;
  const initial = process.env.SYNC_ADMIN_PASSWORD!;

  const login = await fetch(`${origin}/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password: initial }),
  });
  if (!login.ok) throw new Error(`login del admin → ${login.status}`);
  // El access token es la única cookie que necesita el cambio de contraseña.
  const access = login.headers.getSetCookie().find((line) => line.startsWith("access_token="));
  const next = `${initial}-cambiada`;
  const change = await fetch(`${origin}/auth/change-password`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Cookie: access!.split(";")[0] },
    body: JSON.stringify({ current_password: initial, new_password: next }),
  });
  if (!change.ok) throw new Error(`cambio de contraseña del admin → ${change.status}`);
  provide("adminPassword", next);
}
