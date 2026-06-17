// scripts/apps/cover-templates-app.mjs — GM library manager (ApplicationV2) + per-template editor (DialogV2).
import {
  SIDE_KEYS, SIDE_LABELS, LOCATION_KEYS, LOCATION_LABELS,
  newTemplate, validateTemplate, summarizeTemplate, loadLibrary, saveLibrary,
} from "../helpers/cover-templates.mjs";
import { beginCoverPlacement } from "../canvas/cover.mjs";

const { ApplicationV2, HandlebarsApplicationMixin, DialogV2 } = foundry.applications.api;

/** Modal editor for one template. Returns the validated template, or null if cancelled. */
async function editTemplateDialog(template) {
  const sideRow = SIDE_KEYS.map((s) =>
    `<label class="bdh-cover-chk"><input type="checkbox" name="side-${s}" ${template.sides.includes(s) ? "checked" : ""}/> ${SIDE_LABELS[s]}</label>`,
  ).join("");
  const locRow = LOCATION_KEYS.map((l) =>
    `<label class="bdh-cover-chk"><input type="checkbox" name="loc-${l}" ${template.locations.includes(l) ? "checked" : ""}/> ${LOCATION_LABELS[l]}</label>`,
  ).join("");
  const content = `
    <div class="bdh-cover-editor">
      <div class="form-group"><label>Name</label><input type="text" name="name" value="${template.name}" autofocus/></div>
      <div class="form-group"><label>Colour</label><input type="color" name="color" value="${template.color}"/></div>
      <div class="form-group"><label>AP</label><input type="number" name="ap" value="${template.ap}" min="0" step="1"/></div>
      <fieldset><legend>Protected sides</legend><div class="bdh-cover-chks">${sideRow}</div></fieldset>
      <fieldset><legend>Protected locations</legend><div class="bdh-cover-chks">${locRow}</div></fieldset>
    </div>`;
  return DialogV2.prompt({
    window: { title: `Cover Template — ${template.name}` },
    position: { width: 380 },
    content,
    ok: {
      label: "Save",
      callback: (event, button) => {
        const f = new foundry.applications.ux.FormDataExtended(button.form).object;
        return validateTemplate({
          id: template.id,
          name: f.name,
          color: f.color,
          ap: f.ap,
          sides: SIDE_KEYS.filter((s) => f[`side-${s}`]),
          locations: LOCATION_KEYS.filter((l) => f[`loc-${l}`]),
        });
      },
    },
    rejectClose: false,
  });
}

export class CoverTemplatesApp extends HandlebarsApplicationMixin(ApplicationV2) {
  static DEFAULT_OPTIONS = {
    id: "bdh-cover-templates",
    classes: ["bdh-cover-window"],
    window: { title: "Cover Templates", resizable: true },
    position: { width: 460, height: 520 },
    actions: {
      create: CoverTemplatesApp.#onCreate,
      edit: CoverTemplatesApp.#onEdit,
      remove: CoverTemplatesApp.#onRemove,
      place: CoverTemplatesApp.#onPlace,
    },
  };

  static PARTS = { body: { template: "systems/better-dh2e/templates/apps/cover-templates.hbs" } };

  async _prepareContext() {
    const templates = loadLibrary().map((t) => ({ ...t, summary: summarizeTemplate(t) }));
    return { templates };
  }

  #find(id) {
    return loadLibrary().find((t) => t.id === id) ?? null;
  }

  static async #onCreate() {
    const draft = newTemplate(foundry.utils.randomID());
    const saved = await editTemplateDialog(draft);
    if (!saved) return;
    const lib = loadLibrary();
    lib.push({ ...saved, id: draft.id });
    await saveLibrary(lib);
    this.render();
  }

  static async #onEdit(event, target) {
    const id = target.dataset.id;
    const current = this.#find(id);
    if (!current) return;
    const saved = await editTemplateDialog(current);
    if (!saved) return;
    const lib = loadLibrary().map((t) => (t.id === id ? { ...saved, id } : t));
    await saveLibrary(lib);
    this.render();
  }

  static async #onRemove(event, target) {
    const id = target.dataset.id;
    const current = this.#find(id);
    if (!current) return;
    const ok = await DialogV2.confirm({
      window: { title: "Delete Cover Template" },
      content: `<p>Delete the template <b>${current.name}</b>? Cover pieces already on the map are unaffected.</p>`,
      rejectClose: false,
    });
    if (!ok) return;
    await saveLibrary(loadLibrary().filter((t) => t.id !== id));
    this.render();
  }

  static async #onPlace(event, target) {
    const current = this.#find(target.dataset.id);
    if (!current) return;
    await this.minimize();
    beginCoverPlacement(current);
  }
}
