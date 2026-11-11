// SPEC-0008 RF-007: sólo esquemas seguros llegan al DOM del editor.
import { describe, expect, it } from "vitest";
import { isExternalHttpLink, safeImageUrl, safeLinkUrl } from "./safeUrl";

describe("safeLinkUrl", () => {
  // RF-007
  it.each(["http://a.test/x", "https://a.test", "mailto:a@b.test", "MAILTO:a@b.test", "HTTPS://A.TEST"])(
    "admite %s",
    (url) => expect(safeLinkUrl(url)).toBe(url),
  );

  // RF-007
  it.each(["otra-nota.md", "../a/b.md", "/vaults/x", "#ancla", "?q=1", ""])("admite el relativo %j", (url) =>
    expect(safeLinkUrl(url)).toBe(url),
  );

  // RF-007
  it.each([
    "javascript:alert(1)",
    "JaVaScRiPt:alert(1)",
    "  javascript:alert(1)",
    "\tjava\nscript:alert(1)",
    "data:text/html,<b>x</b>",
    "DATA:text/html;base64,AAAA",
    "vbscript:msgbox(1)",
    " VBScript:msgbox(1)",
    "file:///etc/passwd",
  ])("quita %j", (url) => expect(safeLinkUrl(url)).toBe(""));
});

describe("safeImageUrl", () => {
  // RF-007
  it.each(["http://a.test/i.png", "https://a.test/i.png", "HTTPS://A.TEST/i.png"])("admite %s", (url) =>
    expect(safeImageUrl(url)).toBe(url),
  );

  // RF-007
  it.each(["mailto:a@b.test", "javascript:alert(1)", "data:image/png;base64,AAAA", " vbscript:x", "rel/i.png"])(
    "quita %j",
    (url) => expect(safeImageUrl(url)).toBe(""),
  );
});

describe("isExternalHttpLink", () => {
  it.each(["http://a.test", "https://a.test/x", "HTTPS://A.TEST"])("%s abre en pestaña nueva", (url) =>
    expect(isExternalHttpLink(url)).toBe(true),
  );
  it.each(["nota.md", "/vaults/1", "mailto:a@b.test", "#h", "javascript:alert(1)"])("%s no", (url) =>
    expect(isExternalHttpLink(url)).toBe(false),
  );
});
