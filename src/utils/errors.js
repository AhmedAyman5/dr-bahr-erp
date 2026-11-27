// Turns any API error into an Arabic message for the user.
// Uses the stable backend "code" + "field" — never the English "message".
// Sources: ../backend/doc/week1/00-overview.txt, ../backend/doc/week2/00-overview.txt and week2flow.txt.
//
// Usage:
//   setError(getErrorMessage(err));
//   setError(getErrorMessage(err, { context: "login" }));
//
// Week 2 document lines: the field is "lines.N.<field>" (N starts at 0), e.g. "lines.2.quantity"
// → "البند رقم 3: الكمية المتاحة في المخزن غير كافية". To highlight that row in a form:
//   const lineError = getLineError(err); // { lineIndex: 2, field: "quantity" } or null

const ERROR_AR = {
  VALIDATION_FAILED: "البيانات المدخلة غير صحيحة، راجع حقل {field}",
  // An id in the body points to a missing OR deleted record, e.g. "الفرع غير موجود أو محذوف".
  DOES_NOT_EXIST: "{field} غير موجود أو محذوف",
  BAD_REQUEST: "لا يمكن تنفيذ الطلب، راجع البيانات وحاول مرة أخرى",
  UNAUTHORIZED: "يجب تسجيل الدخول أولاً",
  FORBIDDEN: "ليس لديك صلاحية للقيام بهذا الإجراء",
  NOT_FOUND: "العنصر المطلوب غير موجود أو تم حذفه",
  ALREADY_EXISTS: "{field} مستخدم بالفعل، اختر قيمة أخرى",
  BELONGS_TO_DELETED: "{field} مرتبط بسجل محذوف ولا يمكن استخدامه",
  INTERNAL_ERROR: "حدث خطأ غير متوقع، حاول مرة أخرى لاحقاً",
  // Week 2: documents and stock.
  INVALID_STATUS: "لا يمكن تنفيذ العملية في حالة المستند الحالية",
  INSUFFICIENT_STOCK: "الكمية المتاحة في المخزن غير كافية",
  QUANTITY_EXCEEDED: "الكمية أكبر من المسموح بإرجاعه",
};

const FIELD_AR = {
  username: "اسم المستخدم",
  password: "كلمة المرور",
  email: "البريد الإلكتروني",
  role: "الصلاحية",
  employeeId: "الموظف",
  branchId: "الفرع",
  nationalId: "الرقم القومي",
  fullName: "الاسم بالكامل",
  name: "الاسم",
  address: "العنوان",
  barcode: "الباركود",
  categoryId: "التصنيف",
  primaryItemUnitId: "الوحدة الأساسية",
  productId: "الصنف",
  itemType: "نوع الصنف",
  costingMethod: "طريقة حساب التكلفة",
  retailPrice: "سعر التجزئة",
  wholesalePrice: "سعر الجملة",
  bulkWholesalePrice: "سعر جملة الجملة",
  reorderLimit: "حد إعادة الطلب",
  hasExpiryDate: "تاريخ الصلاحية",
  quantity: "الكمية",
  // Week 2: the stock cost is the weighted average cost.
  costPrice: "متوسط التكلفة",
  hireDate: "تاريخ التعيين",
  phone: "الهاتف",
  taxNumber: "الرقم الضريبي",
  commercialRecord: "السجل التجاري",
  contactPerson: "الشخص المسؤول",
  creditLimit: "الحد الائتماني",
  openingBalance: "الرصيد الافتتاحي",

  // Week 2 (labels from the module docs in ../backend/doc/week2/).
  code: "الكود",
  symbol: "الرمز",
  isDefault: "العملة الأساسية",
  currencyId: "العملة",
  exchangeRate: "سعر الصرف",
  itemUnitId: "الوحدة",
  factor: "عدد القطع في الوحدة",
  supplierId: "المورد",
  warehouseId: "المخزن",
  quotationDate: "تاريخ العرض",
  validUntil: "صالح حتى",
  invoiceDate: "تاريخ الفاتورة",
  dueDate: "تاريخ الاستحقاق",
  returnDate: "تاريخ المرتجع",
  supplierInvoiceNumber: "رقم فاتورة المورد",
  paymentType: "طريقة الدفع",
  paidAmount: "المدفوع",
  refundAmount: "المبلغ المسترد",
  discountPercent: "نسبة الخصم",
  discountValue: "قيمة الخصم",
  taxPercent: "نسبة الضريبة",
  unitPrice: "سعر الوحدة",
  unitCost: "سعر شراء الوحدة",
  batchNumber: "رقم التشغيلة",
  expiryDate: "تاريخ الصلاحية",
  reason: "السبب",
  notes: "الملاحظات",
  lines: "البنود",
  status: "الحالة",
  purchaseInvoiceId: "فاتورة الشراء",
  purchaseInvoiceLineId: "بند الفاتورة الأصلي",
  // Query string of the paginated lists.
  page: "رقم الصفحة",
  pageSize: "عدد الصفوف في الصفحة",
  dateFrom: "من تاريخ",
  dateTo: "إلى تاريخ",
  type: "نوع الحركة",
  search: "البحث",
};

