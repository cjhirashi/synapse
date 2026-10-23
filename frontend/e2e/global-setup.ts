// Preparación global de la verificación visual: el admin sembrado por el backend debe cambiar su
// contraseña antes de poder crear usuarios (RF-002 de 0002). Se hace una vez por corrida y la
// nueva contraseña se pasa a las pruebas por el entorno (los *workers* lo heredan).
import type { FullConfig } from "@playwright/test";

export default async function globalSetup(config: FullConfig): Promise<void> {
  const origin = config.projects[0].use.baseURL!;
  const email = process.env.ADMIN_EMAIL!;
  const initial = process.env.ADMIN_PASSWORD!;

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
  process.env.E2E_ADMIN_PASSWORD = next;
}
