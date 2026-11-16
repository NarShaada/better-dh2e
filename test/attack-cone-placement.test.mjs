// test/attack-cone-placement.test.mjs
//
// Spray and Suppressive Fire minimise every open window so the player can aim a cone on the map,
// then place it with canvas.regions.placeRegion. Two ways that used to end with the whole UI left
// minimised and no attack to show for it:
//   - Foundry v13 (still the declared minimum) has no placeRegion at all, so the call threw after
//     the windows were already down. The blast-aim path feature-detects this; these two did not.
//   - on any version, a placement that REJECTS (no permission to create the template, the canvas
//     torn down mid-gesture) skipped the "restore the windows" line that followed it.
import { describe, it, expect, beforeAll, beforeEach, afterEach } from "vitest";
import { installFoundryStub, resetCaptures, capturedMessages, makeActor, makeWeapon } from "./helpers/foundry-stub.mjs";

let rollAttack, warnings, errors, app, placeRegion;
beforeAll(async () => {
  installFoundryStub({ settings: { enableBattlemap: true } });
  ({ rollAttack } = await import("../scripts/rolls/attack.mjs"));
  placeRegion = canvas.regions.placeRegion;
});
beforeEach(() => {
  resetCaptures();
  warnings = []; errors = [];
  ui.notifications.warn = (m) => warnings.push(String(m));
  ui.notifications.error = (m) => errors.push(String(m));
  // One open window, which records how it was left.
  app = {
    rendered: true, minimized: false, everMinimized: false,
    async minimize() { this.minimized = true; this.everMinimized = true; },
    async maximize() { this.minimized = false; },
  };
  foundry.applications.instances.set("sheet", app);
});
afterEach(() => {
  foundry.applications.instances.clear();
  canvas.regions.placeRegion = placeRegion;
});

/** A flamer in the hands of an actor with a token on the scene. */
function flamer() {
  const weapon = makeWeapon({ system: { qualities: [{ key: "spray", value: null }], range: 20, clip: { value: 6, max: 6 } } });
  const actor = makeActor({ items: [weapon], getActiveTokens: () => [{ center: { x: 100, y: 100 } }] });
  return { actor, weapon };
}

describe("Spray", () => {
  it("on a Foundry without placeRegion: says so, and never minimises the windows", async () => {
    canvas.regions.placeRegion = undefined;
    const { actor, weapon } = flamer();

    await rollAttack(actor, weapon.id);

    expect(app.everMinimized).toBe(false);
    expect(warnings).toHaveLength(1);
    expect(weapon.system.clip.value).toBe(6);          // nothing fired
    expect(capturedMessages()).toEqual([]);
  });

  it("restores the windows when the placement is rejected, and fires nothing", async () => {
    canvas.regions.placeRegion = async () => { throw new Error("User lacks permission to create Region"); };
    const { actor, weapon } = flamer();

    await rollAttack(actor, weapon.id);

    expect(app.everMinimized).toBe(true);
    expect(app.minimized).toBe(false);
    expect(errors).toHaveLength(1);
    expect(weapon.system.clip.value).toBe(6);
  });

  it("restores the windows when the player cancels the placement", async () => {
    canvas.regions.placeRegion = async () => null;
    const { actor, weapon } = flamer();

    await rollAttack(actor, weapon.id);

    expect(app.minimized).toBe(false);
    expect(weapon.system.clip.value).toBe(6);
    expect(errors).toEqual([]);
  });
});