// One exact message for a code + field pair (wins over the general ERROR_AR text).
// Key: "<code>:<field>". Only header fields here: a line error ("lines.N.<field>") never matches.
const CODE_FIELD_AR = {
  // A create where the SERVER picks the code (branch, category, unit, customer, supplier, employee, product):
  // it picks a random 6-digit code without checking it is free, so it can hit an existing one (backend
  // issue reported to Mazen). The user never typed a code → never "الكود مستخدم بالفعل"; saving again
  // picks a new code. (Currencies: the user types the code → CurrencyFormModal has its own message first.)
  "ALREADY_EXISTS:code": "تعذر إنشاء كود تلقائي، اضغط حفظ مرة أخرى",
  // Product stock: the product is already in this warehouse.
  "ALREADY_EXISTS:productId": "هذا الصنف موجود بالفعل في هذا المخزن، عدّل الكمية بدلاً من إضافته",
  // Product stock: SERVICE products can't be put in a warehouse.
  "BAD_REQUEST:productId": "الأصناف الخدمية ليس لها مخزون",
  // Products: the primary unit is locked once the product has stock movements or product units.
  "BAD_REQUEST:primaryItemUnitId": "لا يمكن تغيير الوحدة الأساسية بعد استخدام الصنف (له حركات مخزن أو وحدات)",
  // Products: a product that is in a warehouse can't become SERVICE.
  "BAD_REQUEST:itemType": "لا يمكن تحويل الصنف إلى خدمي وهو موجود في مخزن",
  // Users: a user linked to an employee must be in the employee's branch.
  "BAD_REQUEST:branchId": "فرع المستخدم يجب أن يكون نفس فرع الموظف",
  // Users: a deleted user keeps its employee / email, so they can't be reused yet.
  "BELONGS_TO_DELETED:employeeId": "هذا الموظف مرتبط بمستخدم محذوف",
  "BELONGS_TO_DELETED:email": "هذا البريد مرتبط بمستخدم محذوف",
  // Product units (product-units.txt). On these endpoints BAD_REQUEST + itemUnitId only means "this is
  // the product's primary unit". Its other meaning ("unit is not defined for this product") only comes
  // from document lines, where the field is "lines.N.itemUnitId" → LINE_CODE_FIELD_AR below.
  "BAD_REQUEST:itemUnitId": "هذه هي الوحدة الأساسية للصنف (معاملها 1) ولا يمكن إضافتها مرة أخرى",
  "ALREADY_EXISTS:itemUnitId": "هذه الوحدة معرفة بالفعل لهذا الصنف",
  "DOES_NOT_EXIST:itemUnitId": "الوحدة غير موجودة أو محذوفة",
  "BELONGS_TO_DELETED:itemUnitId": "هذه الوحدة كانت مضافة وحُذفت، أضفها من جديد من زر إضافة وحدة",
  // Week 2 documents (purchase-quotations.txt; invoices / returns use the same fields).
  // (A percent above 100 never comes as BAD_REQUEST: the DTO's @Max answers first with VALIDATION_FAILED.)
  "VALIDATION_FAILED:lines": "يجب إضافة بند واحد على الأقل",
  "BAD_REQUEST:warehouseId": "المخزن يجب أن يكون تابعًا لنفس الفرع",
  "BAD_REQUEST:validUntil": "تاريخ الصلاحية لا يمكن أن يكون قبل تاريخ العرض",
  "BAD_REQUEST:discountValue": "قيمة الخصم أكبر من الإجمالي",
  // Converting a quotation / an invoice without a currency: there is no default currency.
  "BAD_REQUEST:currencyId": "لا توجد عملة أساسية، أضف عملة أولًا",
  "DOES_NOT_EXIST:currencyId": "العملة غير موجودة أو محذوفة",
  // Purchase invoices (purchase-invoices.txt + the service code).
  // exchangeRate: a foreign currency without a rate, OR the default currency with a rate other than 1.
  "BAD_REQUEST:exchangeRate": "سعر الصرف مطلوب للعملة غير الأساسية (والعملة الأساسية سعرها 1)",
  // آجل: the paid amount is above the net total.
  "BAD_REQUEST:paidAmount": "المدفوع أكبر من صافي الفاتورة",
  // The due date may be the invoice day itself, never before it.
  "BAD_REQUEST:dueDate": "تاريخ الاستحقاق لا يمكن أن يكون قبل تاريخ الفاتورة",
  // Only the invoice cancel sends BAD_REQUEST + status: a POSTED purchase return points to the invoice.
  // (A wrong status is 409 INVALID_STATUS, another code.)
  "BAD_REQUEST:status": "لا يمكن إلغاء الفاتورة لأن عليها مرتجع مُرحّل، ألغِ المرتجع أولًا",
};

