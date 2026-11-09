import { render } from "@testing-library/react";
import { expect, test } from "vitest";
import { FileKindIcon, fileKind, fileKindLabel } from "./fileKind";

test.each([
  ["application/pdf", "pdf"],
  ["application/vnd.openxmlformats-officedocument.wordprocessingml.document", "word"],
  ["application/msword", "word"],
  ["application/vnd.oasis.opendocument.text", "word"],
  ["application/rtf", "word"],
  ["application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", "excel"],
  ["application/vnd.ms-excel", "excel"],
  ["application/vnd.oasis.opendocument.spreadsheet", "excel"],
  ["application/vnd.openxmlformats-officedocument.presentationml.presentation", "powerpoint"],
  ["application/vnd.ms-powerpoint", "powerpoint"],
  ["application/vnd.oasis.opendocument.presentation", "powerpoint"],
  ["text/html", "html"],
  ["text/csv", "csv"],
  ["application/json", "json"],
  ["text/markdown", "markdown"],
  ["text/plain", "text"],
  ["application/zip", "zip"],
  ["image/png", "image"],
  ["image/svg+xml", "image"],
  ["application/octet-stream", "other"],
])("%s se clasifica como %s", (contentType, kind) => {
  expect(fileKind(contentType)).toBe(kind);
});

test("cada tipo del servidor tiene un ícono con su propia clase de color", () => {
  const kinds = new Set<string>();
  for (const type of ["application/pdf", "application/msword", "application/vnd.ms-excel", "application/vnd.ms-powerpoint", "text/html", "text/csv", "application/json", "text/markdown", "text/plain", "application/zip", "image/png"]) {
    const { container, unmount } = render(<FileKindIcon contentType={type} />);
    const svg = container.querySelector("svg")!;
    expect(svg).toHaveAttribute("aria-hidden", "true");
    kinds.add(svg.getAttribute("data-kind")!);
    expect(svg).toHaveClass(`files-type-icon--${svg.getAttribute("data-kind")}`);
    unmount();
  }
  expect(kinds.size).toBe(11);
});

test("la etiqueta de tipo conserva el tipo MIME si no se conoce", () => {
  expect(fileKindLabel("application/pdf")).toBe("PDF");
  expect(fileKindLabel("application/x-raro")).toBe("application/x-raro");
});
