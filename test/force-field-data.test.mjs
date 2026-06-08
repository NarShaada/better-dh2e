import { describe, it, expect } from "vitest";
import { forceFieldResult } from "../scripts/helpers/force-field-data.mjs";

describe("forceFieldResult", () => {
  it("blocks when roll <= protection", () => {
    expect(forceFieldResult(30, 60, 10)).toEqual({ success: true, overload: false });
    expect(forceFieldResult(60, 60, 10)).toEqual({ success: true, overload: false }); // boundary
    expect(forceFieldResult(70, 60, 10)).toEqual({ success: false, overload: false });
  });
  it("overloads when roll <= overload", () => {
    expect(forceFieldResult(5, 60, 10)).toEqual({ success: true, overload: true });
    expect(forceFieldResult(10, 60, 10)).toEqual({ success: true, overload: true }); // boundary
    expect(forceFieldResult(11, 60, 10)).toEqual({ success: true, overload: false });
  });
});
