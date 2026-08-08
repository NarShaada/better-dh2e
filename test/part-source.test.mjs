import { describe, it, expect, vi } from "vitest";
import { createPartSource } from "../scripts/helpers/part-source.mjs";

/** A host Item whose `parent` is an actor that records what it was asked to create. */
function hostOnActor(created = { id: "made" }) {
  const calls = [];
  const parent = { createEmbeddedDocuments: async (type, data) => { calls.push([type, data]); return [created]; } };
  return { host: { parent }, calls };
}

describe("createPartSource", () => {
  it("creates the source on the host's actor when the host has one", async () => {
    const { host, calls } = hostOnActor({ id: "ammo1" });
    const folder = vi.fn();
    const createWorld = vi.fn();
    const out = await createPartSource(host, { name: "New Ammo", type: "ammunition" }, { folder, createWorld });

    expect(out).toEqual({ id: "ammo1" });
    expect(calls).toEqual([["Item", [{ name: "New Ammo", type: "ammunition" }]]]);
    expect(createWorld).not.toHaveBeenCalled();
  });

  it("never touches the folder on the embedded branch — Folder.create is GM-gated too", async () => {
    const { host } = hostOnActor();
    const folder = vi.fn();
    await createPartSource(host, { name: "x", type: "weaponMod" }, { folder, createWorld: vi.fn() });
    expect(folder).not.toHaveBeenCalled();
  });

  it("creates a world Item in the folder when the host has no parent", async () => {
    const folder = vi.fn(async () => ({ id: "folder7" }));
    const createWorld = vi.fn(async (d) => ({ id: "world1", ...d }));
    const out = await createPartSource({ parent: null }, { name: "Bolt", type: "ammunition" }, { folder, createWorld });

    expect(folder).toHaveBeenCalledTimes(1);
    expect(createWorld).toHaveBeenCalledWith({ name: "Bolt", type: "ammunition", folder: "folder7" });
    expect(out.id).toBe("world1");
  });

  it("returns null when the embedded create yields nothing, so the caller can bail", async () => {
    const host = { parent: { createEmbeddedDocuments: async () => [] } };
    const out = await createPartSource(host, { name: "x", type: "weaponMod" }, { folder: vi.fn(), createWorld: vi.fn() });
    expect(out).toBeNull();
  });

  it("returns null when the world create yields nothing", async () => {
    const out = await createPartSource({ parent: null }, { name: "x", type: "weaponMod" },
      { folder: async () => ({ id: "f" }), createWorld: async () => null });
    expect(out).toBeNull();
  });
});
