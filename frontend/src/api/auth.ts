import { parseProblem } from "./problems";

// `ApiError` vive en `problems.ts` (SPEC-0004); se re-exporta para no romper importaciones.
export { ApiError } from "./problems";

export interface Me {
  user_id: string;
  role: "admin" | "guest";
  must_change_password: boolean;
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
