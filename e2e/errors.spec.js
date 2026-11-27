// Unit checks of utils/errors.js and the Week 2 enums of utils/labels.js.
// Plain functions: they run in Node, without a browser page (so `test` comes straight from Playwright,
// not from ./helpers — there is no page that could log console errors).
// The pages that use them are tested in their own spec files.
import { test, expect } from "@playwright/test";
import { getErrorMessage, getLineError } from "../src/utils/errors.js";
import {
  DOCUMENT_STATUSES,
  MOVEMENT_TYPES,
  PAYMENT_TYPES,
  QUOTATION_STATUSES,
  getLabel,
} from "../src/utils/labels.js";

// An axios-like error with the backend's error body.
function apiError(code, field = null) {
  return { response: { data: { statusCode: 400, message: "English text", error: "Bad Request", code, field } } };
}

test.describe("getErrorMessage", () => {
  test("Week 2 codes have their Arabic message", () => {
    expect(getErrorMessage(apiError("INVALID_STATUS", "status"))).toBe("لا يمكن تنفيذ العملية في حالة المستند الحالية");
    expect(getErrorMessage(apiError("INSUFFICIENT_STOCK"))).toBe("الكمية المتاحة في المخزن غير كافية");
    expect(getErrorMessage(apiError("QUANTITY_EXCEEDED"))).toBe("الكمية أكبر من المسموح بإرجاعه");
  });

  test('a line field "lines.N.<field>" adds the line number (N + 1) and uses the field label', () => {
    expect(getErrorMessage(apiError("INSUFFICIENT_STOCK", "lines.2.quantity"))).toBe(
      "البند رقم 3: الكمية المتاحة في المخزن غير كافية",
    );
    expect(getErrorMessage(apiError("QUANTITY_EXCEEDED", "lines.0.quantity"))).toBe(
      "البند رقم 1: الكمية أكبر من المسموح بإرجاعه",
    );
    expect(getErrorMessage(apiError("DOES_NOT_EXIST", "lines.1.productId"))).toBe("البند رقم 2: الصنف غير موجود أو محذوف");
    // (expiryDate has its own text now: see "purchase invoices" below.)
    expect(getErrorMessage(apiError("VALIDATION_FAILED", "lines.11.unitCost"))).toBe(
      "البند رقم 12: البيانات المدخلة غير صحيحة، راجع حقل سعر شراء الوحدة",
    );
    // An unknown line field: the neutral label, never English.
    expect(getErrorMessage(apiError("VALIDATION_FAILED", "lines.0.somethingNew"))).toBe(
      "البند رقم 1: البيانات المدخلة غير صحيحة، راجع حقل أحد الحقول",
    );
  });

  test("Week 2 header fields have Arabic labels", () => {
    const cases = {
      invoiceDate: "تاريخ الفاتورة",
      quotationDate: "تاريخ العرض",
      returnDate: "تاريخ المرتجع",
      validUntil: "صالح حتى",
      dueDate: "تاريخ الاستحقاق",
      warehouseId: "المخزن",
      currencyId: "العملة",
      exchangeRate: "سعر الصرف",
      paidAmount: "المدفوع",
      refundAmount: "المبلغ المسترد",
      pageSize: "عدد الصفوف في الصفحة",
    };
    for (const [field, label] of Object.entries(cases)) {
      expect(getErrorMessage(apiError("VALIDATION_FAILED", field))).toBe(`البيانات المدخلة غير صحيحة، راجع حقل ${label}`);
    }
    expect(getErrorMessage(apiError("DOES_NOT_EXIST", "supplierId"))).toBe("المورد غير موجود أو محذوف");
  });

  test("code + field messages of the Week 1 screens (header fields only)", () => {
    expect(getErrorMessage(apiError("BAD_REQUEST", "productId"))).toBe("الأصناف الخدمية ليس لها مخزون");
    expect(getErrorMessage(apiError("BAD_REQUEST", "itemType"))).toBe("لا يمكن تحويل الصنف إلى خدمي وهو موجود في مخزن");
    expect(getErrorMessage(apiError("BAD_REQUEST", "primaryItemUnitId"))).toBe(
      "لا يمكن تغيير الوحدة الأساسية بعد استخدام الصنف (له حركات مخزن أو وحدات)",
    );
    expect(getErrorMessage(apiError("BAD_REQUEST", "branchId"))).toBe("فرع المستخدم يجب أن يكون نفس فرع الموظف");
    expect(getErrorMessage(apiError("ALREADY_EXISTS", "productId"))).toBe(
      "هذا الصنف موجود بالفعل في هذا المخزن، عدّل الكمية بدلاً من إضافته",
    );
    expect(getErrorMessage(apiError("BELONGS_TO_DELETED", "email"))).toBe("هذا البريد مرتبط بمستخدم محذوف");
    // A server-generated (random) code that is already taken: the user never typed a code.
    expect(getErrorMessage(apiError("ALREADY_EXISTS", "code"))).toBe("تعذر إنشاء كود تلقائي، اضغط حفظ مرة أخرى");
    // Other fields keep the general text.
    expect(getErrorMessage(apiError("ALREADY_EXISTS", "barcode"))).toBe("الباركود مستخدم بالفعل، اختر قيمة أخرى");
    // The same field inside a document line is NOT the stock message (SERVICE lines are allowed).
    expect(getErrorMessage(apiError("BAD_REQUEST", "lines.0.productId"))).toBe(
      "البند رقم 1: لا يمكن تنفيذ الطلب، راجع البيانات وحاول مرة أخرى",
    );
  });

  test("product units: header itemUnitId vs a document line's itemUnitId (same code, two meanings)", () => {
    // On the product-units endpoints (header field) BAD_REQUEST means "this is the primary unit".
    expect(getErrorMessage(apiError("BAD_REQUEST", "itemUnitId"))).toBe(
      "هذه هي الوحدة الأساسية للصنف (معاملها 1) ولا يمكن إضافتها مرة أخرى",
    );
    // In a document line it means "this unit is not defined for this product".
    expect(getErrorMessage(apiError("BAD_REQUEST", "lines.1.itemUnitId"))).toBe(
      "البند رقم 2: هذه الوحدة غير معرفة لهذا الصنف",
    );
    expect(getErrorMessage(apiError("ALREADY_EXISTS", "itemUnitId"))).toBe("هذه الوحدة معرفة بالفعل لهذا الصنف");
    expect(getErrorMessage(apiError("DOES_NOT_EXIST", "itemUnitId"))).toBe("الوحدة غير موجودة أو محذوفة");
    expect(getErrorMessage(apiError("BELONGS_TO_DELETED", "itemUnitId"))).toBe(
      "هذه الوحدة كانت مضافة وحُذفت، أضفها من جديد من زر إضافة وحدة",
    );
  });

  test("purchase quotations: header code + field messages (CODE_FIELD_AR)", () => {
    expect(getErrorMessage(apiError("VALIDATION_FAILED", "lines"))).toBe("يجب إضافة بند واحد على الأقل");
    expect(getErrorMessage(apiError("BAD_REQUEST", "warehouseId"))).toBe("المخزن يجب أن يكون تابعًا لنفس الفرع");
    expect(getErrorMessage(apiError("BAD_REQUEST", "validUntil"))).toBe("تاريخ الصلاحية لا يمكن أن يكون قبل تاريخ العرض");
    expect(getErrorMessage(apiError("BAD_REQUEST", "discountValue"))).toBe("قيمة الخصم أكبر من الإجمالي");
    expect(getErrorMessage(apiError("BAD_REQUEST", "currencyId"))).toBe("لا توجد عملة أساسية، أضف عملة أولًا");
    // Unchanged: VALIDATION_FAILED on these fields keeps the general text (the convert modal has its own message
    // for warehouseId; a percent above 100 is answered by the DTO with VALIDATION_FAILED).
    expect(getErrorMessage(apiError("VALIDATION_FAILED", "warehouseId"))).toBe(
      "البيانات المدخلة غير صحيحة، راجع حقل المخزن",
    );
    expect(getErrorMessage(apiError("VALIDATION_FAILED", "discountPercent"))).toBe(
      "البيانات المدخلة غير صحيحة، راجع حقل نسبة الخصم",
    );
    expect(getErrorMessage(apiError("DOES_NOT_EXIST", "warehouseId"))).toBe("المخزن غير موجود أو محذوف");
  });

  test("purchase quotations: line code + field messages (LINE_CODE_FIELD_AR), true for every case", () => {
    // VALIDATION_FAILED on a line discount value = both discounts sent, OR a bad value (negative, 5 decimals).
    expect(getErrorMessage(apiError("VALIDATION_FAILED", "lines.1.discountValue"))).toBe(
      "البند رقم 2: قيمة خصم البند غير صحيحة",
    );
    // BAD_REQUEST = the discount is bigger than quantity × price.
    expect(getErrorMessage(apiError("BAD_REQUEST", "lines.0.discountValue"))).toBe("البند رقم 1: الخصم أكبر من قيمة البند");
    // VALIDATION_FAILED on a quantity = 0, negative or more than 4 decimals.
    expect(getErrorMessage(apiError("VALIDATION_FAILED", "lines.2.quantity"))).toBe(
      "البند رقم 3: الكمية يجب أن تكون أكبر من صفر وبحد أقصى 4 أرقام عشرية",
    );
    // A header discountValue is not a line: its own message.
    expect(getErrorMessage(apiError("VALIDATION_FAILED", "discountValue"))).toBe(
      "البيانات المدخلة غير صحيحة، راجع حقل قيمة الخصم",
    );
    // Other line codes on these fields are unchanged.
    expect(getErrorMessage(apiError("INSUFFICIENT_STOCK", "lines.0.quantity"))).toBe(
      "البند رقم 1: الكمية المتاحة في المخزن غير كافية",
    );
  });

  test("purchase invoices: header and line code + field messages", () => {
    // exchangeRate: a foreign currency without a rate OR the default currency with a rate ≠ 1 (one text for both).
    expect(getErrorMessage(apiError("BAD_REQUEST", "exchangeRate"))).toBe(
      "سعر الصرف مطلوب للعملة غير الأساسية (والعملة الأساسية سعرها 1)",
    );
    expect(getErrorMessage(apiError("BAD_REQUEST", "paidAmount"))).toBe("المدفوع أكبر من صافي الفاتورة");
    expect(getErrorMessage(apiError("BAD_REQUEST", "dueDate"))).toBe("تاريخ الاستحقاق لا يمكن أن يكون قبل تاريخ الفاتورة");
    expect(getErrorMessage(apiError("BAD_REQUEST", "status"))).toBe(
      "لا يمكن إلغاء الفاتورة لأن عليها مرتجع مُرحّل، ألغِ المرتجع أولًا",
    );
    expect(getErrorMessage(apiError("DOES_NOT_EXIST", "currencyId"))).toBe("العملة غير موجودة أو محذوفة");
    // A wrong status is another code (409): its own general text, never the return message.
    expect(getErrorMessage(apiError("INVALID_STATUS", "status"))).toBe("لا يمكن تنفيذ العملية في حالة المستند الحالية");
    // VALIDATION_FAILED on these header fields (a bad number from the DTO) keeps the general text.
    expect(getErrorMessage(apiError("VALIDATION_FAILED", "exchangeRate"))).toBe(
      "البيانات المدخلة غير صحيحة، راجع حقل سعر الصرف",
    );
    expect(getErrorMessage(apiError("VALIDATION_FAILED", "paidAmount"))).toBe("البيانات المدخلة غير صحيحة، راجع حقل المدفوع");
    // A line without the expiry date its product needs (create / update / post).
    expect(getErrorMessage(apiError("VALIDATION_FAILED", "lines.2.expiryDate"))).toBe(
      "البند رقم 3: تاريخ الصلاحية مطلوب لهذا الصنف",
    );
    expect(getLineError(apiError("VALIDATION_FAILED", "lines.2.expiryDate"))).toEqual({ lineIndex: 2, field: "expiryDate" });
    // The batch number (max 50) keeps the general text with its label.
    expect(getErrorMessage(apiError("VALIDATION_FAILED", "lines.0.batchNumber"))).toBe(
      "البند رقم 1: البيانات المدخلة غير صحيحة، راجع حقل رقم التشغيلة",
    );
  });

  test("purchase returns: header and line code + field messages", () => {
    expect(getErrorMessage(apiError("BAD_REQUEST", "purchaseInvoiceId"))).toBe("يجب اختيار فاتورة شراء مُرحّلة");
    // Feminine (فاتورة), not the general "غير موجود".
    expect(getErrorMessage(apiError("DOES_NOT_EXIST", "purchaseInvoiceId"))).toBe("فاتورة الشراء غير موجودة أو محذوفة");
    expect(getErrorMessage(apiError("BAD_REQUEST", "supplierId"))).toBe("المورد يجب أن يكون مورد الفاتورة");
    expect(getErrorMessage(apiError("BAD_REQUEST", "refundAmount"))).toBe("المبلغ المسترد أكبر من صافي المرتجع");
    expect(getErrorMessage(apiError("BAD_REQUEST", "lines.1.purchaseInvoiceLineId"))).toBe(
      "البند رقم 2: هذا البند ليس من بنود الفاتورة",
    );
    expect(getErrorMessage(apiError("QUANTITY_EXCEEDED", "lines.0.quantity"))).toBe(
      "البند رقم 1: الكمية أكبر من المسموح بإرجاعه",
    );
    // The other codes on these fields keep the general texts.
    expect(getErrorMessage(apiError("DOES_NOT_EXIST", "supplierId"))).toBe("المورد غير موجود أو محذوف");
    expect(getErrorMessage(apiError("VALIDATION_FAILED", "refundAmount"))).toBe(
      "البيانات المدخلة غير صحيحة، راجع حقل المبلغ المسترد",
    );
  });

  test("unchanged basics: no response, login, unknown code", () => {
    expect(getErrorMessage(new Error("Network Error"))).toBe("تعذر الاتصال بالخادم، تحقق من الاتصال وحاول مرة أخرى");
    expect(getErrorMessage(apiError("UNAUTHORIZED"), { context: "login" })).toBe("اسم المستخدم أو كلمة المرور غير صحيحة");
    expect(getErrorMessage(apiError("SOMETHING_NEW", "name"))).toBe("حدث خطأ غير متوقع، حاول مرة أخرى لاحقاً");
  });
});

