/**
 * Tests básicos de las reglas META (H-030b). Los casos completos están en `backend/tests/fixtures/plantilla_reglas.json`
 * y se verifican en el servidor; aquí testeamos que la lógica básica funciona.
 */
import { describe, it, expect } from "vitest";
import {
  checkReservedCase,
  checkFolderMove,
  checkNoteWrite,
  checkDefinition,
  templateName,
  templatePath,
  appliesTo,
  checkRef,
  isMetaFolder,
  isTemplateZone,
} from "./metaRules";

describe("metaRules", () => {
  describe("checkReservedCase", () => {
    it("rechaza mayúsculas incorrectas en carpetas reservadas", () => {
      expect(checkReservedCase("plantillas/x.md")).toBe("meta-folder:case");
      expect(checkReservedCase("Plantillas/x.md")).toBe("meta-folder:case");
      expect(checkReservedCase("BITACORA/a.md")).toBeNull();
      expect(checkReservedCase("Ag - Mensajes/x.md")).toBe("meta-folder:case");
    });

    it("acepta rutas sin carpeta reservada o con mayúsculas correctas", () => {
      // Rutas sin carpeta reservada se aceptan.
      expect(checkReservedCase("Proyectos/x.md")).toBeNull();
      // Rutas de carpetas que no son reservadas.
      expect(checkReservedCase("x.md")).toBeNull();
      // Nombres canónicos correctos.
      expect(checkReservedCase("PLANTILLAS/x.md")).toBeNull();
      expect(checkReservedCase("AG - SKILLS/x.md")).toBeNull();
    });
  });

  describe("checkFolderMove", () => {
    it("permite cambiar mayúsculas en carpetas reservadas", () => {
      expect(checkFolderMove("Plantillas", "PLANTILLAS")).toBeNull();
    });

    it("rechaza renombrar/mover carpetas reservadas", () => {
      expect(checkFolderMove("PLANTILLAS", "Otra")).toBe("meta-folder:rename");
      expect(checkFolderMove("BITACORA", "BITACORA")).toBe("meta-folder:rename");
    });

    it("permite mover carpetas normales", () => {
      expect(checkFolderMove("Cualquiera", "Otra")).toBeNull();
    });
  });

  describe("checkNoteWrite", () => {
    it("rechaza escribir en BITACORA", () => {
      expect(checkNoteWrite({ path: "BITACORA/2026-11-05.md", deleted: false })).toBe("bitacora:readonly");
      expect(checkNoteWrite({ path: "Otra/x.md", prevPath: "BITACORA/y.md", deleted: false })).toBe("bitacora:readonly");
    });

    it("rechaza modificar skill de cajón desde agente", () => {
      expect(
        checkNoteWrite({ path: "AG - SKILLS/skill-bovedas-synapse.md", deleted: false, actorKind: "agent" })
      ).toBe("skill-cajon:human-only");
    });

    it("permite modificar skill de cajón desde usuario", () => {
      expect(
        checkNoteWrite({ path: "AG - SKILLS/skill-bovedas-synapse.md", deleted: false, actorKind: "human" })
      ).toBeNull();
    });
  });

  describe("checkDefinition", () => {
    it("rechaza definición sin alcance", () => {
      expect(checkDefinition({})).toBe("plantilla:alcance");
      expect(checkDefinition({ alcance: [] })).toBe("plantilla:alcance");
    });

    it("acepta alcance válido", () => {
      expect(checkDefinition({ alcance: ["*"] })).toBeNull();
      expect(checkDefinition({ alcance: ["Proyectos", "Notas"] })).toBeNull();
    });

    it("rechaza alcance inválido", () => {
      expect(checkDefinition({ alcance: "*" })).toBe("plantilla:alcance");
      expect(checkDefinition({ alcance: ["*", "Otros"] })).toBe("plantilla:alcance");
      expect(checkDefinition({ alcance: ["A", "A"] })).toBe("plantilla:alcance");
    });

    it("acepta atributos válidos", () => {
      expect(checkDefinition({ alcance: ["*"], atributos: [{ nombre: "cliente", tipo: "texto" }] })).toBeNull();
    });

    it("rechaza atributos inválidos", () => {
      expect(checkDefinition({ alcance: ["*"], atributos: [{ nombre: "Cliente", tipo: "texto" }] })).toBe(
        "plantilla:atributos"
      );
      expect(checkDefinition({ alcance: ["*"], atributos: [{ nombre: "titulo", tipo: "texto" }] })).toBe(
        "plantilla:atributos"
      );
    });

    it("rechaza estilo con contenido", () => {
      expect(checkDefinition({ alcance: ["*"], estilo: { publicar: { x: 1 } } })).toBe("plantilla:estilo");
    });
  });

  describe("templateName", () => {
    it("extrae nombre de plantilla válida", () => {
      expect(templateName("PLANTILLAS/plantilla-base.md")).toBe("base");
      expect(templateName("PLANTILLAS/plantilla-mi-doc-2.md")).toBe("mi-doc-2");
    });

    it("rechaza rutas inválidas", () => {
      expect(templateName("PLANTILLAS/base.md")).toBeNull();
      expect(templateName("PLANTILLAS/plantilla-.md")).toBeNull();
      expect(templateName("PLANTILLAS/plantilla-Base.md")).toBeNull();
      expect(templateName("PLANTILLAS/INDICE.md")).toBeNull();
      expect(templateName("Otra/plantilla-base.md")).toBeNull();
    });
  });

  describe("templatePath", () => {
    it("genera ruta canónica", () => {
      expect(templatePath("base")).toBe("PLANTILLAS/plantilla-base.md");
      expect(templatePath("mi-doc-2")).toBe("PLANTILLAS/plantilla-mi-doc-2.md");
    });
  });

  describe("checkRef", () => {
    it("valida atributo plantilla", () => {
      expect(checkRef("base")).toBeNull();
      expect(checkRef("mi-doc-2")).toBeNull();
      expect(checkRef("Base")).toBe("plantilla");
      expect(checkRef("a_b")).toBe("plantilla");
      expect(checkRef("")).toBe("plantilla");
    });
  });

  describe("appliesTo", () => {
    it("aplica con alcance *", () => {
      expect(appliesTo(["*"], "Cualquiera")).toBe(true);
      expect(appliesTo(["*"], "Proyectos/Sub")).toBe(true);
    });

    it("aplica con carpeta exacta o subcarpeta", () => {
      expect(appliesTo(["Proyectos"], "Proyectos")).toBe(true);
      expect(appliesTo(["Proyectos"], "proyectos/Sub")).toBe(true);
      expect(appliesTo(["Proyectos"], "Otros")).toBe(false);
    });
  });

  describe("isMetaFolder", () => {
    it("identifica carpetas reservadas", () => {
      expect(isMetaFolder("PLANTILLAS")).toBe(true);
      expect(isMetaFolder("BITACORA")).toBe(true);
      expect(isMetaFolder("AG - SKILLS")).toBe(true);
    });

    it("rechaza rutas con subcarpeta", () => {
      expect(isMetaFolder("PLANTILLAS/x")).toBe(false);
      expect(isMetaFolder("BITACORA/2026-11/x")).toBe(false);
    });
  });

  describe("isTemplateZone", () => {
    it("identifica zona de plantillas", () => {
      expect(isTemplateZone("PLANTILLAS/plantilla-base.md")).toBe(true);
      expect(isTemplateZone("PLANTILLAS/sub/x.md")).toBe(true);
    });

    it("rechaza INDICE y fuera de PLANTILLAS", () => {
      expect(isTemplateZone("PLANTILLAS/INDICE.md")).toBe(false);
      expect(isTemplateZone("Otra/x.md")).toBe(false);
    });
  });
});
