// scripts/helpers/html-escape.mjs — PURE. The one HTML escaper for hand-built markup.
//
// Several places build HTML as template literals rather than through Handlebars: the promptTest
// dialog rows and the Requisition chat cards both interpolate user-authored strings (item names,
// actor names) straight into markup. Those strings must be escaped, and they must be escaped the
// SAME way everywhere — a text-context escaper that skips `"` is indistinguishable at the call site
// from an attribute-safe one, so keeping two of them is how a quote eventually breaks out of a
// `value="…"`. There is exactly one, and it is safe in both contexts.
//
// Handlebars templates already escape `{{expr}}` themselves; this is only for hand-built strings.

// The set is `& < > "` — exactly the union of what the call sites need. `'` is deliberately left
// alone: every attribute this builds is double-quoted, so escaping it would only churn the output
// of the two existing sites without making anything safer.

/** Escape `& < > "` so `value` is safe in HTML text AND inside a double-quoted attribute. */
export function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
