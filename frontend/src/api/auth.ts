export class ApiError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

export interface Me {
  user_id: string;
  role: "admin" | "guest";
  must_change_password: boolean;
}

async function request(path: string, init: RequestInit = {}): Promise<Response> {
  const res = await fetch(path, {
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    ...init,
  });
  if (!res.ok) {
    let detail = res.statusText;
    try {
      const body = await res.json();
      if (typeof body.detail === "string") detail = body.detail;
    } catch {
      /* cuerpo no JSON */
    }
    throw new ApiError(res.status, detail);
  }
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
