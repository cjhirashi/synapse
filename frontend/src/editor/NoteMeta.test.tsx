// H-029: sección META de la nota (siete generales + propiedades libres).
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { NoteMeta } from "./NoteMeta";

const FULL = {
  titulo: "Mi nota", descripcion: "Resumen", tags: ["ia", "análisis"], estado: "aprobado",
  fecha_creacion: "2026-07-06", fecha_actualizacion: "2026-07-15", tipo: "README",
};

function lastEmit(spy: ReturnType<typeof vi.fn>) {
  return spy.mock.calls.at(-1)?.[0] as Record<string, unknown>;
}

describe("NoteMeta · lectura", () => {
  it("muestra los siete generales en orden fijo", () => {
    render(<NoteMeta mode="read" frontmatter={FULL} path="Carpeta/Nota.md" />);
    const group = screen.getByRole("group", { name: "Atributos generales" });
    const labels = within(group).getAllByRole("term").map((t) => t.textContent);
    expect(labels).toEqual(["Título", "Descripción", "Ruta", "Fecha de creación", "Fecha de actualización", "Etiquetas", "Estado"]);
    const values = within(group).getAllByRole("definition").map((d) => d.textContent);
    expect(values).toEqual(["Mi nota", "Resumen", "Carpeta/Nota.md", "2026-07-06", "2026-07-15", "iaanálisis", "aprobado"]);
  });

  it("sin atributos muestra «—» y la ruta del sistema", () => {
    render(<NoteMeta mode="read" frontmatter={null} path="Nota.md" />);
    const group = screen.getByRole("group", { name: "Atributos generales" });
    expect(within(group).getAllByText("—")).toHaveLength(6);
    expect(within(group).getByText("Nota.md")).toBeInTheDocument();
  });

  it("las propiedades libres se pintan debajo y los generales no se repiten en ellas", () => {
    render(<NoteMeta mode="read" frontmatter={FULL} path="Nota.md" />);
    const free = screen.getByRole("group", { name: "Propiedades" });
    expect(within(free).getByText("tipo")).toBeInTheDocument();
    expect(within(free).queryByText("titulo")).toBeNull();
  });

  it("una `ruta` escrita en el frontmatter no sustituye a la ruta real ni sale como propiedad libre", () => {
    render(<NoteMeta mode="read" frontmatter={{ ruta: "otra/cosa.md" }} path="Real.md" />);
    expect(screen.getByText("Real.md")).toBeInTheDocument();
    expect(screen.queryByText("otra/cosa.md")).toBeNull();
  });

  it("un valor con HTML se pinta como texto, nunca como elemento", () => {
    const { container } = render(<NoteMeta mode="read" frontmatter={{ titulo: "<img src=x onerror=alert(1)>" }} path="N.md" />);
    expect(container.querySelector("img")).toBeNull();
    expect(screen.getByText("<img src=x onerror=alert(1)>")).toBeInTheDocument();
  });
});

