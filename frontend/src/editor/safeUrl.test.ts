// SPEC-0008 RF-007: sólo esquemas seguros llegan al DOM del editor.
import { describe, expect, it } from "vitest";
import { safeImageUrl, safeLinkUrl } from "./safeUrl";

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
