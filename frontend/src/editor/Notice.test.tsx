// SPEC-0010 RF-008, RF-017, RF-019, RF-044, RF-045: avisos del editor (variantes y textos de PLAN-0010 §2.3-d).
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { Notice, noticeText } from "./Notice";

describe("Notice", () => {
  // RF-044
  it("info: rol status, clase de variante e icono decorativo", () => {
    render(<Notice variant="info">{noticeText.legacyBefore}</Notice>);
    const notice = screen.getByRole("status");
    expect(notice).toHaveClass("note-editor-notice", "note-notice-info");
    expect(notice.querySelector("svg[aria-hidden='true']")).not.toBeNull();
    expect(notice).toHaveTextContent("Esta nota tiene propiedades escritas dentro del texto. Se moverán al panel de propiedades cuando guardes.");
  });

  // RF-045
  it("advertencia: rol status y clase propia", () => {
    render(<Notice variant="warning">{noticeText.looksYaml}</Notice>);
    expect(screen.getByRole("status")).toHaveClass("note-notice-warning");
    expect(screen.getByRole("status")).toHaveTextContent("El inicio de la nota parece YAML, pero no se trata como propiedades. Edítalo en Código si quieres convertirlo.");
  });

  // RF-017, RF-019, RF-008
  it("error: rol alert y clase propia", () => {
    render(<Notice variant="error">{noticeText.yamlInvalid}</Notice>);
    const notice = screen.getByRole("alert");
    expect(notice).toHaveClass("note-notice-error");
    expect(notice).toHaveTextContent("El bloque de propiedades no es YAML válido");
  });

  // RF-044
  it("con onClose ofrece «Cerrar aviso» y lo llama", async () => {
    const onClose = vi.fn();
    render(
      <Notice variant="info" onClose={onClose}>
        {noticeText.legacyAfter}
      </Notice>,
    );
    await userEvent.click(screen.getByRole("button", { name: "Cerrar aviso" }));
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(screen.getByRole("status")).toHaveTextContent("Las propiedades se movieron fuera del texto. Ahora están en el panel de propiedades.");
  });

  // RF-008, RF-017
  it("con acción opcional pinta un botón con su texto", async () => {
    const onClick = vi.fn();
    render(
      <Notice variant="error" action={{ label: "Renombrar", onClick }}>
        {noticeText.invalidPath}
      </Notice>,
    );
    await userEvent.click(screen.getByRole("button", { name: "Renombrar" }));
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  // RF-017
  it("sin onClose ni acción no hay botones", () => {
    render(<Notice variant="info">hola</Notice>);
    expect(screen.queryByRole("button")).toBeNull();
  });

  // RF-019
  it("el aviso de 64 KiB lleva el tamaño y el límite", () => {
    expect(noticeText.frontmatterTooBig(70)).toBe("Las propiedades ocupan 70 KiB y el límite es 64 KiB. Acorta o quita valores y vuelve a guardar.");
  });

  // RF-008
  it("el aviso de ruta inválida conserva el borrador", () => {
    expect(noticeText.invalidPath).toBe(
      "Esta nota tiene un nombre no válido (termina en «/» o es «.md»). Renómbrala para guardar tus cambios; tu borrador se conserva.",
    );
  });

  // RF-017
  it("el aviso de YAML inválido promete que no se guardó nada", () => {
    expect(noticeText.yamlNotSaved).toBe("No se guardó nada y tu texto sigue igual. Corrígelo y vuelve a guardar.");
  });
});
