// test/ammunition-model.test.mjs
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { BDH } from "../scripts/config.mjs";

const template = JSON.parse(readFileSync(fileURLToPath(new URL("../template.json", import.meta.url)), "utf8"));

describe("ammunition item type", () => {
  it("is a registered item type", () => {
    expect(BDH.itemTypes).toContain("ammunition");
  });

  it("sits next to weaponMod in the list", () => {
    expect(BDH.itemTypes.indexOf("ammunition")).toBe(BDH.itemTypes.indexOf("weaponMod") + 1);
  });

  it("is registered with Foundry's actual subtype registry (template.json)", () => {
    expect(template.Item.types).toContain("ammunition");
  });
});
