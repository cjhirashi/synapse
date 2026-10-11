import { expect, test } from "vitest";
import { ApiError, GENERIC_PROBLEM_TYPE, PROBLEM, parseProblem } from "./problems";

function response(status: number, body: string, contentType: string, statusText = ""): Response {
  return new Response(body, { status, statusText, headers: { "Content-Type": contentType } });
}

const PROBLEM_BODY = {
  type: PROBLEM.validationError,
  title: "Validation error",
  status: 422,
  detail: "Request validation failed.",
  instance: "/auth/change-password",
  errors: [{ pointer: "#/new_password", detail: "Password must be at least 10 characters long" }],
};

test("RF-010: parseProblem lee un cuerpo application/problem+json", async () => {
  const err = await parseProblem(response(422, JSON.stringify(PROBLEM_BODY), "application/problem+json"));
  expect(err).toBeInstanceOf(ApiError);
  expect(err).toMatchObject({
    status: 422,
    type: PROBLEM.validationError,
    title: "Validation error",
    detail: "Request validation failed.",
    errors: PROBLEM_BODY.errors,
    message: "Request validation failed.",
  });
});

test("RF-010: un JSON sin campos de Problem da un error genérico con el código HTTP", async () => {
  const err = await parseProblem(response(502, JSON.stringify({ unrelated: 1 }), "application/json", "Bad Gateway"));
  expect(err).toMatchObject({ status: 502, type: GENERIC_PROBLEM_TYPE, errors: [], message: "Bad Gateway" });
  expect(err.title).toBeUndefined();
  expect(err.detail).toBeUndefined();
});

test("RF-010: un cuerpo no JSON (p. ej. HTML de un proxy) no rompe el parseo", async () => {
  const err = await parseProblem(response(504, "<html>timeout</html>", "text/html", "Gateway Timeout"));
  expect(err).toMatchObject({ status: 504, type: GENERIC_PROBLEM_TYPE, message: "Gateway Timeout" });
});

test("RF-010: campos con tipo inesperado se ignoran en lugar de propagarse", async () => {
  const body = { type: 42, title: ["x"], detail: null, errors: "nope" };
  const err = await parseProblem(response(400, JSON.stringify(body), "application/problem+json", "Bad Request"));
  expect(err).toMatchObject({ type: GENERIC_PROBLEM_TYPE, errors: [], message: "Bad Request" });
});

test("RF-010: message prioriza detail, luego title, luego statusText", () => {
  expect(new ApiError(401, { title: "Invalid token", detail: "Token expired" }).message).toBe("Token expired");
  expect(new ApiError(401, { title: "Invalid token" }).message).toBe("Invalid token");
  expect(new ApiError(401, {}, "Unauthorized").message).toBe("Unauthorized");
});

test("RF-010: los tipos que usa la UI son URN del catálogo", () => {
  for (const type of Object.values(PROBLEM)) {
    expect(type).toMatch(/^urn:synapse:problem:[a-z0-9]+(-[a-z0-9]+)*$/);
  }
});
