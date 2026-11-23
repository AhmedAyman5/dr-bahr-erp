// Enum values the API sends / accepts (English) + their Arabic labels for the UI.
// Send and compare the `value`, show the `label`. The arrays work directly as Select options.
// Source: ../backend/doc/FRONTEND_WEEK1_UPDATE_2.txt (PART 1.3 roles, PART 2 item types).
//
// Usage:
//   <Select options={ITEM_TYPES} ... />
//   getLabel(ITEM_TYPES, product.itemType)  // "STOCK" → "مخزني"

// Product itemType. STOCK is the default.
export const ITEM_TYPES = [
  { value: "STOCK", label: "مخزني" },
  { value: "SERVICE", label: "خدمي" },
];

// User role. Only SUPERADMIN can use the API for now.
export const ROLES = [
  { value: "SUPERADMIN", label: "مدير النظام" },
  { value: "ADMIN", label: "مدير" },
  { value: "ACCOUNTANT", label: "محاسب" },
  { value: "SALES", label: "مبيعات" },
  { value: "USER", label: "مستخدم" },
];

// Arabic label of an enum value, or "-" when it is unknown / empty.
export function getLabel(list, value) {
  return list.find((item) => item.value === value)?.label ?? "-";
}
