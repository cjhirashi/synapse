import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, test } from "vitest";
import ThemePage from "./ThemePage";

describe("ThemePage", () => {
  test("renderiza el titulo y el ThemeToggle", () => {
    render(
      <MemoryRouter>
        <ThemePage />
      </MemoryRouter>,
    );

    expect(screen.getByRole("heading", { name: "Tema" })).toBeInTheDocument();
    // El ThemeToggle es un group con aria-label
    expect(screen.getByRole("group", { name: /Tema/i })).toBeInTheDocument();
  });
});
