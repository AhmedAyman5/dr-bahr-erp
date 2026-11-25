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
    expect(getErrorMessage(apiError("VALIDATION_FAILED", "lines.11.expiryDate"))).toBe(
      "البند رقم 12: البيانات المدخلة غير صحيحة، راجع حقل تاريخ الصلاحية",
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
    // The same field inside a document line is NOT the stock message (SERVICE lines are allowed).
    expect(getErrorMessage(apiError("BAD_REQUEST", "lines.0.productId"))).toBe(
      "البند رقم 1: لا يمكن تنفيذ الطلب، راجع البيانات وحاول مرة أخرى",
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
