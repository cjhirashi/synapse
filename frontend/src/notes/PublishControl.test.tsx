import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import PublishControl from "./PublishControl";
import * as publicationApi from "./publicationApi";
import { type PublicationStatus } from "./publicationApi";

vi.mock("./publicationApi");

describe("PublishControl", () => {
  const mockStatus: PublicationStatus = {
    enabled: true,
    published: false,
    token: null,
    path: null,
    published_at: null,
    republished_at: null,
    stale: false,
  };

  const mockOnStatus = vi.fn();
  const mockGetHtml = vi.fn(() => "<p>Test HTML</p>");

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("Button state and labels", () => {
    it("shows button with correct data-state when not published", () => {
      render(
        <PublishControl
          vaultId="vault1"
          noteId="note1"
          status={mockStatus}
          onStatus={mockOnStatus}
          getHtml={mockGetHtml}
        />
      );

      const button = screen.getByRole("button", { name: /publicar en la web/i });
      expect(button).toHaveAttribute("data-state", "idle");
    });

    it("shows button with data-state ok when published and not stale", () => {
      const publishedStatus: PublicationStatus = {
        ...mockStatus,
        published: true,
        token: "token123",
        path: "/pub/note1",
        published_at: "2026-11-17T10:00:00Z",
      };

      render(
        <PublishControl
          vaultId="vault1"
          noteId="note1"
          status={publishedStatus}
          onStatus={mockOnStatus}
          getHtml={mockGetHtml}
        />
      );

      const button = screen.getByRole("button", { name: /publicado en la web.*enlace/i });
      expect(button).toHaveAttribute("data-state", "ok");
    });

    it("shows button with data-state stale when published and stale", () => {
      const staleStatus: PublicationStatus = {
        ...mockStatus,
        published: true,
        token: "token123",
        path: "/pub/note1",
        published_at: "2026-11-17T10:00:00Z",
        stale: true,
      };

      render(
        <PublishControl
          vaultId="vault1"
          noteId="note1"
          status={staleStatus}
          onStatus={mockOnStatus}
          getHtml={mockGetHtml}
        />
      );

      const button = screen.getByRole("button", { name: /cambios sin republicar/i });
      expect(button).toHaveAttribute("data-state", "stale");
    });
  });

  describe("Dialog opening", () => {
    it("opens dialog with unpublished view", async () => {
      vi.spyOn(publicationApi, "checkPublication").mockResolvedValue({
        resources: [],
        external: [],
        has_private: false,
      });

      render(
        <PublishControl
          vaultId="vault1"
          noteId="note1"
          status={mockStatus}
          onStatus={mockOnStatus}
          getHtml={mockGetHtml}
        />
      );

      const button = screen.getByRole("button", { name: /publicar en la web/i });
      await userEvent.click(button);

      await waitFor(() => {
        expect(screen.getByRole("dialog")).toBeInTheDocument();
      });
      expect(screen.getByText(/se creará una copia fija/i)).toBeInTheDocument();
    });

    it("opens dialog with published view when already published", async () => {
      const publishedStatus: PublicationStatus = {
        ...mockStatus,
        published: true,
        token: "token123",
        path: "/pub/note1",
        published_at: "2026-11-17T10:00:00Z",
      };

      vi.spyOn(publicationApi, "checkPublication").mockResolvedValue({
        resources: [],
        external: [],
        has_private: false,
      });

      render(
        <PublishControl
          vaultId="vault1"
          noteId="note1"
          status={publishedStatus}
          onStatus={mockOnStatus}
          getHtml={mockGetHtml}
        />
      );

      const button = screen.getByRole("button", { name: /publicado en la web/i });
      await userEvent.click(button);

      await waitFor(() => {
        expect(screen.getByRole("dialog")).toBeInTheDocument();
      });
      expect(screen.getByText(/documento publicado/i)).toBeInTheDocument();
    });
  });

  describe("Unpublished view behavior", () => {
    it("shows reviewing message while checking", async () => {
      let resolveFn: (value: publicationApi.PublicationCheck) => void;
      const checkPromise = new Promise<publicationApi.PublicationCheck>((resolve) => {
        resolveFn = resolve;
      });

      vi.spyOn(publicationApi, "checkPublication").mockReturnValue(checkPromise);

      render(
        <PublishControl
          vaultId="vault1"
          noteId="note1"
          status={mockStatus}
          onStatus={mockOnStatus}
          getHtml={mockGetHtml}
        />
      );

      const button = screen.getByRole("button", { name: /publicar en la web/i });
      await userEvent.click(button);

      await waitFor(() => {
        expect(screen.getByText(/revisando los recursos/i)).toBeInTheDocument();
      });

      resolveFn!({
        resources: [],
        external: [],
        has_private: false,
      });

      await waitFor(() => {
        expect(screen.queryByText(/revisando los recursos/i)).not.toBeInTheDocument();
      });
    });

    it("disables publish button until checkbox is checked", async () => {
      vi.spyOn(publicationApi, "checkPublication").mockResolvedValue({
        resources: [],
        external: [],
        has_private: false,
      });

      render(
        <PublishControl
          vaultId="vault1"
          noteId="note1"
          status={mockStatus}
          onStatus={mockOnStatus}
          getHtml={mockGetHtml}
        />
      );

      const button = screen.getByRole("button", { name: /publicar en la web/i });
      await userEvent.click(button);

      await waitFor(() => {
        const publishBtn = screen.getByRole("button", { name: /^Publicar$/ });
        expect(publishBtn).toBeDisabled();
      });

      const checkbox = screen.getByLabelText(/entiendo que cualquier persona/i);
      await userEvent.click(checkbox);

      const publishBtn = screen.getByRole("button", { name: /^Publicar$/ });
      expect(publishBtn).not.toBeDisabled();
    });

    it("shows error when getHtml returns null", async () => {
      vi.spyOn(publicationApi, "checkPublication").mockResolvedValue({
        resources: [],
        external: [],
        has_private: false,
      });

      const mockGetHtmlNull = vi.fn(() => null);

      render(
        <PublishControl
          vaultId="vault1"
          noteId="note1"
          status={mockStatus}
          onStatus={mockOnStatus}
          getHtml={mockGetHtmlNull}
        />
      );

      const button = screen.getByRole("button", { name: /publicar en la web/i });
      await userEvent.click(button);

      await waitFor(() => {
        expect(screen.getByText(/no se pudo leer el documento/i)).toBeInTheDocument();
      });
    });
  });

  describe("Published view behavior", () => {
    const publishedStatus: PublicationStatus = {
      enabled: true,
      published: true,
      token: "token123",
      path: "/pub/note1",
      published_at: "2026-11-17T10:00:00Z",
      republished_at: null,
      stale: false,
    };

    it("displays public link in read-only input", async () => {
      vi.spyOn(publicationApi, "checkPublication").mockResolvedValue({
        resources: [],
        external: [],
        has_private: false,
      });

      render(
        <PublishControl
          vaultId="vault1"
          noteId="note1"
          status={publishedStatus}
          onStatus={mockOnStatus}
          getHtml={mockGetHtml}
        />
      );

      const button = screen.getByRole("button", { name: /publicado en la web/i });
      await userEvent.click(button);

      // Espera a que el diálogo esté visible con el título de published
      await waitFor(() => {
        expect(screen.getByText(/documento publicado/i)).toBeInTheDocument();
      });

      // Verifica que el input exista y tenga readonly
      const linkInput = document.querySelector("#publish-link") as HTMLInputElement;
      expect(linkInput).not.toBeNull();
      expect(linkInput).toHaveAttribute("readOnly");
    });

    it("shows stale warning when status.stale is true", async () => {
      const staleStatus: PublicationStatus = {
        ...publishedStatus,
        stale: true,
      };

      vi.spyOn(publicationApi, "checkPublication").mockResolvedValue({
        resources: [],
        external: [],
        has_private: false,
      });

      render(
        <PublishControl
          vaultId="vault1"
          noteId="note1"
          status={staleStatus}
          onStatus={mockOnStatus}
          getHtml={mockGetHtml}
        />
      );

      const button = screen.getByRole("button", { name: /cambios sin republicar/i });
      await userEvent.click(button);

      await waitFor(() => {
        expect(screen.getByText(/el documento cambió desde la última publicación/i)).toBeInTheDocument();
      });
    });
  });

  describe("Confirm unpublish view", () => {
    const publishedStatus: PublicationStatus = {
      enabled: true,
      published: true,
      token: "token123",
      path: "/pub/note1",
      published_at: "2026-11-17T10:00:00Z",
      republished_at: null,
      stale: false,
    };

    it("shows confirm unpublish view", async () => {
      vi.spyOn(publicationApi, "checkPublication").mockResolvedValue({
        resources: [],
        external: [],
        has_private: false,
      });

      render(
        <PublishControl
          vaultId="vault1"
          noteId="note1"
          status={publishedStatus}
          onStatus={mockOnStatus}
          getHtml={mockGetHtml}
        />
      );

      const button = screen.getByRole("button", { name: /publicado en la web/i });
      await userEvent.click(button);

      // Espera a que el diálogo se abra y busca el botón de despublicar con contexto
      await waitFor(() => {
        const dialog = screen.getByRole("dialog");
        expect(dialog).toBeInTheDocument();
      });

      // El primer "Despublicar" en los actions
      const despublishButtons = screen.queryAllByText(/Despublicar/);
      expect(despublishButtons.length).toBeGreaterThan(0);
      await userEvent.click(despublishButtons[0]);

      await waitFor(() => {
        expect(screen.getByText(/¿despublicar el documento\?/i)).toBeInTheDocument();
      });
      expect(screen.getByText(/se elimina la copia y el enlace/i)).toBeInTheDocument();
    });
  });
});
