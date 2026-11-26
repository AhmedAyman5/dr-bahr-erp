// Enum values the API sends / accepts (English) + their Arabic labels for the UI.
// Send and compare the `value`, show the `label`. The arrays work directly as Select options.
// Sources: ../backend/doc/week1/ (item types, roles) and ../backend/doc/week2/numbering.txt (Week 2 enums).
//
// Usage:
//   <Select options={ITEM_TYPES} ... />
//   getLabel(ITEM_TYPES, product.itemType)  // "STOCK" → "مخزني"
//   getLabel(MOVEMENT_TYPES, movement.type) // "ADJUSTMENT" → "تسوية"

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

// Purchase quotation status (عرض سعر شراء). Changed only by the status / convert actions, never sent in a body.
export const QUOTATION_STATUSES = [
  { value: "DRAFT", label: "مسودة" },
  { value: "SENT", label: "مُرسل" },
  { value: "ACCEPTED", label: "مقبول" },
  { value: "REJECTED", label: "مرفوض" },
  { value: "CONVERTED", label: "تم التحويل لفاتورة" },
];

// Purchase invoice / purchase return status. Changed only by the post / cancel actions.
export const DOCUMENT_STATUSES = [
  { value: "DRAFT", label: "مسودة" },
  { value: "POSTED", label: "مُرحّل" },
  { value: "CANCELLED", label: "ملغي" },
];

// Purchase invoice payment type.
export const PAYMENT_TYPES = [
  { value: "CASH", label: "نقدي" },
  { value: "CREDIT", label: "آجل" },
];

// Stock movement type (the lines of the item card / كارت الصنف).
export const MOVEMENT_TYPES = [
  { value: "OPENING", label: "رصيد افتتاحي" },
  { value: "ADJUSTMENT", label: "تسوية" },
  { value: "PURCHASE", label: "شراء" },
  { value: "PURCHASE_CANCEL", label: "إلغاء فاتورة شراء" },
  { value: "PURCHASE_RETURN", label: "مرتجع شراء" },
  { value: "PURCHASE_RETURN_CANCEL", label: "إلغاء مرتجع شراء" },
];

// Movement types that always bring stock IN (+) / take it OUT (−). ADJUSTMENT (تسوية) is in neither list:
// it can be + or − (its quantity says). Used for the badge color (components/ui/MovementTypeBadge).
export const STOCK_IN_TYPES = ["OPENING", "PURCHASE", "PURCHASE_RETURN_CANCEL"];
export const STOCK_OUT_TYPES = ["PURCHASE_RETURN", "PURCHASE_CANCEL"];

// Reasons the backend writes in English → Arabic. Stock from Week 1 got ONE opening movement with the
// reason "Week 1 opening balance" (../backend/doc/week2/stock.txt, "Old (Week 1) stock").
// Remove this when the backend sends the reason in Arabic (question for Mazen).
const MOVEMENT_REASONS_AR = {
  "Week 1 opening balance": "رصيد افتتاحي",
};

// Reason of a stock movement for the screen: formatReason("جرد") → "جرد" | empty → "-".
export function formatReason(reason) {
  if (!reason) return "-";
  return MOVEMENT_REASONS_AR[reason] ?? reason;
}

// Arabic label of an enum value, or "-" when it is unknown / empty.
export function getLabel(list, value) {
  return list.find((item) => item.value === value)?.label ?? "-";
}

// Opening balance (رصيد أول المدة): its sign says who owes whom, with the standard accounting labels.
//   customer:  +  → مدين  "على العميل لنا"   |   −  → دائن  "للعميل علينا"
//   supplier:  +  → دائن  "علينا للمورد"     |   −  → مدين  "لنا عند المورد"
const BALANCE_SIDES = {
  customer: {
    positive: { label: "مدين", meaning: "على العميل لنا" },
    negative: { label: "دائن", meaning: "للعميل علينا" },
  },
  supplier: {
    positive: { label: "دائن", meaning: "علينا للمورد" },
    negative: { label: "مدين", meaning: "لنا عند المورد" },
  },
};

// getBalanceSide("-250.5", "customer") → { label: "دائن", meaning: "للعميل علينا" }
// party: "customer" | "supplier". 0, empty or not a number → null (show the amount only, no label).
export function getBalanceSide(value, party) {
  const number = Number(value);
  if (!Number.isFinite(number) || number === 0) return null;
  return number > 0 ? BALANCE_SIDES[party].positive : BALANCE_SIDES[party].negative;
}
