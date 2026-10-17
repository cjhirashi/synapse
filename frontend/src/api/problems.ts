/**
 * Errores de la API como Problem Details (RFC 9457, SPEC-0004).
 *
 * Espejo del esquema `Problem` del contrato de SPEC-0004. La UI decide por `type`
 * (estable) y muestra sus propios textos en español; `title`/`detail` llegan en inglés.
 */

export interface ProblemError {
  detail: string;
  pointer?: string;
  parameter?: string;
  header?: string;
}

export interface Problem {
  type: string;
  title: string;
  status: number;
  detail?: string;
  instance: string;
  errors?: ProblemError[];
}

/** RFC 9457: un problema sin `type` equivale a `about:blank` (sólo el código HTTP importa). */
export const GENERIC_PROBLEM_TYPE = "about:blank";

const URN = "urn:synapse:problem:";

/** Tipos del catálogo que la UI distingue; el resto se trata por código HTTP. */
export const PROBLEM = {
  wrongCurrentPassword: `${URN}wrong-current-password`,
  validationError: `${URN}validation-error`,
} as const;

export class ApiError extends Error {
  readonly type: string;
  readonly title?: string;
  readonly detail?: string;
  readonly errors: ProblemError[];

  constructor(
    public readonly status: number,
    problem: Partial<Problem> = {},
    statusText = "",
  ) {
    super(problem.detail ?? problem.title ?? statusText);
    this.name = "ApiError";
    this.type = problem.type ?? GENERIC_PROBLEM_TYPE;
    this.title = problem.title;
    this.detail = problem.detail;
    this.errors = problem.errors ?? [];
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function stringField(body: Record<string, unknown>, key: string): string | undefined {
  const value = body[key];
  return typeof value === "string" ? value : undefined;
}

/** Toma sólo los campos de Problem con el tipo esperado: el cuerpo viene de la red. */
function toProblem(body: unknown): Partial<Problem> {
  if (!isRecord(body)) return {};
  const errors = Array.isArray(body.errors)
    ? body.errors.filter((e): e is ProblemError => isRecord(e) && typeof e.detail === "string")
    : undefined;
  return {
    type: stringField(body, "type"),
    title: stringField(body, "title"),
    detail: stringField(body, "detail"),
    instance: stringField(body, "instance"),
    errors,
  };
}

/**
 * Convierte una respuesta fallida en `ApiError`. Tolera cuerpos no JSON (p. ej. la
 * página HTML de un proxy): el error conserva al menos el código y el `statusText`.
 */
export async function parseProblem(res: Response): Promise<ApiError> {
  let body: unknown = null;
  try {
    body = await res.json();
  } catch {
    /* cuerpo vacío o no JSON */
  }
  return new ApiError(res.status, toProblem(body), res.statusText);
}