describe("NoteMeta · edición", () => {
  it("no emite nada al montarse (no marca la nota como modificada)", () => {
    const onChange = vi.fn();
    render(<NoteMeta mode="edit" frontmatter={FULL} path="Nota.md" onChange={onChange} />);
    expect(onChange).not.toHaveBeenCalled();
  });

  it("escribir el título emite el objeto completo, con las fechas y las propiedades libres intactas", async () => {
    const onChange = vi.fn();
    render(<NoteMeta mode="edit" frontmatter={FULL} path="Nota.md" onChange={onChange} />);
    const input = screen.getByLabelText("Título");
    await userEvent.clear(input);
    await userEvent.type(input, "Otro");
    expect(lastEmit(onChange)).toEqual({ ...FULL, titulo: "Otro" });
  });

  it("vaciar un general lo quita del objeto (nunca `titulo: \"\"`)", async () => {
    const onChange = vi.fn();
    render(<NoteMeta mode="edit" frontmatter={FULL} path="Nota.md" onChange={onChange} />);
    await userEvent.clear(screen.getByLabelText("Título"));
    expect("titulo" in lastEmit(onChange)).toBe(false);
  });

  it("el placeholder del título es el nombre del archivo", () => {
    render(<NoteMeta mode="edit" frontmatter={{}} path="Carpeta/Mi archivo.md" />);
    expect(screen.getByLabelText("Título")).toHaveAttribute("placeholder", "Mi archivo");
  });

  it("la ruta y las fechas son de solo lectura y la ruta nunca se emite", async () => {
    const onChange = vi.fn();
    render(<NoteMeta mode="edit" frontmatter={{ ...FULL, ruta: "vieja.md" }} path="Nota.md" onChange={onChange} />);
    expect(screen.getByLabelText("Ruta")).toHaveAttribute("readonly");
    expect(screen.getByLabelText("Ruta")).toHaveValue("Nota.md");
    expect(screen.getByLabelText("Fecha de creación")).toHaveAttribute("readonly");
    expect(screen.getByLabelText("Fecha de actualización")).toHaveAttribute("readonly");
    await userEvent.type(screen.getByLabelText("Descripción"), "!");
    expect("ruta" in lastEmit(onChange)).toBe(false);
  });

  it("una descripción de más de 1000 caracteres muestra el error y no emite", async () => {
    const onChange = vi.fn();
    render(<NoteMeta mode="edit" frontmatter={{}} path="N.md" onChange={onChange} />);
    const area = screen.getByLabelText("Descripción");
    await userEvent.click(area);
    await userEvent.paste("x".repeat(1001));
    expect(screen.getByRole("alert")).toHaveTextContent("Máximo 1000 caracteres");
    expect(area).toHaveAttribute("aria-invalid", "true");
    expect(onChange).not.toHaveBeenCalled();
  });

  it("la propiedad libre se puede añadir aunque no haya ninguna y se emite con los generales", async () => {
    const onChange = vi.fn();
    render(<NoteMeta mode="edit" frontmatter={{ titulo: "T" }} path="N.md" onChange={onChange} />);
    await userEvent.click(screen.getByRole("button", { name: "Añadir propiedad" }));
    await userEvent.type(screen.getByLabelText("Clave de la propiedad 1"), "proyecto");
    await userEvent.type(screen.getByLabelText("Valor de «proyecto»"), "Synapse");
    expect(lastEmit(onChange)).toEqual({ titulo: "T", proyecto: "Synapse" });
  });
});

describe("NoteMeta · etiquetas", () => {
  it("Enter añade la etiqueta normalizada y la emite", async () => {
    const onChange = vi.fn();
    render(<NoteMeta mode="edit" frontmatter={{ tags: ["ia"] }} path="N.md" onChange={onChange} />);
    await userEvent.type(screen.getByPlaceholderText("Añadir etiqueta (Enter)"), "Mi Tag{Enter}");
    expect(lastEmit(onChange).tags).toEqual(["ia", "mi_tag"]);
  });

  it("la coma también añade", async () => {
    const onChange = vi.fn();
    render(<NoteMeta mode="edit" frontmatter={{}} path="N.md" onChange={onChange} />);
    await userEvent.type(screen.getByPlaceholderText("Añadir etiqueta (Enter)"), "uno,");
    expect(lastEmit(onChange).tags).toEqual(["uno"]);
  });

  it("una etiqueta repetida avisa y no se añade; una inválida también", async () => {
    const onChange = vi.fn();
    render(<NoteMeta mode="edit" frontmatter={{ tags: ["ia"] }} path="N.md" onChange={onChange} />);
    const input = screen.getByPlaceholderText("Añadir etiqueta (Enter)");
    await userEvent.type(input, "IA{Enter}");
    expect(screen.getByRole("alert")).toHaveTextContent("ya está");
    await userEvent.clear(input);
    await userEvent.type(input, "###{Enter}");
    expect(screen.getByRole("alert")).toHaveTextContent("Escribe una etiqueta");
    expect(onChange).not.toHaveBeenCalled();
  });

  it("no deja pasar de 20 etiquetas", async () => {
    const tags = Array.from({ length: 20 }, (_, i) => `t${i}`);
    render(<NoteMeta mode="edit" frontmatter={{ tags }} path="N.md" onChange={vi.fn()} />);
    await userEvent.type(screen.getByPlaceholderText("Añadir etiqueta (Enter)"), "extra{Enter}");
    expect(screen.getByRole("alert")).toHaveTextContent("Máximo 20");
  });

  it("quitar una etiqueta la saca del objeto; sin etiquetas la clave desaparece", async () => {
    const onChange = vi.fn();
    render(<NoteMeta mode="edit" frontmatter={{ tags: ["ia"] }} path="N.md" onChange={onChange} />);
    await userEvent.click(screen.getByRole("button", { name: "Quitar etiqueta ia" }));
    expect("tags" in lastEmit(onChange)).toBe(false);
  });
});

