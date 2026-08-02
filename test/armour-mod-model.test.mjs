// test/armour-mod-model.test.mjs
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { BDH } from "../scripts/config.mjs";

const template = JSON.parse(readFileSync(fileURLToPath(new URL("../template.json", import.meta.url)), "utf8"));

describe("armourMod item type", () => {
  it("is a registered item type", () => {
    expect(BDH.itemTypes).toContain("armourMod");
  });

  it("sits next to armour in the list", () => {
    expect(BDH.itemTypes.indexOf("armourMod")).toBe(BDH.itemTypes.indexOf("armour") + 1);
  });

  it("is registered with Foundry's actual subtype registry (template.json)", () => {
    expect(template.Item.types).toContain("armourMod");
  });

  it("has a template.json stanza so Foundry can instantiate it", () => {
    expect(template.Item.armourMod).toBeDefined();
  });
});