test.describe("getLineError", () => {
  test("returns { lineIndex, field } for a line field, null otherwise", () => {
    expect(getLineError(apiError("INSUFFICIENT_STOCK", "lines.2.quantity"))).toEqual({ lineIndex: 2, field: "quantity" });
    expect(getLineError(apiError("DOES_NOT_EXIST", "lines.0.productId"))).toEqual({ lineIndex: 0, field: "productId" });
    expect(getLineError(apiError("VALIDATION_FAILED", "lines"))).toBeNull();
    expect(getLineError(apiError("INVALID_STATUS", "status"))).toBeNull();
    expect(getLineError(apiError("NOT_FOUND", null))).toBeNull();
    expect(getLineError(new Error("Network Error"))).toBeNull();
  });
});

test.describe("Week 2 enums", () => {
  test("values (sent / compared) and Arabic labels (shown)", () => {
    expect(QUOTATION_STATUSES.map((item) => item.value)).toEqual(["DRAFT", "SENT", "ACCEPTED", "REJECTED", "CONVERTED"]);
    expect(getLabel(QUOTATION_STATUSES, "CONVERTED")).toBe("تم التحويل لفاتورة");
    expect(DOCUMENT_STATUSES.map((item) => item.label)).toEqual(["مسودة", "مُرحّل", "ملغي"]);
    expect(getLabel(PAYMENT_TYPES, "CREDIT")).toBe("آجل");
    expect(MOVEMENT_TYPES.map((item) => item.value)).toEqual([
      "OPENING",
      "ADJUSTMENT",
      "PURCHASE",
      "PURCHASE_CANCEL",
      "PURCHASE_RETURN",
      "PURCHASE_RETURN_CANCEL",
    ]);
    expect(getLabel(MOVEMENT_TYPES, "PURCHASE_CANCEL")).toBe("إلغاء فاتورة شراء");
    expect(getLabel(MOVEMENT_TYPES, "UNKNOWN")).toBe("-");
  });
});
