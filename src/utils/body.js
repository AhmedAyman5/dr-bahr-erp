// Request body helpers, used by the <page>Api.js body builders.
// Source: ../backend/doc/week1/00-overview.txt (rule 5: PATCH with null clears a nullable field).
//
// Usage:
//   address: optionalField(form.address, isEdit),
//
// An optional field the user left empty:
// - create (isEdit = false) → undefined: JSON leaves undefined fields out, so it is not sent.
// - edit   (isEdit = true)  → null: PATCH saves it as empty (clears the old value).
// Never use it for required fields (null → 400) or money / numbers (send 0, see utils/money.js).
export function optionalField(value, isEdit) {
  const text = String(value ?? "").trim();
  if (text) return text;
  return isEdit ? null : undefined;
}