describe("NoteMeta · estado", () => {
  it("ofrece los estándar en su orden, los de la bóveda y el estado actual si es desconocido", () => {
    render(<NoteMeta mode="edit" frontmatter={{ estado: "pendiente" }} path="N.md" estadoOptions={["en pruebas"]} />);
    const options = within(screen.getByLabelText("Estado")).getAllByRole("option").map((o) => o.textContent);
    expect(options).toEqual([
      "Sin estado", "borrador", "en proceso", "en revisión", "aprobado", "en implementación", "implementado", "en pruebas", "pendiente", "Otro estado…",
    ]);
    expect(screen.getByLabelText("Estado")).toHaveValue("pendiente");
  });

  it("elegir uno lo emite y «Sin estado» lo quita", async () => {
    const onChange = vi.fn();
    render(<NoteMeta mode="edit" frontmatter={{ estado: "aprobado" }} path="N.md" onChange={onChange} />);
    await userEvent.selectOptions(screen.getByLabelText("Estado"), "implementado");
    expect(lastEmit(onChange).estado).toBe("implementado");
    await userEvent.selectOptions(screen.getByLabelText("Estado"), "Sin estado");
    expect("estado" in lastEmit(onChange)).toBe(false);
  });

  it("«Otro estado…» crea uno nuevo normalizado con Enter", async () => {
    const onChange = vi.fn();
    render(<NoteMeta mode="edit" frontmatter={{}} path="N.md" onChange={onChange} />);
    await userEvent.selectOptions(screen.getByLabelText("Estado"), "Otro estado…");
    await userEvent.type(screen.getByLabelText("Nuevo estado"), "En Pruebas{Enter}");
    expect(lastEmit(onChange).estado).toBe("en pruebas");
    expect(screen.queryByLabelText("Nuevo estado")).toBeNull();
    expect(screen.getByLabelText("Estado")).toHaveValue("en pruebas");
  });

  it("un estado vacío da error y no emite", async () => {
    const onChange = vi.fn();
    render(<NoteMeta mode="edit" frontmatter={{}} path="N.md" onChange={onChange} />);
    await userEvent.selectOptions(screen.getByLabelText("Estado"), "Otro estado…");
    await userEvent.type(screen.getByLabelText("Nuevo estado"), "   {Enter}");
    expect(screen.getByRole("alert")).toHaveTextContent("Escribe un estado de 1 a 32 caracteres");
    expect(onChange).not.toHaveBeenCalled();
  });
});

describe("NoteMeta · estados nuevos y catálogo de la bóveda", () => {
  it("crear un estado que no estaba en la lista avisa una vez al padre para que lo añada al catálogo", async () => {
    const onNewEstado = vi.fn();
    render(<NoteMeta mode="edit" frontmatter={{}} path="N.md" onNewEstado={onNewEstado} />);
    await userEvent.selectOptions(screen.getByLabelText("Estado"), "Otro estado…");
    await userEvent.type(screen.getByLabelText("Nuevo estado"), "En Pruebas{Enter}");
    expect(onNewEstado).toHaveBeenCalledTimes(1);
    expect(onNewEstado).toHaveBeenCalledWith("en pruebas");
  });

  it("escribir un estado que ya existe (estándar o de la bóveda) no avisa", async () => {
    const onNewEstado = vi.fn();
    render(<NoteMeta mode="edit" frontmatter={{}} path="N.md" estadoOptions={["en pruebas"]} onNewEstado={onNewEstado} />);
    await userEvent.selectOptions(screen.getByLabelText("Estado"), "Otro estado…");
    await userEvent.type(screen.getByLabelText("Nuevo estado"), "EN PRUEBAS{Enter}");
    await userEvent.selectOptions(screen.getByLabelText("Estado"), "Otro estado…");
    await userEvent.type(screen.getByLabelText("Nuevo estado"), "borrador{Enter}");
    expect(onNewEstado).not.toHaveBeenCalled();
  });

  it("elegir uno de la lista nunca avisa", async () => {
    const onNewEstado = vi.fn();
    render(<NoteMeta mode="edit" frontmatter={{}} path="N.md" onNewEstado={onNewEstado} />);
    await userEvent.selectOptions(screen.getByLabelText("Estado"), "aprobado");
    expect(onNewEstado).not.toHaveBeenCalled();
  });
});

