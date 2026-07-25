// test/ammunition-model.test.mjs
import { describe, it, expect } from "vitest";
import { BDH } from "../scripts/config.mjs";

describe("ammunition item type", () => {
  it("is a registered item type", () => {
    expect(BDH.itemTypes).toContain("ammunition");
  });

  it("sits next to weaponMod in the list", () => {
    expect(BDH.itemTypes.indexOf("ammunition")).toBe(BDH.itemTypes.indexOf("weaponMod") + 1);
  });
});
