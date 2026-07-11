import { describe, it, expect } from "vitest";
import { vehicleHitLocation, applyIntegrity } from "../scripts/helpers/vehicle-data.mjs";

describe("vehicleHitLocation", () => {
  it("maps the d100 to the vehicle table", () => {
    expect(vehicleHitLocation(1)).toBe("motive");
    expect(vehicleHitLocation(20)).toBe("motive");
    expect(vehicleHitLocation(21)).toBe("hull");
    expect(vehicleHitLocation(60)).toBe("hull");
    expect(vehicleHitLocation(61)).toBe("weapon");
    expect(vehicleHitLocation(80)).toBe("weapon");
    expect(vehicleHitLocation(81)).toBe("turret");
    expect(vehicleHitLocation(100)).toBe("turret");
  });
});

describe("applyIntegrity", () => {
  it("accumulates like wounds, capped at max, floored at the current value", () => {
    expect(applyIntegrity(0, 35, 12)).toBe(12);
    expect(applyIntegrity(12, 35, 30)).toBe(35);   // capped
    expect(applyIntegrity(10, 35, 0)).toBe(10);     // soaked to 0 → unchanged
    expect(applyIntegrity(10, 35, -5)).toBe(10);    // never heals from a negative
  });
});
