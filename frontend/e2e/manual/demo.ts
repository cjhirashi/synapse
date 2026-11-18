// H-059: datos de demostración del Manual de Operación de Synapse.
// Siembra por la API REST (usuario, bóvedas, notas, archivos, tareas, proyectos, publicaciones, avisos, agent keys).
import { createUser } from "../fixtures";

export interface Demo {
  email: string;
  password: string;
  cookie: string;
  vaultId: string;
  vaults: Array<{ id: string; name: string }>;
  noteIds: Record<string, string>;
  fileIds: Record<string, string>;
  taskIds: Record<string, string>;
  tokens: Record<string, string>;
}

const origin = () => process.env.BASE_URL ?? "http://127.0.0.1:8010";

async function api(cookie: string, method: string, path: string, body?: unknown): Promise<{ status: number; json: () => any; text: () => Promise<string> }> {
  const res = await fetch(`${origin()}${path}`, {
    method,
    headers: { "Content-Type": "application/json", Cookie: cookie },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`${method} ${path} → ${res.status}: ${text}`);
  return { status: res.status, json: () => JSON.parse(text), text: () => Promise.resolve(text) };
}

async function createNote(
  cookie: string,
  vaultId: string,
  path: string,
  frontmatter: Record<string, unknown>,
  content: string,
): Promise<string> {
  const res = await api(cookie, "POST", `/vaults/${vaultId}/notes`, {
    path,
    frontmatter,
    content,
  });
  return res.json().id as string;
}

export async function seedDemo(): Promise<Demo> {
  const user = await createUser();
  const cookie = user.cookie;
  const noteIds: Record<string, string> = {};
  const fileIds: Record<string, string> = {};
  const taskIds: Record<string, string> = {};
  const tokens: Record<string, string> = {};

  // a. Nombre visible
  await api(cookie, "PATCH", "/auth/me", { display_name: "Ana Torres" });

  // b. Tres bóvedas con descripción y etiquetas
  const cafeRes = await api(cookie, "POST", "/vaults", {
    name: "Café Aurora",
    icon: "briefcase",
    description: "Todo lo del negocio: ventas, compras, clientes y recetas",
    tags: ["negocio", "café"],
  });
  const cafeId = cafeRes.json().id as string;

  const personalRes = await api(cookie, "POST", "/vaults", {
    name: "Vida personal",
    icon: "heart",
    description: "Notas y pendientes de casa",
    tags: ["personal"],
  });
  const personalId = personalRes.json().id as string;

  const projectsRes = await api(cookie, "POST", "/vaults", {
    name: "Proyectos",
    icon: "rocket",
    description: "Ideas y planes a futuro",
    tags: ["ideas"],
  });
  const projectsId = projectsRes.json().id as string;

  const vaults = [
    { id: cafeId, name: "Café Aurora" },
    { id: personalId, name: "Vida personal" },
    { id: projectsId, name: "Proyectos" },
  ];

  // c. Notas mínimas de Café Aurora
  noteIds["Bienvenida"] = await createNote(
    cookie,
    cafeId,
    "Bienvenida a Café Aurora.md",
    {
      titulo: "Bienvenida a Café Aurora",
      descripcion: "Guía de bienvenida al espacio colaborativo",
      tags: ["bienvenida"],
      estado: "aprobado",
    },
    "# Bienvenida a Café Aurora\n\nEste es tu espacio para colaborar en equipo.",
  );

  noteIds["Informe mensual"] = await createNote(
    cookie,
    cafeId,
    "Ventas/Informe mensual.md",
    {
      titulo: "Informe mensual",
      descripcion: "Resumen de ventas del mes",
      tags: ["ventas", "informe"],
      estado: "revisión",
    },
    "# Informe mensual\n\nSemana de buenas ventas.\n\n- Café premium: 150 unidades\n- Pastelería: 120 unidades\n",
  );

  noteIds["Promociones temporada"] = await createNote(
    cookie,
    cafeId,
    "Ventas/Promociones de temporada.md",
    {
      titulo: "Promociones de temporada",
      descripcion: "Ofertas especiales para Navidad",
      tags: ["ventas", "marketing"],
      estado: "borrador",
    },
    "# Promociones de Temporada\n\nOferta especial para Navidad en Café Aurora.",
  );

  noteIds["Proveedores"] = await createNote(
    cookie,
    cafeId,
    "Compras/Proveedores.md",
    {
      titulo: "Proveedores",
      descripcion: "Listado de proveedores y contactos",
      tags: ["compras"],
      estado: "aprobado",
    },
    "# Proveedores Principales\n\nContacto con nuestros distribuidores.",
  );

  noteIds["Clientes frecuentes"] = await createNote(
    cookie,
    cafeId,
    "Clientes/Clientes frecuentes.md",
    {
      titulo: "Clientes frecuentes",
      descripcion: "Base de clientes recurrentes",
      tags: ["clientes"],
      estado: "aprobado",
    },
    "# Clientes Frecuentes\n\nPrograma de fidelización.",
  );

  noteIds["Café de olla"] = await createNote(
    cookie,
    cafeId,
    "Recetas/Café de olla.md",
    {
      titulo: "Café de olla",
      descripcion: "Receta tradicional mexicana",
      tags: ["recetas"],
      estado: "aprobado",
    },
    "# Café de Olla\n\nReceta clásica de café tradicional.",
  );

  // d. Documento para borrar
  noteIds["Borrador viejo"] = await createNote(
    cookie,
    cafeId,
    "Ventas/Borrador viejo.md",
    {},
    "Documento para borrar.\n",
  );

  // e. Tareas mínimas
  const now = new Date();
  const yesterday = new Date(now.getTime() - 86_400_000).toISOString();

  const task1 = await api(cookie, "POST", `/vaults/${cafeId}/tasks`, {
    title: "Comprar la cafetera nueva",
    status: "pending",
    due_at: yesterday,
  });
  taskIds["Comprar cafetera"] = task1.json().id as string;

  const task2 = await api(cookie, "POST", `/vaults/${cafeId}/tasks`, {
    title: "Revisar promociones",
    status: "in_progress",
  });
  taskIds["Revisar promociones"] = task2.json().id as string;

  return {
    email: user.email,
    password: user.password,
    cookie,
    vaultId: cafeId,
    vaults,
    noteIds,
    fileIds,
    taskIds,
    tokens,
  };
}
