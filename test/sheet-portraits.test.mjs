// test/sheet-portraits.test.mjs
//
// Clicking a portrait / item icon did nothing on any of the three sheets. The <img> carried only
// `data-edit="img"`, which is what tells Foundry WHICH field the image belongs to (and is what gets
// the path into the submitted form data). ApplicationV2 opens the image picker from a click only
// through an action: the element also needs `data-action="editImage"`, the action DocumentSheetV2
// registers for exactly this. Nothing else in the system wires an image picker.
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const read = (rel) => readFileSync(fileURLToPath(new URL(`../${rel}`, import.meta.url)), "utf8");

describe.each([
  ["templates/actor/actor-sheet.hbs"],
  ["templates/actor/vehicle-sheet.hbs"],
  ["templates/item/item-sheet.hbs"],
])("%s", (template) => {
  it("opens the image picker when the document image is clicked", () => {
    const images = read(template).match(/<img[^>]*data-edit="img"[^>]*>/g) ?? [];

    expect(images, "the sheet's editable image").toHaveLength(1);
    expect(images[0]).toContain('data-action="editImage"');
    expect(images[0]).toContain('src="{{document.img}}"');
  });
});