// The same idea for a document line ("lines.N.<field>"): key "<code>:<field>" without "lines.N.".
// The result gets the "البند رقم N+1: " prefix like every line error.
const LINE_CODE_FIELD_AR = {
  // The line's unit is neither the product's primary unit nor one of its product units.
  "BAD_REQUEST:itemUnitId": "هذه الوحدة غير معرفة لهذا الصنف",
  // Each text must be true for EVERY case the code can mean:
  // VALIDATION_FAILED on a line discount value = both discounts sent OR a bad value (negative, 5 decimals).
  "VALIDATION_FAILED:discountValue": "قيمة خصم البند غير صحيحة",
  // BAD_REQUEST on a line discount = bigger than quantity × price.
  "BAD_REQUEST:discountValue": "الخصم أكبر من قيمة البند",
  // VALIDATION_FAILED on a quantity = 0, negative or more than 4 decimals.
  "VALIDATION_FAILED:quantity": "الكمية يجب أن تكون أكبر من صفر وبحد أقصى 4 أرقام عشرية",
  // Purchase invoices: the product has an expiry date and the line has none (create / update / post).
  // (A badly formatted date is the same pair, but the form only sends real "YYYY-MM-DD" days.)
  "VALIDATION_FAILED:expiryDate": "تاريخ الصلاحية مطلوب لهذا الصنف",
};

const UNKNOWN_FIELD_AR = "أحد الحقول";
const NETWORK_ERROR_AR = "تعذر الاتصال بالخادم، تحقق من الاتصال وحاول مرة أخرى";
const LOGIN_FAILED_AR = "اسم المستخدم أو كلمة المرور غير صحيحة";

// "lines.2.quantity" → { lineIndex: 2, field: "quantity" }  |  any other field → null
function parseLineField(field) {
  const match = /^lines\.(\d+)\.(\w+)$/.exec(field || "");
  if (!match) return null;
  return { lineIndex: Number(match[1]), field: match[2] };
}

// The document line an error belongs to, so a form can highlight that row.
// getLineError(err) → { lineIndex: 2, field: "quantity" } (lineIndex starts at 0) or null.
export function getLineError(error) {
  return parseLineField(error?.response?.data?.field);
}

export function getErrorMessage(error, options = {}) {
  // No response at all → server is down or there is no network.
  if (!error?.response) {
    return NETWORK_ERROR_AR;
  }

  const { code, field } = error.response.data || {};

  if (code === "UNAUTHORIZED" && options.context === "login") {
    return LOGIN_FAILED_AR;
  }

  const special = CODE_FIELD_AR[`${code}:${field}`];
  if (special) return special;

  // A document line: "البند رقم 3: ..." (the user counts lines from 1).
  const line = parseLineField(field);
  const fieldName = line ? line.field : field;

  const lineSpecial = line ? LINE_CODE_FIELD_AR[`${code}:${fieldName}`] : undefined;

  const template = ERROR_AR[code] || ERROR_AR.INTERNAL_ERROR;
  const fieldLabel = FIELD_AR[fieldName] || UNKNOWN_FIELD_AR;
  const message = lineSpecial || template.replace("{field}", fieldLabel);
  return line ? `البند رقم ${line.lineIndex + 1}: ${message}` : message;
}
