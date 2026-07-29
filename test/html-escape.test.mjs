// test/html-escape.test.mjs — the single escaper shared by promptTest's field rows and the
// Requisition chat cards. It exists because two near-identical private copies had drifted apart.
import { describe, it, expect } from "vitest";
import { escapeHtml } from "../scripts/helpers/html-escape.mjs";

describe("escapeHtml", () => {
  it("escapes the double quote, so a name cannot break out of value=\"…\"", () => {
    expect(escapeHtml('Bolt" onfocus=x')).toBe("Bolt&quot; onfocus=x");
  });

  it("escapes angle brackets, so a name cannot open a tag in a chat card", () => {
    expect(escapeHtml("<script>")).toBe("&lt;script&gt;");
  });

  it("escapes the ampersand first, so an escaped entity is not double-escaped into nonsense", () => {
    expect(escapeHtml("Bolt & <Pistol>")).toBe("Bolt &amp; &lt;Pistol&gt;");
  });

  it("leaves an apostrophe alone — every attribute it feeds is double-quoted", () => {
    expect(escapeHtml("Emperor's Mercy")).toBe("Emperor's Mercy");
  });

  it("renders null and undefined as an empty string rather than the word", () => {
    expect(escapeHtml(null)).toBe("");
    expect(escapeHtml(undefined)).toBe("");
  });
});
