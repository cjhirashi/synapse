import { expect, test } from "vitest";
import { decorateBitacora } from "./bitacoraAuthors";

const LINE = "- **10:15:00** · aira (agente) · Creó «Plan» · `Proyectos/Plan.md`";
const profiles = {
  aira: { agent_id: "aira", display_name: "Aira · Arquitecta", photo_url: "/agent-profiles/aira/photo?v=2" },
  liza: { agent_id: "liza", display_name: "Liza", photo_url: null },
  emma: { agent_id: "emma", display_name: null, photo_url: "/agent-profiles/emma/photo?v=1" },
  vacio: { agent_id: "vacio", display_name: null, photo_url: null },
};

test("un agente con nombre y foto muestra la foto, su nombre y conserva su id", () => {
  expect(decorateBitacora(LINE, profiles)).toBe(
    "- **10:15:00** · ![Aira · Arquitecta](/agent-profiles/aira/photo?v=2) Aira · Arquitecta (aira, agente) · Creó «Plan» · `Proyectos/Plan.md`",
  );
});

test("solo nombre, solo foto, y sin personalizar: cada caso se queda en lo que tiene", () => {
  expect(decorateBitacora(LINE.replace("aira", "liza"), profiles)).toContain("· Liza (liza, agente) ·");
  expect(decorateBitacora(LINE.replace("aira", "emma"), profiles)).toContain("· ![emma](/agent-profiles/emma/photo?v=1) emma (agente) ·");
  expect(decorateBitacora(LINE.replace("aira", "vacio"), profiles)).toBe(LINE.replace("aira", "vacio"));
  expect(decorateBitacora(LINE.replace("aira", "otro"), profiles)).toBe(LINE.replace("aira", "otro"));
});

test("no toca a las personas, la clave general ni el resto del documento, y escapa el Markdown del nombre", () => {
  const doc = [
    "# Bitácora del 2026-11-13", "", "1 cambio.", "",
    "- **10:00:00** · carlos@x.com (usuario) · Creó · `a.md`",
    "- **10:01:00** · clave general op (clave general) · Creó · `b.md`",
    "- **10:02:00** · sistema (sistema) · Creó · `c.md`",
  ].join("\n");
  expect(decorateBitacora(doc, profiles)).toBe(doc);
  const hostile = { aira: { agent_id: "aira", display_name: "**x** [y](javascript:z) <b>", photo_url: null } };
  const out = decorateBitacora(LINE, hostile);
  expect(out).toContain("\\*\\*x\\*\\* \\[y\\]\\(javascript:z\\) \\<b\\>");
  expect(out).not.toContain("[y](javascript");
});
