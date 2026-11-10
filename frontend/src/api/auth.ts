import { parseProblem } from "./problems";

// `ApiError` vive en `problems.ts` (SPEC-0004); se re-exporta para no romper importaciones.
export { ApiError } from "./problems";

export interface Me {
  user_id: string;
  email: string;
  role: "admin" | "guest";
  must_change_password: boolean;
  // Perfil (H-028): nombre para mostrar y URL de la foto; `null` cuando no se han puesto.
  display_name: string | null;
  photo_url: string | null;
}

// Rutas cuyo 401 es una respuesta final, no una sesión caducada.
const NO_REFRESH = new Set(["/auth/login", "/auth/refresh", "/auth/logout"]);

let refreshing: Promise<boolean> | null = null;

async function callRefresh(): Promise<boolean> {
  const res = await fetch("/auth/refresh", { method: "POST", credentials: "include" });
  return res.ok;
}

/**
 * Renueva la sesión con el refresh token (RF-023). Una sola renovación en curso por
 * pestaña y, con Web Locks, serializada entre pestañas: dos rotaciones simultáneas del
 * mismo refresh token dispararían la detección de reutilización del backend (RF-022).
 */
export function refreshSession(): Promise<boolean> {
  if (!refreshing) {
    const locks = typeof navigator !== "undefined" ? navigator.locks : undefined;
    const run = locks ? locks.request("synapse-auth-refresh", callRefresh) : callRefresh();
    refreshing = run
      .catch(() => false)
      .finally(() => {
        refreshing = null;
      });
  }
  return refreshing;
}

/**
 * Petición al backend con cookies de sesión: renueva la sesión ante un 401 y convierte
 * toda respuesta fallida en `ApiError`. La reutilizan los demás clientes (`vaults.ts`).
 */
export async function request(path: string, init: RequestInit = {}, retry = true): Promise<Response> {
  const res = await fetch(path, {
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    ...init,
  });
  if (res.status === 401 && retry && !NO_REFRESH.has(path) && (await refreshSession())) {
    return request(path, init, false);
  }
  if (!res.ok) throw await parseProblem(res);
  return res;
}

export async function login(email: string, password: string): Promise<void> {
  await request("/auth/login", { method: "POST", body: JSON.stringify({ email, password }) });
}

export async function logout(): Promise<void> {
  await request("/auth/logout", { method: "POST" });
}

export async function getMe(): Promise<Me> {
  return (await request("/auth/me")).json();
}

export async function changePassword(current: string, next: string): Promise<void> {
  await request("/auth/change-password", {
    method: "POST",
    body: JSON.stringify({ current_password: current, new_password: next }),
  });
}

/**
 * Perfil (H-028). El nombre va como JSON; `null`/""→ sin nombre (el servidor recorta y limita a 80).
 * La foto va como `multipart/form-data`: con `headers: {}` el navegador fija el `boundary` (si se
 * dejara el `Content-Type: application/json` por defecto, el backend no podría leer el archivo).
 * Los tres devuelven el `Me` actualizado para que quien llama refresque la sesión.
 */
export async function updateDisplayName(name: string | null): Promise<Me> {
  return (
    await request("/auth/me", { method: "PATCH", body: JSON.stringify({ display_name: name }) })
  ).json();
}

export async function uploadPhoto(file: Blob): Promise<Me> {
  const form = new FormData();
  form.append("file", file);
  return (await request("/auth/me/photo", { method: "PUT", body: form, headers: {} })).json();
}

export async function deletePhoto(): Promise<Me> {
  return (await request("/auth/me/photo", { method: "DELETE", headers: {} })).json();
}