describe("NoteMeta · atributos tipados (date, select, multiselect)", () => {
  describe("date", () => {
    it("cambia el valor y emite onChange con la fecha en formato AAAA-MM-DD", async () => {
      const onChange = vi.fn();
      const attributes = { fecha_x: { type: "date" as const } };
      render(<NoteMeta mode="edit" frontmatter={{ titulo: "T" }} path="N.md" onChange={onChange} attributes={attributes} />);
      const input = screen.getByLabelText("fecha_x");
      await userEvent.type(input, "2026-11-03");
      expect(lastEmit(onChange)).toEqual({ titulo: "T", fecha_x: "2026-11-03" });
    });

    it("vaciar la fecha la elimina del objeto", async () => {
      const onChange = vi.fn();
      const attributes = { fecha_x: { type: "date" as const } };
      render(<NoteMeta mode="edit" frontmatter={{ titulo: "T", fecha_x: "2026-11-03" }} path="N.md" onChange={onChange} attributes={attributes} />);
      const input = screen.getByLabelText("fecha_x");
      await userEvent.clear(input);
      expect("fecha_x" in lastEmit(onChange)).toBe(false);
    });
  });

  describe("select", () => {
    it("renderiza las opciones del catálogo con primera opción vacía", async () => {
      const onChange = vi.fn();
      const attributes = { prioridad: { type: "select" as const, options: ["baja", "media", "alta"] } };
      render(<NoteMeta mode="edit" frontmatter={{}} path="N.md" onChange={onChange} attributes={attributes} />);
      const select = screen.getByLabelText("prioridad") as HTMLSelectElement;
      const options = Array.from(select.options).map((o) => o.value);
      expect(options).toEqual(["", "baja", "media", "alta"]);
    });

    it("elegir una opción la emite", async () => {
      const onChange = vi.fn();
      const attributes = { prioridad: { type: "select" as const, options: ["baja", "media", "alta"] } };
      render(<NoteMeta mode="edit" frontmatter={{}} path="N.md" onChange={onChange} attributes={attributes} />);
      await userEvent.selectOptions(screen.getByLabelText("prioridad"), "media");
      expect(lastEmit(onChange).prioridad).toBe("media");
    });

    it("vaciar (seleccionar —) la elimina del objeto", async () => {
      const onChange = vi.fn();
      const attributes = { prioridad: { type: "select" as const, options: ["baja", "media", "alta"] } };
      render(<NoteMeta mode="edit" frontmatter={{ prioridad: "media" }} path="N.md" onChange={onChange} attributes={attributes} />);
      await userEvent.selectOptions(screen.getByLabelText("prioridad"), "—");
      expect("prioridad" in lastEmit(onChange)).toBe(false);
    });

    it("si el valor actual no está en options, lo añade como opción extra", async () => {
      const onChange = vi.fn();
      const attributes = { prioridad: { type: "select" as const, options: ["baja", "media", "alta"] } };
      render(<NoteMeta mode="edit" frontmatter={{ prioridad: "urgente" }} path="N.md" onChange={onChange} attributes={attributes} />);
      const select = screen.getByLabelText("prioridad") as HTMLSelectElement;
      const options = Array.from(select.options).map((o) => o.value);
      expect(options).toContain("urgente");
    });
  });

  describe("multiselect", () => {
    it("renderiza un checkbox por opción", async () => {
      const onChange = vi.fn();
      const attributes = { categorías: { type: "multiselect" as const, options: ["A", "B", "C"] } };
      render(<NoteMeta mode="edit" frontmatter={{}} path="N.md" onChange={onChange} attributes={attributes} />);
      expect(screen.getByLabelText("A")).toBeInTheDocument();
      expect(screen.getByLabelText("B")).toBeInTheDocument();
      expect(screen.getByLabelText("C")).toBeInTheDocument();
    });

    it("marcar checkboxes emite un array con los valores seleccionados", async () => {
      const onChange = vi.fn();
      const attributes = { categorías: { type: "multiselect" as const, options: ["A", "B", "C"] } };
      render(<NoteMeta mode="edit" frontmatter={{}} path="N.md" onChange={onChange} attributes={attributes} />);
      await userEvent.click(screen.getByLabelText("A"));
      await userEvent.click(screen.getByLabelText("C"));
      expect(lastEmit(onChange).categorías).toEqual(["A", "C"]);
    });

    it("valores actuales que no estén en options aparecen como checkbox marcado extra", async () => {
      const onChange = vi.fn();
      const attributes = { categorías: { type: "multiselect" as const, options: ["A", "B"] } };
      render(<NoteMeta mode="edit" frontmatter={{ categorías: ["A", "X"] }} path="N.md" onChange={onChange} attributes={attributes} />);
      expect(screen.getByLabelText("X")).toBeChecked();
      expect(screen.getByLabelText("X")).toBeInTheDocument();
    });

    it("desmarcar todos los checkboxes elimina la clave del objeto", async () => {
      const onChange = vi.fn();
      const attributes = { categorías: { type: "multiselect" as const, options: ["A", "B"] } };
      render(<NoteMeta mode="edit" frontmatter={{ categorías: ["A"] }} path="N.md" onChange={onChange} attributes={attributes} />);
      await userEvent.click(screen.getByLabelText("A"));
      expect("categorías" in lastEmit(onChange)).toBe(false);
    });
  });

  describe("valores tipados incorrectos", () => {
    it("un valor de tipo incorrecto no se muestra en el editor tipado (sigue en propiedades libres)", async () => {
      const onChange = vi.fn();
      const attributes = { prioridad: { type: "select" as const, options: ["baja", "media"] } };
      render(<NoteMeta mode="edit" frontmatter={{ titulo: "T", prioridad: 123 }} path="N.md" onChange={onChange} attributes={attributes} />);
      expect(screen.queryByLabelText("prioridad")).not.toBeInTheDocument();
      // La propiedad libre debe mostrar el valor incorrecto (buscamos el input con la clave)
      const freeInputs = screen.getAllByDisplayValue("123");
      expect(freeInputs.length).toBeGreaterThan(0);
    });

    it("un select con número no se trata como select tipado", async () => {
      const onChange = vi.fn();
      const attributes = { status: { type: "select" as const, options: ["a", "b"] } };
      render(<NoteMeta mode="edit" frontmatter={{ status: 456 }} path="N.md" onChange={onChange} attributes={attributes} />);
      expect(screen.queryByLabelText("status")).not.toBeInTheDocument();
    });

    it("un multiselect que no es array no se trata como multiselect tipado", async () => {
      const onChange = vi.fn();
      const attributes = { tags: { type: "multiselect" as const, options: ["x", "y"] } };
      render(<NoteMeta mode="edit" frontmatter={{ tags: "no soy un array" }} path="N.md" onChange={onChange} attributes={attributes} />);
      // tags es un atributo general, no entra en propiedades libres, pero el punto es que no aparece el editor tipado
      expect(screen.queryByRole("fieldset")).not.toBeInTheDocument();
    });

    it("un date que no es string AAAA-MM-DD no se trata como date tipado", async () => {
      const onChange = vi.fn();
      const attributes = { fecha: { type: "date" as const } };
      render(<NoteMeta mode="edit" frontmatter={{ fecha: "not-a-date" }} path="N.md" onChange={onChange} attributes={attributes} />);
      expect(screen.queryByLabelText("fecha")).not.toBeInTheDocument();
    });
  });

  describe("sin atributos", () => {
    it("sin prop attributes el comportamiento es idéntico al de antes (tests existentes siguen pasando)", async () => {
      const onChange = vi.fn();
      render(<NoteMeta mode="edit" frontmatter={FULL} path="Nota.md" onChange={onChange} />);
      const input = screen.getByLabelText("Título");
      await userEvent.clear(input);
      await userEvent.type(input, "Otro");
      expect(lastEmit(onChange)).toEqual({ ...FULL, titulo: "Otro" });
    });

    it("propiedades libres sin atributos tipados funcionan normalmente", async () => {
      const onChange = vi.fn();
      render(<NoteMeta mode="edit" frontmatter={{ titulo: "T" }} path="N.md" onChange={onChange} />);
      await userEvent.click(screen.getByRole("button", { name: "Añadir propiedad" }));
      await userEvent.type(screen.getByLabelText("Clave de la propiedad 1"), "proyecto");
      await userEvent.type(screen.getByLabelText("Valor de «proyecto»"), "Synapse");
      expect(lastEmit(onChange)).toEqual({ titulo: "T", proyecto: "Synapse" });
    });
  });

  describe("no duplicar propiedades", () => {
    it("una clave tipada (date/select/multiselect) no aparece duplicada en PropertiesForm", async () => {
      const onChange = vi.fn();
      const attributes = { prioridad: { type: "select" as const, options: ["baja", "media", "alta"] } };
      render(<NoteMeta mode="edit" frontmatter={{ titulo: "T", prioridad: "media", otros: "valor" }} path="N.md" onChange={onChange} attributes={attributes} />);
      // El select tipado debe existir
      const timedSelect = screen.getByLabelText("prioridad");
      expect(timedSelect).toBeInTheDocument();
      // La propiedad libre "otros" debe estar en PropertiesForm, pero no duplicada prioridad
      const otherInputs = screen.getAllByLabelText("Clave de la propiedad 1");
      expect(otherInputs.some((input) => (input as HTMLInputElement).value === "otros")).toBeTruthy();
      const priorityInFree = screen.queryAllByLabelText("Clave de la propiedad 1").some((input) => (input as HTMLInputElement).value === "prioridad");
      expect(priorityInFree).toBe(false);
    });
  });
});
