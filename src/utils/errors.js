// Turns any API error into an Arabic message for the user.
// Uses the stable backend "code" + "field" — never the English "message".
// Source: ../backend/doc/FRONTEND_WEEK1_UPDATE_2.txt (PART 4) + FRONTEND_WEEK1_UPDATE_3.txt (PART 2, 3).
//
// Usage:
//   setError(getErrorMessage(err));
//   setError(getErrorMessage(err, { context: "login" }));

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
  costPrice: "سعر التكلفة",
  hireDate: "تاريخ التعيين",
  phone: "الهاتف",
  taxNumber: "الرقم الضريبي",
  commercialRecord: "السجل التجاري",
  contactPerson: "الشخص المسؤول",
  creditLimit: "الحد الائتماني",
  openingBalance: "الرصيد الافتتاحي",
};

const UNKNOWN_FIELD_AR = "أحد الحقول";
const NETWORK_ERROR_AR = "تعذر الاتصال بالخادم، تحقق من الاتصال وحاول مرة أخرى";
const LOGIN_FAILED_AR = "اسم المستخدم أو كلمة المرور غير صحيحة";
const PRODUCT_IN_INVENTORY_AR =
  "هذا الصنف موجود بالفعل في هذا المخزن، عدّل الكمية بدلاً من إضافته";
const BRANCH_MISMATCH_AR = "فرع المستخدم يجب أن يكون نفس فرع الموظف";
// A deleted user keeps its employee / email (UPDATE_3 PART 6.3), so they can't be reused yet.
const BELONGS_TO_DELETED_USER_AR = {
  employeeId: "هذا الموظف مرتبط بمستخدم محذوف",
  email: "هذا البريد مرتبط بمستخدم محذوف",
};

export function getErrorMessage(error, options = {}) {
  // No response at all → server is down or there is no network.
  if (!error?.response) {
    return NETWORK_ERROR_AR;
  }

  const { code, field } = error.response.data || {};

  if (code === "UNAUTHORIZED" && options.context === "login") {
    return LOGIN_FAILED_AR;
  }

  // Special case: product already in this inventory (product stock page).
  if (code === "ALREADY_EXISTS" && field === "productId") {
    return PRODUCT_IN_INVENTORY_AR;
  }

  // Special case: employee / email still kept by a deleted user (users page).
  if (code === "BELONGS_TO_DELETED" && BELONGS_TO_DELETED_USER_AR[field]) {
    return BELONGS_TO_DELETED_USER_AR[field];
  }

  // Special case: a user linked to an employee must be in the employee's branch (users page).
  if (code === "BAD_REQUEST" && field === "branchId") {
    return BRANCH_MISMATCH_AR;
  }

  const template = ERROR_AR[code] || ERROR_AR.INTERNAL_ERROR;
  const fieldLabel = FIELD_AR[field] || UNKNOWN_FIELD_AR;
  return template.replace("{field}", fieldLabel);
}
