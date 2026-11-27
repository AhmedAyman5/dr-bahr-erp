// Demo data (بيانات تجربة) for Dr. Bahr ERP — run with: npm run seed:demo
//
// Creates a realistic Egyptian import & distribution company through the REAL API (never the
// database directly), so the whole system can be tried without typing data.
//
// Safe to run many times (idempotent): every record is first looked up by a natural key
// (name / currency code / national ID / username / product + unit / document notes); only what is missing is
// created and the existing ids are reused. Opening stock is added only when the product is not in that
// warehouse yet. The script NEVER edits or deletes anything, and never touches EGP or the
// admin account. Documents are only moved on with their own actions (a quotation's status, an invoice's or a
// return's post / cancel) when an earlier run stopped half way.
//
// Needs the backend running (../backend: docker compose up -d). The API URL comes from
// VITE_API_URL in .env.local (fallback http://localhost:3000).
import { readFileSync } from "node:fs";

// ---------------------------------------------------------------------------
// Settings
// ---------------------------------------------------------------------------

const ADMIN = { username: "admin", password: "admin123" };

// One shared password for every demo user (min 6 characters, see ../backend/doc/week1/users.txt).
const DEMO_PASSWORD = "Demo@123";

function readApiUrl() {
  try {
    const text = readFileSync(new URL("../.env.local", import.meta.url), "utf8");
    for (const line of text.split(/\r?\n/)) {
      const match = line.match(/^\s*VITE_API_URL\s*=\s*(.*?)\s*$/);
      if (match && match[1]) return match[1].replace(/^["']|["']$/g, "").replace(/\/+$/, "");
    }
  } catch {
    // No .env.local → use the fallback.
  }
  return "http://localhost:3000";
}

const API_URL = readApiUrl();

// ---------------------------------------------------------------------------
// The demo data
// ---------------------------------------------------------------------------

const CURRENCIES = [
  { code: "USD", name: "دولار أمريكي", symbol: "$" },
  { code: "EUR", name: "يورو", symbol: "€" },
];

const BRANCHES = [
  { name: "فرع القاهرة - مدينة نصر", address: "12 شارع عباس العقاد، مدينة نصر، القاهرة" },
  { name: "فرع الإسكندرية - سموحة", address: "45 شارع فوزي معاذ، سموحة، الإسكندرية" },
  { name: "فرع المنصورة", address: "8 شارع الجمهورية، المنصورة، الدقهلية" },
];

// Warehouses: `branch` = the branch name above.
const WAREHOUSES = [
  { name: "المخزن الرئيسي - العبور", address: "المنطقة الصناعية الأولى، مدينة العبور، القليوبية", branch: "فرع القاهرة - مدينة نصر" },
  { name: "مخزن مدينة نصر", address: "شارع مكرم عبيد، المنطقة السادسة، مدينة نصر، القاهرة", branch: "فرع القاهرة - مدينة نصر" },
  { name: "مخزن سموحة", address: "شارع ألبرت الأول، سموحة، الإسكندرية", branch: "فرع الإسكندرية - سموحة" },
  { name: "مخزن برج العرب", address: "المنطقة الصناعية الثالثة، برج العرب الجديدة، الإسكندرية", branch: "فرع الإسكندرية - سموحة" },
  { name: "مخزن المنصورة", address: "طريق جيهان، المنصورة، الدقهلية", branch: "فرع المنصورة" },
];

const CATEGORIES = ["منظفات", "أدوات العناية الشخصية", "مشروبات", "مواد غذائية", "أدوات منزلية", "خدمات"];

const ITEM_UNITS = ["قطعة", "كرتونة", "علبة", "كيلو", "لتر", "دستة", "شوال"];

// Products. prices = [retail, wholesale, bulk wholesale] (retail ≥ wholesale ≥ bulk).
// reorder = reorder limit (0 = none). expiry = hasExpiryDate. barcode: true → a random 13-digit barcode.
// stock = opening stock: [warehouse name, quantity (in the primary unit), cost price (< wholesale)].
// The four marked "LOW" are put below their reorder limit so the low-stock badge shows.
const W_OBOUR = "المخزن الرئيسي - العبور";
const W_NASR = "مخزن مدينة نصر";
const W_SMOUHA = "مخزن سموحة";
const W_BORG = "مخزن برج العرب";
const W_MANSOURA = "مخزن المنصورة";

const PRODUCTS = [
  // منظفات
  { name: "مسحوق غسيل أوتوماتيك 3 كيلو", category: "منظفات", unit: "قطعة", prices: [285, 265, 250], reorder: 40, barcode: true,
    stock: [[W_OBOUR, 320, 232.5], [W_SMOUHA, 150, 234], [W_MANSOURA, 90, 235]] },
  { name: "سائل غسيل أطباق 1 لتر", category: "منظفات", unit: "قطعة", prices: [55, 49, 46], reorder: 60,
    stock: [[W_OBOUR, 480, 41.25], [W_NASR, 120, 41.5]] },
  { name: "مطهر أرضيات 1 لتر", category: "منظفات", unit: "قطعة", prices: [48, 43, 40], reorder: 50, barcode: true,
    stock: [[W_OBOUR, 260, 36], [W_BORG, 140, 36.5]] },
  { name: "كلور 1 لتر", category: "منظفات", unit: "قطعة", prices: [22, 19, 17.5], reorder: 80,
    stock: [[W_OBOUR, 600, 15.25], [W_SMOUHA, 240, 15.5], [W_MANSOURA, 180, 15.5]] },
  { name: "ملمع زجاج 500 مل", category: "منظفات", unit: "قطعة", prices: [45, 40, 37], reorder: 0, barcode: true,
    stock: [[W_NASR, 75, 33]] },

  // أدوات العناية الشخصية
  { name: "صابون سائل لليدين 500 مل", category: "أدوات العناية الشخصية", unit: "قطعة", prices: [65, 58, 54], reorder: 40, barcode: true,
    stock: [[W_NASR, 15, 48.5]] }, // LOW
  { name: "شامبو 400 مل", category: "أدوات العناية الشخصية", unit: "قطعة", prices: [120, 108, 100], reorder: 30,
    stock: [[W_OBOUR, 180, 89], [W_SMOUHA, 95, 90]] },
  { name: "معجون أسنان 100 مل", category: "أدوات العناية الشخصية", unit: "قطعة", prices: [45, 40, 37], reorder: 50, barcode: true,
    stock: [[W_OBOUR, 300, 32.75], [W_MANSOURA, 110, 33]] },
  { name: "صابون استحمام 125 جم", category: "أدوات العناية الشخصية", unit: "قطعة", prices: [25, 22, 20], reorder: 100,
    stock: [[W_OBOUR, 720, 17.5], [W_BORG, 360, 17.75]] },
  { name: "مزيل عرق 150 مل", category: "أدوات العناية الشخصية", unit: "قطعة", prices: [110, 98, 92], reorder: 0, barcode: true,
    stock: [[W_NASR, 60, 81]] },

  // مشروبات (have an expiry date)
  { name: "شاي 250 جم", category: "مشروبات", unit: "علبة", prices: [95, 86, 80], reorder: 50, expiry: true, barcode: true,
    stock: [[W_OBOUR, 400, 71.5], [W_SMOUHA, 160, 72], [W_MANSOURA, 120, 72]] },
  { name: "قهوة 200 جم", category: "مشروبات", unit: "علبة", prices: [175, 160, 150], reorder: 30, expiry: true,
    stock: [[W_SMOUHA, 12, 138]] }, // LOW
  { name: "مياه معدنية 1.5 لتر", category: "مشروبات", unit: "قطعة", prices: [8, 7, 6.5], reorder: 200, expiry: true, barcode: true,
    stock: [[W_OBOUR, 2400, 5.6], [W_BORG, 1200, 5.65], [W_MANSOURA, 900, 5.7]] },
  { name: "عصير برتقال 1 لتر", category: "مشروبات", unit: "قطعة", prices: [40, 36, 33.5], reorder: 60, expiry: true,
    stock: [[W_OBOUR, 240, 29.5], [W_NASR, 80, 29.75]] },
  { name: "مشروب غازي 1 لتر", category: "مشروبات", unit: "قطعة", prices: [20, 18, 16.75], reorder: 0, expiry: true, barcode: true,
    stock: [[W_SMOUHA, 600, 14.8]] },

  // مواد غذائية (have an expiry date)
  { name: "أرز 5 كيلو", category: "مواد غذائية", unit: "قطعة", prices: [175, 162, 155], reorder: 40, expiry: true, barcode: true,
    stock: [[W_OBOUR, 350, 143], [W_BORG, 200, 144], [W_MANSOURA, 150, 144.5]] },
  { name: "سكر 1 كيلو", category: "مواد غذائية", unit: "كيلو", prices: [35, 32, 30.5], reorder: 300, expiry: true,
    stock: [[W_OBOUR, 1500, 27.25], [W_SMOUHA, 800, 27.5]] },
  { name: "زيت طعام 1 لتر", category: "مواد غذائية", unit: "لتر", prices: [85, 78, 74], reorder: 100, expiry: true, barcode: true,
    stock: [[W_OBOUR, 900, 68.5], [W_MANSOURA, 300, 69]] },
  { name: "مكرونة 400 جم", category: "مواد غذائية", unit: "قطعة", prices: [18, 16, 15], reorder: 150, expiry: true,
    stock: [[W_OBOUR, 1200, 13.2], [W_BORG, 500, 13.3]] },
  { name: "دقيق 50 كيلو", category: "مواد غذائية", unit: "شوال", prices: [1450, 1380, 1340], reorder: 10, expiry: true,
    stock: [[W_MANSOURA, 6, 1260]] }, // LOW
  { name: "عدس أصفر 1 كيلو", category: "مواد غذائية", unit: "كيلو", prices: [75, 68, 65], reorder: 0, expiry: true, barcode: true,
    stock: [[W_NASR, 140, 59.5]] },

  // أدوات منزلية
  { name: "أطباق بلاستيك (50 طبق)", category: "أدوات منزلية", unit: "علبة", prices: [45, 40, 37], reorder: 30,
    stock: [[W_OBOUR, 220, 32], [W_SMOUHA, 90, 32.5]] },
  { name: "مناديل ورقية 500 منديل", category: "أدوات منزلية", unit: "علبة", prices: [30, 27, 25], reorder: 60, barcode: true,
    stock: [[W_NASR, 25, 22]] }, // LOW
  { name: "أكياس قمامة كبيرة (رول 20 كيس)", category: "أدوات منزلية", unit: "قطعة", prices: [28, 25, 23], reorder: 0,
    stock: [[W_OBOUR, 400, 20.5], [W_MANSOURA, 120, 20.75]] },
  { name: "أكواب ورقية", category: "أدوات منزلية", unit: "دستة", prices: [24, 21, 19.5], reorder: 20, barcode: true,
    stock: [[W_BORG, 150, 17]] },

  // خدمات (SERVICE: no stock)
  { name: "خدمة توصيل", category: "خدمات", unit: "قطعة", prices: [150, 125, 100], reorder: 0, service: true },
  { name: "خدمة تركيب", category: "خدمات", unit: "قطعة", prices: [300, 250, 200], reorder: 0, service: true },
];

// Product units (وحدات الصنف, Week 2): "1 كرتونة = 24 قطعة". factor = how many PRIMARY units one
// unit holds (the product's primary unit is never added here). price = the unit's own retail price,
// a bit LOWER than piece price × factor (buying a carton is cheaper). barcode: true → a random barcode.
// Only STOCK products; many STOCK products are left without units on purpose.
const PRODUCT_UNITS = [
  { product: "معجون أسنان 100 مل", units: [
    { unit: "كرتونة", factor: 24, price: 1000, barcode: true }, // 45 × 24 = 1080
    { unit: "دستة", factor: 12, price: 520 }, //                   45 × 12 = 540
  ] },
  { product: "مياه معدنية 1.5 لتر", units: [{ unit: "كرتونة", factor: 6, price: 45, barcode: true }] }, // 8 × 6 = 48
  { product: "أرز 5 كيلو", units: [{ unit: "كرتونة", factor: 4, price: 680 }] }, // primary قطعة: 175 × 4 = 700
  { product: "مسحوق غسيل أوتوماتيك 3 كيلو", units: [{ unit: "كرتونة", factor: 6, price: 1650, barcode: true }] }, // 1710
  { product: "كلور 1 لتر", units: [{ unit: "كرتونة", factor: 12, price: 250 }] }, // 22 × 12 = 264
  { product: "صابون استحمام 125 جم", units: [
    { unit: "دستة", factor: 12, price: 280 }, // 25 × 12 = 300
    { unit: "كرتونة", factor: 72 }, //          no own price
  ] },
  { product: "شاي 250 جم", units: [{ unit: "كرتونة", factor: 20, price: 1820, barcode: true }] }, // primary علبة: 1900
  { product: "سكر 1 كيلو", units: [{ unit: "شوال", factor: 50, price: 1650 }] }, // primary كيلو: 35 × 50 = 1750
];

// Customers: openingBalance + = مدين (على العميل لنا), − = دائن (للعميل علينا), 0 = none.
const CUSTOMERS = [
  { name: "سوبر ماركت النور", phone: "01001234567", taxNumber: "312-456-789", commercialRecord: "125487", address: "شارع مصطفى النحاس، مدينة نصر، القاهرة", creditLimit: 50000, openingBalance: 12500 },
  { name: "صيدلية الشفاء", phone: "01112345678", address: "شارع الحجاز، مصر الجديدة، القاهرة", creditLimit: 20000, openingBalance: 3750.5 },
  { name: "ماركت الأمل", phone: "01223456789", address: "شارع فيصل، الجيزة", creditLimit: 15000, openingBalance: 0 },
  { name: "هايبر الرحمة", phone: "01098765432", taxNumber: "415-782-930", commercialRecord: "88412", address: "طريق النصر، مدينة نصر، القاهرة", creditLimit: 100000, openingBalance: -4200 },
  { name: "سوبر ماركت البحر", phone: "01287654321", taxNumber: "507-218-664", commercialRecord: "45219", address: "شارع خالد بن الوليد، سيدي بشر، الإسكندرية", creditLimit: 40000, openingBalance: 8900 },
  { name: "صيدلية الحياة", phone: "01556789012", address: "شارع سوريا، رشدي، الإسكندرية", creditLimit: 10000, openingBalance: 0 },
  { name: "بقالة الإخلاص", phone: "01012398765", address: "شارع 45، العصافرة، الإسكندرية", creditLimit: 5000, openingBalance: 1250 },
  { name: "سوبر ماركت الدلتا", phone: "01145678901", taxNumber: "623-901-457", commercialRecord: "30981", address: "شارع الجيش، المنصورة، الدقهلية", creditLimit: 60000, openingBalance: 21300.75 },
  { name: "صيدلية الدكتورة منى", phone: "01065432109", address: "شارع قناة السويس، المنصورة، الدقهلية", creditLimit: 8000, openingBalance: -950 },
  { name: "ماركت السلام", phone: "01509876543", address: "شارع بورسعيد، طلخا، الدقهلية", creditLimit: 0, openingBalance: 0 },
];

// Suppliers: openingBalance + = دائن (علينا للمورد), − = مدين (لنا عند المورد), 0 = none.
const SUPPLIERS = [
  { name: "شركة النيل للتجارة والتوزيع", contactPerson: "حسام عبد الحميد", phone: "01001112233", email: "nile.trading@example.com", taxNumber: "201-345-678", openingBalance: 85000 },
  { name: "الشركة المصرية للمنظفات", contactPerson: "وليد فتحي", phone: "01114445566", email: "sales.detergents@example.com", taxNumber: "309-876-123", openingBalance: 42500.5 },
  { name: "مؤسسة الدلتا للمواد الغذائية", contactPerson: "إبراهيم الشناوي", phone: "01227778899", openingBalance: 0 },
  { name: "شركة الإسكندرية للمشروبات", contactPerson: "طارق السيد", phone: "01033334444", email: "alex.drinks@example.com", taxNumber: "418-552-907", openingBalance: -12000 },
  { name: "مصنع العبور للبلاستيك", contactPerson: "رامي نصار", phone: "01155556666", openingBalance: 9800 },
  { name: "شركة القاهرة لمستحضرات التجميل", contactPerson: "نهى كمال", phone: "01288889999", email: "cairo.cosmetics@example.com", openingBalance: 0 },
];

// Employees: natural key = nationalId (14 digits, unique). `branch` = branch name.
const EMPLOYEES = [
  { fullName: "محمد علي حسن", nationalId: "28205120101234", jobTitle: "مدير فرع", hireDate: "2016-03-01", branch: "فرع القاهرة - مدينة نصر" },
  { fullName: "سارة حسن عبد الله", nationalId: "29008230104562", jobTitle: "محاسبة", hireDate: "2019-09-15", branch: "فرع القاهرة - مدينة نصر" },
  { fullName: "خالد محمود السيد", nationalId: "28803070117897", jobTitle: "أمين مخزن", hireDate: "2018-01-10", branch: "فرع القاهرة - مدينة نصر" },
  { fullName: "أحمد سمير فؤاد", nationalId: "27902190203115", jobTitle: "مدير فرع", hireDate: "2015-06-20", branch: "فرع الإسكندرية - سموحة" },
  { fullName: "محمود إبراهيم الشافعي", nationalId: "29306110214583", jobTitle: "مندوب مبيعات", hireDate: "2021-02-01", branch: "فرع الإسكندرية - سموحة" },
  { fullName: "منى عادل رشاد", nationalId: "29511300206728", jobTitle: "محاسبة", hireDate: "2022-04-12", branch: "فرع الإسكندرية - سموحة" },
  { fullName: "يوسف عادل البيومي", nationalId: "29701041209851", jobTitle: "أمين مخزن", hireDate: "2020-11-03", branch: "فرع المنصورة" },
  { fullName: "هبة مصطفى الجندي", nationalId: "29907161213426", jobTitle: "مندوبة مبيعات", hireDate: "2023-08-27", branch: "فرع المنصورة" },
];

// Users: linked to an employee (by national ID) → the backend fills the branch from the employee.
const USERS = [
  { username: "mohamed.ali", role: "ADMIN", employee: "28205120101234" },
  { username: "sara.hassan", role: "ACCOUNTANT", employee: "29008230104562" },
  { username: "mahmoud.ibrahim", role: "SALES", employee: "29306110214583" },
  { username: "youssef.adel", role: "USER", employee: "29701041209851" },
];

// Purchase quotations (عروض أسعار الشراء, Week 2): one of each status. Natural key = the notes text (unique,
// found again with GET /purchase-quotations?search=). Dates are days relative to the day the seed runs
// (0 = today, -20 = 20 days ago). status = where the quotation ends (it is created DRAFT, then moved with the
// status actions; CONVERTED = converted to a DRAFT purchase invoice). lines: [product, unit name, quantity, price,
// line discount ({ percent } / { amount }, optional)]. discount = header { percent } or { amount }.
const QUOTATIONS = [
  {
    notes: "عرض تجريبي 1 — منظفات (مسودة)",
    status: "DRAFT", date: 0, supplier: "الشركة المصرية للمنظفات", branch: "فرع القاهرة - مدينة نصر",
    tax: 14,
    lines: [
      ["مسحوق غسيل أوتوماتيك 3 كيلو", "كرتونة", 20, 1450],
      ["كلور 1 لتر", "كرتونة", 30, 200, { percent: 5 }],
    ],
  },
  {
    notes: "عرض تجريبي 2 — مشروبات (مُرسل)",
    status: "SENT", date: -2, validFor: 30, supplier: "شركة الإسكندرية للمشروبات", branch: "فرع الإسكندرية - سموحة",
    warehouse: W_SMOUHA, discount: { percent: 10 }, tax: 14,
    lines: [
      ["مياه معدنية 1.5 لتر", "كرتونة", 100, 40],
      ["شاي 250 جم", "كرتونة", 10, 1600, { amount: 200 }],
    ],
  },
  {
    notes: "عرض تجريبي 3 — مواد غذائية (مُرسل، منتهي الصلاحية)",
    status: "SENT", date: -20, validUntil: -5, supplier: "مؤسسة الدلتا للمواد الغذائية", branch: "فرع المنصورة",
    warehouse: W_MANSOURA, discount: { amount: 500 }, tax: 0,
    lines: [
      ["أرز 5 كيلو", "كرتونة", 50, 600],
      ["سكر 1 كيلو", "شوال", 20, 1500],
    ],
  },
  {
    notes: "عرض تجريبي 4 — عناية شخصية (مقبول، جاهز للتحويل)",
    status: "ACCEPTED", date: -5, validFor: 25, supplier: "شركة القاهرة لمستحضرات التجميل", branch: "فرع القاهرة - مدينة نصر",
    warehouse: W_OBOUR, tax: 14,
    lines: [
      ["معجون أسنان 100 مل", "كرتونة", 15, 900],
      ["صابون استحمام 125 جم", "دستة", 40, 250],
    ],
  },
  {
    notes: "عرض تجريبي 5 — أدوات منزلية (مرفوض)",
    status: "REJECTED", date: -7, supplier: "مصنع العبور للبلاستيك", branch: "فرع القاهرة - مدينة نصر", tax: 14,
    lines: [
      ["أطباق بلاستيك (50 طبق)", "علبة", 200, 30],
      ["أكياس قمامة كبيرة (رول 20 كيس)", "قطعة", 300, 18],
      ["خدمة توصيل", "قطعة", 1, 500],
    ],
  },
  {
    notes: "عرض تجريبي 6 — النيل (تم التحويل لفاتورة)",
    status: "CONVERTED", date: -10, supplier: "شركة النيل للتجارة والتوزيع", branch: "فرع القاهرة - مدينة نصر",
    warehouse: W_NASR, discount: { percent: 10 }, tax: 14,
    lines: [
      ["معجون أسنان 100 مل", "دستة", 20, 480],
      ["مسحوق غسيل أوتوماتيك 3 كيلو", "قطعة", 60, 240],
    ],
    // The demo DRAFT purchase invoice it becomes (for the purchase invoices page).
    convert: { paymentType: "CREDIT", invoiceDate: -8 },
  },
];

// The status actions that take a new quotation (DRAFT) to its final status, in order.
const QUOTATION_STEPS = {
  DRAFT: [],
  SENT: ["SENT"],
  ACCEPTED: ["SENT", "ACCEPTED"],
  REJECTED: ["SENT", "REJECTED"],
  CONVERTED: ["SENT", "ACCEPTED", "CONVERTED"],
};

// Purchase invoices (Week 2): found again by their notes (unique), like the quotations. status = where the
// invoice ends: created DRAFT, then posted (the goods go into the warehouse) and, for CANCELLED, cancelled (they
// come out again). Never one of the 4 LOW products (their low-stock badge must stay). lines: [product, unit name,
// quantity, unitCost, { percent / amount (line discount), expiry (days from today), batch }]. currency: a code with
// its rate (left out = the default currency, EGP). dueIn = days after the invoice date (آجل only).
const INVOICES = [
  {
    notes: "فاتورة تجريبية 1 — منظفات (آجل، مدفوع جزئيًا)",
    status: "POSTED", date: -6, dueIn: 30, paymentType: "CREDIT", paid: 5000,
    supplier: "الشركة المصرية للمنظفات", supplierInvoiceNumber: "EGD-2026-0457",
    branch: "فرع القاهرة - مدينة نصر", warehouse: W_OBOUR, discount: { percent: 10 }, tax: 14,
    lines: [
      ["مسحوق غسيل أوتوماتيك 3 كيلو", "كرتونة", 10, 1450],
      ["كلور 1 لتر", "كرتونة", 20, 200],
    ],
  },
  {
    notes: "فاتورة تجريبية 2 — أدوات منزلية (نقدي)",
    status: "POSTED", date: -4, paymentType: "CASH",
    supplier: "مصنع العبور للبلاستيك", branch: "فرع الإسكندرية - سموحة", warehouse: W_SMOUHA, tax: 14,
    lines: [["أطباق بلاستيك (50 طبق)", "علبة", 100, 30]],
  },
  {
    notes: "فاتورة تجريبية 3 — عناية شخصية بالدولار (آجل)",
    status: "POSTED", date: -3, dueIn: 45, paymentType: "CREDIT", paid: 0,
    supplier: "شركة القاهرة لمستحضرات التجميل", supplierInvoiceNumber: "CC-INV-88213",
    branch: "فرع القاهرة - مدينة نصر", warehouse: W_OBOUR, currency: { code: "USD", rate: 50.5 }, tax: 0,
    lines: [
      ["شامبو 400 مل", "قطعة", 120, 1.75],
      ["معجون أسنان 100 مل", "كرتونة", 5, 15.5, { percent: 5 }],
    ],
  },
  {
    notes: "فاتورة تجريبية 4 — مشروبات (ملغاة)",
    status: "CANCELLED", date: -9, paymentType: "CASH",
    supplier: "شركة الإسكندرية للمشروبات", branch: "فرع الإسكندرية - سموحة", warehouse: W_BORG, tax: 14,
    lines: [["مياه معدنية 1.5 لتر", "كرتونة", 50, 33, { expiry: 365, batch: "W-2611" }]],
  },
  {
    notes: "فاتورة تجريبية 5 — مواد غذائية (مسودة)",
    status: "DRAFT", date: 0, dueIn: 30, paymentType: "CREDIT", paid: 0,
    supplier: "مؤسسة الدلتا للمواد الغذائية", supplierInvoiceNumber: "DLT-5521",
    branch: "فرع المنصورة", warehouse: W_MANSOURA, discount: { amount: 200 }, tax: 0,
    lines: [
      ["أرز 5 كيلو", "كرتونة", 25, 560, { expiry: 300, batch: "RICE-2611-A" }],
      ["سكر 1 كيلو", "شوال", 10, 1500, { expiry: 240, batch: "SUG-11" }],
    ],
  },
];

// The actions that take a new invoice (DRAFT) to its final status, in order.
const INVOICE_STEPS = {
  DRAFT: [],
  POSTED: ["post"],
  CANCELLED: ["post", "cancel"],
};

// Purchase returns (Week 2): found again by their notes (unique; the list has no search, so every page is read).
// status = where the return ends: created DRAFT, then posted (the goods LEAVE the warehouse at its average cost) and,
// for CANCELLED, cancelled (they come back at the same cost). Never one of the 4 LOW products, never the USD invoice.
// - linked: `invoice` = the notes of a demo invoice above (must be POSTED); lines: [product, unit name, quantity]
//   of ITS lines (the price, discount share and tax come from the invoice).
// - not linked: supplier / branch / warehouse + lines [product, unit name, quantity, unitCost] + discount / tax.
// date = days from today (never before the invoice date). refund = cash the supplier gave back (≤ the net).
const RETURNS = [
  {
    notes: "مرتجع تجريبي 1 — مسحوق غسيل تالف (مربوط بفاتورة)",
    status: "POSTED", date: -2, reason: "تالف",
    invoice: "فاتورة تجريبية 1 — منظفات (آجل، مدفوع جزئيًا)",
    lines: [["مسحوق غسيل أوتوماتيك 3 كيلو", "كرتونة", 2]],
  },
  {
    notes: "مرتجع تجريبي 2 — أطباق زيادة عن المطلوب (مسودة)",
    status: "DRAFT", date: -1, reason: "زيادة عن المطلوب",
    invoice: "فاتورة تجريبية 2 — أدوات منزلية (نقدي)",
    lines: [["أطباق بلاستيك (50 طبق)", "علبة", 10]],
  },
  {
    notes: "مرتجع تجريبي 3 — كلور خطأ في التوريد (ملغي)",
    status: "CANCELLED", date: -5, reason: "خطأ في التوريد",
    invoice: "فاتورة تجريبية 1 — منظفات (آجل، مدفوع جزئيًا)",
    lines: [["كلور 1 لتر", "كرتونة", 3]],
  },
  {
    notes: "مرتجع تجريبي 4 — صابون استحمام بدون فاتورة",
    status: "POSTED", date: -3, reason: "منتهي الصلاحية", refund: 300,
    supplier: "شركة القاهرة لمستحضرات التجميل", branch: "فرع الإسكندرية - سموحة", warehouse: W_BORG, tax: 14,
    lines: [["صابون استحمام 125 جم", "دستة", 2, 260]],
  },
];

// The actions that take a new return (DRAFT) to its final status, in order.
const RETURN_STEPS = INVOICE_STEPS;

// ---------------------------------------------------------------------------
// API helpers
// ---------------------------------------------------------------------------

let token = "";

class ApiError extends Error {
  constructor(method, path, status, body) {
    super(`${method} ${path} → ${status} ${body?.code ?? ""} ${body?.field ?? ""} ${JSON.stringify(body?.message ?? body)}`);
    this.status = status;
    this.body = body;
  }
}

async function call(method, path, body) {
  let response;
  try {
    response = await fetch(`${API_URL}${path}`, {
      method,
      headers: {
        "Content-Type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch {
    console.error(`\n✖ تعذر الاتصال بالخادم — API not reachable on ${API_URL}`);
    console.error('  Start the backend first: cd ../backend && docker compose up -d');
    process.exit(1);
  }
  const json = await response.json().catch(() => null);
  if (!response.ok) throw new ApiError(method, path, response.status, json);
  return json.data;
}

const get = (path) => call("GET", path);
const post = (path, body) => call("POST", path, body);

// Summary: module → { created, existed, skipped: [reasons] }
const summary = {};
function count(module, kind, note) {
  summary[module] ??= { created: 0, existed: 0, skipped: [] };
  if (kind === "skipped") summary[module].skipped.push(note);
  else summary[module][kind] += 1;
}

// 409 ALREADY_EXISTS on field "code": the server picked a random code that is already taken.
// Backend issue (reported to Mazen): generateCode() in ../backend/src/utils/code-generator/code.generator.ts
// picks a random 6-digit code without checking it is free. Sending the same body again picks a new code.
function isRandomCodeCollision(error) {
  return error instanceof ApiError && error.status === 409 && error.body?.code === "ALREADY_EXISTS" && error.body?.field === "code";
}

// POST that retries ONCE after a random-code collision; any other error is thrown right away.
async function postWithCodeRetry(path, body) {
  try {
    return await post(path, body);
  } catch (error) {
    if (!isRandomCodeCollision(error)) throw error;
    return post(path, body);
  }
}

// Creates a record; a 409 (e.g. the key belongs to a DELETED record, which the backend never
// restores) is reported as "skipped" instead of stopping the whole script.
async function createOrSkip(module, label, path, body) {
  try {
    const record = await postWithCodeRetry(path, body);
    count(module, "created");
    return record;
  } catch (error) {
    if (error instanceof ApiError && error.status === 409) {
      count(module, "skipped", `${label}: ${error.body?.code} (${error.body?.field})`);
      return null;
    }
    throw error;
  }
}

// A random EAN-13 barcode (Egypt prefix 622 + 9 random digits + check digit).
function randomBarcode() {
  let digits = "622";
  while (digits.length < 12) digits += Math.floor(Math.random() * 10);
  const sum = [...digits].reduce((total, digit, index) => total + Number(digit) * (index % 2 ? 3 : 1), 0);
  return digits + ((10 - (sum % 10)) % 10);
}

function byName(records) {
  return new Map(records.map((record) => [record.name, record]));
}

// ---------------------------------------------------------------------------
// Seeding, module by module (order matters: branches before warehouses, ...)
// ---------------------------------------------------------------------------

async function seedCurrencies() {
  const existing = await get("/currency");
  const codes = new Set(existing.map((currency) => currency.code));
  if (!codes.has("EGP")) console.warn("  ⚠ EGP not found — the seed does not create or change it (add it on the Currencies page).");
  for (const currency of CURRENCIES) {
    if (codes.has(currency.code)) count("currencies", "existed");
    // Never isDefault: EGP stays the default currency.
    else await createOrSkip("currencies", currency.code, "/currency", { code: currency.code, name: currency.name, symbol: currency.symbol });
  }
}

async function seedSimpleNamed(module, path, names) {
  const existing = byName(await get(path));
  for (const name of names) {
    if (existing.has(name)) count(module, "existed");
    else await createOrSkip(module, name, path, { name });
  }
  return byName(await get(path));
}

async function seedBranches() {
  const existing = byName(await get("/branch"));
  for (const branch of BRANCHES) {
    if (existing.has(branch.name)) count("branches", "existed");
    else await createOrSkip("branches", branch.name, "/branch", { name: branch.name, address: branch.address });
  }
  return byName(await get("/branch"));
}

async function seedWarehouses(branches) {
  const existing = byName(await get("/inventory"));
  for (const warehouse of WAREHOUSES) {
    if (existing.has(warehouse.name)) {
      count("warehouses", "existed");
      continue;
    }
    const branch = branches.get(warehouse.branch);
    if (!branch) {
      count("warehouses", "skipped", `${warehouse.name}: branch missing`);
      continue;
    }
    await createOrSkip("warehouses", warehouse.name, `/inventory/branch/${branch.id}`, {
      name: warehouse.name,
      address: warehouse.address,
    });
  }
  return byName(await get("/inventory"));
}

async function seedProducts(categories, units) {
  const existing = byName(await get("/products"));
  for (const product of PRODUCTS) {
    if (existing.has(product.name)) {
      count("products", "existed");
      continue;
    }
    const category = categories.get(product.category);
    const unit = units.get(product.unit);
    if (!category || !unit) {
      count("products", "skipped", `${product.name}: category or unit missing`);
      continue;
    }
    const [retailPrice, wholesalePrice, bulkWholesalePrice] = product.prices;
    const body = {
      name: product.name,
      categoryId: category.id,
      primaryItemUnitId: unit.id,
      itemType: product.service ? "SERVICE" : "STOCK",
      retailPrice,
      wholesalePrice,
      bulkWholesalePrice,
      reorderLimit: product.reorder,
      hasExpiryDate: Boolean(product.expiry),
    };
    if (product.barcode) body.barcode = randomBarcode();
    await createOrSkip("products", product.name, "/products", body);
  }
  return byName(await get("/products"));
}

// Opening stock: only when the product is not in that warehouse yet (each add = an OPENING movement).
async function seedOpeningStock(warehouses, products) {
  const stockByWarehouse = new Map(); // warehouse id → Set of product ids
  for (const product of PRODUCTS) {
    for (const [warehouseName, quantity, costPrice] of product.stock ?? []) {
      const warehouse = warehouses.get(warehouseName);
      const record = products.get(product.name);
      if (!warehouse || !record) {
        count("opening stock", "skipped", `${product.name} @ ${warehouseName}: warehouse or product missing`);
        continue;
      }
      if (!stockByWarehouse.has(warehouse.id)) {
        const rows = await get(`/product-inventory/inventory/${warehouse.id}`);
        stockByWarehouse.set(warehouse.id, new Set(rows.map((row) => row.productId)));
      }
      if (stockByWarehouse.get(warehouse.id).has(record.id)) {
        count("opening stock", "existed");
        continue;
      }
      await post(`/product-inventory/inventory/${warehouse.id}`, { productId: record.id, quantity, costPrice });
      stockByWarehouse.get(warehouse.id).add(record.id);
      count("opening stock", "created");
    }
  }
}

// Product units: looked up by product + item unit (GET /products/:id/units) before creating.
async function seedProductUnits(products, units) {
  for (const entry of PRODUCT_UNITS) {
    const product = products.get(entry.product);
    if (!product || product.itemType !== "STOCK") {
      count("product units", "skipped", `${entry.product}: product missing or not STOCK`);
      continue;
    }
    const existingUnitIds = new Set((await get(`/products/${product.id}/units`)).map((row) => row.itemUnitId));
    for (const productUnit of entry.units) {
      const unit = units.get(productUnit.unit);
      if (!unit) {
        count("product units", "skipped", `${entry.product} / ${productUnit.unit}: item unit missing`);
        continue;
      }
      // Also the primary unit (always in the list) is never added.
      if (existingUnitIds.has(unit.id)) {
        count("product units", "existed");
        continue;
      }
      const body = { itemUnitId: unit.id, factor: productUnit.factor };
      if (productUnit.price !== undefined) body.retailPrice = productUnit.price;
      if (productUnit.barcode) body.barcode = randomBarcode();
      await createOrSkip("product units", `${entry.product} / ${productUnit.unit}`, `/products/${product.id}/units`, body);
    }
  }
}

async function seedCustomers() {
  const existing = byName(await get("/customer"));
  for (const customer of CUSTOMERS) {
    if (existing.has(customer.name)) {
      count("customers", "existed");
      continue;
    }
    const body = {
      name: customer.name,
      phone: customer.phone,
      address: customer.address,
      creditLimit: customer.creditLimit,
      openingBalance: customer.openingBalance,
    };
    if (customer.taxNumber) body.taxNumber = customer.taxNumber;
    if (customer.commercialRecord) body.commercialRecord = customer.commercialRecord;
    await createOrSkip("customers", customer.name, "/customer", body);
  }
}

async function seedSuppliers() {
  const existing = byName(await get("/supplier"));
  for (const supplier of SUPPLIERS) {
    if (existing.has(supplier.name)) {
      count("suppliers", "existed");
      continue;
    }
    const body = {
      name: supplier.name,
      contactPerson: supplier.contactPerson,
      phone: supplier.phone,
      openingBalance: supplier.openingBalance,
    };
    if (supplier.email) body.email = supplier.email;
    if (supplier.taxNumber) body.taxNumber = supplier.taxNumber;
    await createOrSkip("suppliers", supplier.name, "/supplier", body);
  }
}

async function seedEmployees(branches) {
  const byNationalId = () => get("/employees").then((rows) => new Map(rows.map((row) => [row.nationalId, row])));
  const existing = await byNationalId();
  for (const employee of EMPLOYEES) {
    if (existing.has(employee.nationalId)) {
      count("employees", "existed");
      continue;
    }
    const branch = branches.get(employee.branch);
    if (!branch) {
      count("employees", "skipped", `${employee.fullName}: branch missing`);
      continue;
    }
    await createOrSkip("employees", employee.fullName, `/employees/branch/${branch.id}`, {
      fullName: employee.fullName,
      nationalId: employee.nationalId,
      jobTitle: employee.jobTitle,
      hireDate: employee.hireDate,
    });
  }
  return byNationalId();
}

async function seedUsers(employees) {
  const existing = new Set((await get("/users")).map((user) => user.username));
  for (const user of USERS) {
    if (existing.has(user.username)) {
      count("users", "existed");
      continue;
    }
    const body = { username: user.username, password: DEMO_PASSWORD, role: user.role };
    // branchId is left out: the backend fills it from the employee.
    const employee = employees.get(user.employee);
    if (employee) body.employeeId = employee.id;
    await createOrSkip("users", user.username, "/users", body);
  }
}

// A day relative to today, in the machine's local time zone → "YYYY-MM-DD".
function localDay(offsetDays) {
  const date = new Date();
  date.setDate(date.getDate() + offsetDays);
  const pad = (n) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

// Quotation / invoice codes seen in this run (printed at the end).
const quotationReport = [];
const invoiceReport = [];

// The id of a product's unit by its name (the primary unit or a product unit), for document lines.
const unitCache = new Map(); // product id → GET /products/:id/units
async function unitId(product, unitName) {
  if (!unitCache.has(product.id)) unitCache.set(product.id, await get(`/products/${product.id}/units`));
  return unitCache.get(product.id).find((unit) => unit.itemUnit?.name === unitName)?.itemUnitId;
}

// Purchase quotations: looked up by their notes; a missing one is created (DRAFT) and moved to its status with
// the status actions. One left half way by an earlier run (e.g. still SENT) is moved on; never edited.
async function seedPurchaseQuotations(suppliers, branches, warehouses, products) {
  for (const entry of QUOTATIONS) {
    const found = await get(`/purchase-quotations?search=${encodeURIComponent(entry.notes)}&pageSize=100`);
    let quotation = found.items.find((item) => item.notes === entry.notes);

    if (quotation) {
      count("purchase quotations", "existed");
    } else {
      const supplier = suppliers.get(entry.supplier);
      const branch = branches.get(entry.branch);
      const warehouse = entry.warehouse ? warehouses.get(entry.warehouse) : null;
      if (!supplier || !branch || (entry.warehouse && !warehouse)) {
        count("purchase quotations", "skipped", `${entry.notes}: supplier / branch / warehouse missing`);
        continue;
      }
      const lines = [];
      for (const [productName, unitName, quantity, unitPrice, lineDiscount] of entry.lines) {
        const product = products.get(productName);
        const itemUnitId = product && (await unitId(product, unitName));
        if (!itemUnitId) break;
        const line = { productId: product.id, itemUnitId, quantity, unitPrice };
        if (lineDiscount?.percent !== undefined) line.discountPercent = lineDiscount.percent;
        if (lineDiscount?.amount !== undefined) line.discountValue = lineDiscount.amount;
        lines.push(line);
      }
      if (lines.length !== entry.lines.length) {
        count("purchase quotations", "skipped", `${entry.notes}: a product or its unit is missing`);
        continue;
      }
      const body = {
        quotationDate: localDay(entry.date),
        supplierId: supplier.id,
        branchId: branch.id,
        // Both header discount fields (see purchaseQuotationsApi.js).
        discountPercent: entry.discount?.percent ?? 0,
        discountValue: entry.discount?.amount ?? 0,
        taxPercent: entry.tax,
        notes: entry.notes,
        lines,
      };
      if (entry.validFor !== undefined) body.validUntil = localDay(entry.date + entry.validFor);
      if (entry.validUntil !== undefined) body.validUntil = localDay(entry.validUntil);
      if (warehouse) body.warehouseId = warehouse.id;
      quotation = await post("/purchase-quotations", body);
      count("purchase quotations", "created");
    }

    // Move it on to its final status (only the steps it has not done yet).
    const steps = QUOTATION_STEPS[entry.status];
    const done = ["DRAFT", ...steps].indexOf(quotation.status);
    let invoiceCode = "";
    for (const step of steps.slice(Math.max(done, 0))) {
      if (step === "CONVERTED") {
        const result = await call("POST", `/purchase-quotations/${quotation.id}/convert-to-invoice`, {
          paymentType: entry.convert.paymentType,
          invoiceDate: localDay(entry.convert.invoiceDate),
        }).catch((error) => {
          count("purchase quotations", "skipped", `${entry.notes}: convert failed (${error.body?.code} ${error.body?.field})`);
          return null;
        });
        if (!result) break;
        quotation = result.quotation;
        invoiceCode = result.invoice.code;
      } else {
        quotation = await call("PATCH", `/purchase-quotations/${quotation.id}/status`, { status: step });
      }
    }
    if (quotation.convertedToInvoiceId && !invoiceCode) {
      invoiceCode = await get(`/purchase-invoices/${quotation.convertedToInvoiceId}`)
        .then((invoice) => invoice.code)
        .catch(() => "(فاتورة محذوفة)");
    }
    quotationReport.push(`${quotation.code}  ${quotation.status.padEnd(9)} ${entry.notes}${invoiceCode ? `  → ${invoiceCode}` : ""}`);
  }
}

// Purchase invoices: looked up by their notes; a missing one is created (DRAFT, the body built like
// purchaseInvoicesApi.js) and moved to its status: posted (stock in) and, for CANCELLED, cancelled (stock out).
// One left half way by an earlier run (e.g. still DRAFT) is moved on; never edited.
async function seedPurchaseInvoices(suppliers, branches, warehouses, products) {
  const currencies = new Map((await get("/currency")).map((currency) => [currency.code, currency]));

  for (const entry of INVOICES) {
    const found = await get(`/purchase-invoices?search=${encodeURIComponent(entry.notes)}&pageSize=100`);
    let invoice = found.items.find((item) => item.notes === entry.notes);

    if (invoice) {
      count("purchase invoices", "existed");
    } else {
      const supplier = suppliers.get(entry.supplier);
      const branch = branches.get(entry.branch);
      const warehouse = warehouses.get(entry.warehouse);
      const currency = entry.currency ? currencies.get(entry.currency.code) : null;
      if (!supplier || !branch || !warehouse || (entry.currency && !currency)) {
        count("purchase invoices", "skipped", `${entry.notes}: supplier / branch / warehouse / currency missing`);
        continue;
      }
      const lines = [];
      for (const [productName, unitName, quantity, unitCost, extra = {}] of entry.lines) {
        const product = products.get(productName);
        const itemUnitId = product && (await unitId(product, unitName));
        if (!itemUnitId) break;
        const line = { productId: product.id, itemUnitId, quantity, unitCost };
        if (extra.percent !== undefined) line.discountPercent = extra.percent;
        if (extra.amount !== undefined) line.discountValue = extra.amount;
        if (extra.expiry !== undefined) line.expiryDate = localDay(extra.expiry);
        if (extra.batch) line.batchNumber = extra.batch;
        lines.push(line);
      }
      if (lines.length !== entry.lines.length) {
        count("purchase invoices", "skipped", `${entry.notes}: a product or its unit is missing`);
        continue;
      }
      const body = {
        invoiceDate: localDay(entry.date),
        paymentType: entry.paymentType,
        supplierId: supplier.id,
        branchId: branch.id,
        warehouseId: warehouse.id,
        // Both header discount fields (see purchaseInvoicesApi.js).
        discountPercent: entry.discount?.percent ?? 0,
        discountValue: entry.discount?.amount ?? 0,
        taxPercent: entry.tax,
        notes: entry.notes,
        lines,
      };
      if (entry.supplierInvoiceNumber) body.supplierInvoiceNumber = entry.supplierInvoiceNumber;
      if (entry.paymentType === "CREDIT") {
        body.paidAmount = entry.paid ?? 0;
        if (entry.dueIn !== undefined) body.dueDate = localDay(entry.date + entry.dueIn);
      }
      if (currency) {
        body.currencyId = currency.id;
        body.exchangeRate = entry.currency.rate;
      }
      invoice = await post("/purchase-invoices", body);
      count("purchase invoices", "created");
    }

    // Move it on to its final status (only the steps it has not done yet).
    const steps = INVOICE_STEPS[entry.status];
    const done = ["DRAFT", "POSTED", "CANCELLED"].indexOf(invoice.status);
    for (const step of steps.slice(Math.max(done, 0))) {
      const moved = await call("POST", `/purchase-invoices/${invoice.id}/${step}`).catch((error) => {
        count("purchase invoices", "skipped", `${entry.notes}: ${step} failed (${error.body?.code} ${error.body?.field})`);
        return null;
      });
      if (!moved) break;
      invoice = moved;
    }
    invoiceReport.push(`${invoice.code}  ${invoice.status.padEnd(9)} ${entry.notes}`);
  }
}

// Every purchase return (the list has no search: read page by page).
async function getAllReturns() {
  const items = [];
  for (let page = 1; ; page += 1) {
    const data = await get(`/purchase-returns?page=${page}&pageSize=100`);
    items.push(...data.items);
    if (page >= data.meta.totalPages) return items;
  }
}

const returnReport = [];

// Purchase returns: looked up by their notes; a missing one is created (DRAFT, the body built like
// purchaseReturnsApi.js) and moved to its status: posted (stock out) and, for CANCELLED, cancelled (stock back).
// One left half way by an earlier run (e.g. still DRAFT) is moved on; never edited.
async function seedPurchaseReturns(suppliers, branches, warehouses, products) {
  const existing = await getAllReturns();
  for (const entry of RETURNS) {
    let ret = existing.find((item) => item.notes === entry.notes);
    // What the return moves, for the report: "−12 قطعة مسحوق غسيل…" per STOCK line.
    let moves = [];

    if (ret) {
      count("purchase returns", "existed");
      ret = await get(`/purchase-returns/${ret.id}`);
    } else {
      const body = { returnDate: localDay(entry.date), reason: entry.reason, notes: entry.notes };
      if (entry.refund) body.refundAmount = entry.refund;
      if (entry.invoice) {
        const found = await get(`/purchase-invoices?search=${encodeURIComponent(entry.invoice)}&pageSize=100`);
        const item = found.items.find((invoice) => invoice.notes === entry.invoice);
        const invoice = item && (await get(`/purchase-invoices/${item.id}`));
        if (!invoice || invoice.status !== "POSTED") {
          count("purchase returns", "skipped", `${entry.notes}: its invoice is missing or not POSTED`);
          continue;
        }
        const lines = [];
        for (const [productName, unitName, quantity] of entry.lines) {
          const line = invoice.lines.find((l) => l.product?.name === productName && l.itemUnit?.name === unitName);
          if (!line) break;
          lines.push({ purchaseInvoiceLineId: line.id, quantity });
        }
        if (lines.length !== entry.lines.length) {
          count("purchase returns", "skipped", `${entry.notes}: a line is not on the invoice`);
          continue;
        }
        Object.assign(body, { purchaseInvoiceId: invoice.id, lines });
      } else {
        const supplier = suppliers.get(entry.supplier);
        const branch = branches.get(entry.branch);
        const warehouse = warehouses.get(entry.warehouse);
        if (!supplier || !branch || !warehouse) {
          count("purchase returns", "skipped", `${entry.notes}: supplier / branch / warehouse missing`);
          continue;
        }
        const lines = [];
        for (const [productName, unitName, quantity, unitCost] of entry.lines) {
          const product = products.get(productName);
          const itemUnitId = product && (await unitId(product, unitName));
          if (!itemUnitId) break;
          lines.push({ productId: product.id, itemUnitId, quantity, unitCost });
        }
        if (lines.length !== entry.lines.length) {
          count("purchase returns", "skipped", `${entry.notes}: a product or its unit is missing`);
          continue;
        }
        // Both header discount fields (see purchaseReturnsApi.js).
        Object.assign(body, {
          supplierId: supplier.id,
          branchId: branch.id,
          warehouseId: warehouse.id,
          discountPercent: entry.discount?.percent ?? 0,
          discountValue: entry.discount?.amount ?? 0,
          taxPercent: entry.tax ?? 0,
          lines,
        });
      }
      ret = await post("/purchase-returns", body);
      count("purchase returns", "created");
    }

    // Move it on to its final status (only the steps it has not done yet).
    const steps = RETURN_STEPS[entry.status];
    const done = ["DRAFT", "POSTED", "CANCELLED"].indexOf(ret.status);
    for (const step of steps.slice(Math.max(done, 0))) {
      const moved = await call("POST", `/purchase-returns/${ret.id}/${step}`).catch((error) => {
        count("purchase returns", "skipped", `${entry.notes}: ${step} failed (${error.body?.code} ${error.body?.field})`);
        return null;
      });
      if (!moved) break;
      ret = moved;
      const sign = step === "post" ? "−" : "+";
      moves = moves.concat(
        ret.lines
          .filter((line) => line.product?.itemType === "STOCK")
          .map((line) => `${sign}${Number(line.baseQuantity)} ${line.product.name} (${ret.warehouse?.name})`),
      );
    }
    const moved = moves.length > 0 ? `  [stock: ${moves.join(" · ")}]` : "";
    returnReport.push(`${ret.code}  ${ret.status.padEnd(9)} ${entry.notes}${moved}`);
  }
}

// ---------------------------------------------------------------------------

const MODULE_AR = {
  currencies: "العملات",
  branches: "الفروع",
  warehouses: "المخازن",
  categories: "التصنيفات",
  "item units": "وحدات الأصناف",
  products: "الأصناف",
  "opening stock": "أرصدة أول المدة",
  "product units": "وحدات الصنف",
  customers: "العملاء",
  suppliers: "الموردين",
  employees: "الموظفين",
  users: "المستخدمين",
  "purchase quotations": "عروض أسعار الشراء",
  "purchase invoices": "فواتير الشراء",
  "purchase returns": "مرتجعات الشراء",
};

function printSummary() {
  console.log("\nملخص بيانات التجربة — demo data summary");
  console.log("-".repeat(60));
  let totalCreated = 0;
  for (const [module, label] of Object.entries(MODULE_AR)) {
    const row = summary[module] ?? { created: 0, existed: 0, skipped: [] };
    totalCreated += row.created;
    const skipped = row.skipped.length ? ` · skipped ${row.skipped.length}` : "";
    console.log(`${module.padEnd(14)} ${label.padEnd(16)} created ${String(row.created).padStart(3)} · already existed ${String(row.existed).padStart(3)}${skipped}`);
    for (const reason of row.skipped) console.log(`    ⚠ skipped: ${reason}`);
  }
  console.log("-".repeat(60));
  console.log(totalCreated === 0 ? "لا جديد: كل البيانات موجودة بالفعل (nothing new, everything already existed)." : `تم إنشاء ${totalCreated} سجل (created ${totalCreated} records).`);
  console.log(`Demo users password: ${DEMO_PASSWORD}`);
  if (quotationReport.length > 0) {
    console.log("\nعروض أسعار الشراء التجريبية — demo purchase quotations:");
    for (const line of quotationReport) console.log(`  ${line}`);
  }
  if (invoiceReport.length > 0) {
    console.log("\nفواتير الشراء التجريبية — demo purchase invoices:");
    for (const line of invoiceReport) console.log(`  ${line}`);
  }
  if (returnReport.length > 0) {
    console.log("\nمرتجعات الشراء التجريبية — demo purchase returns:");
    for (const line of returnReport) console.log(`  ${line}`);
  }
}

async function main() {
  console.log(`Seeding demo data on ${API_URL} ...`);
  const login = await post("/auth/login", ADMIN);
  token = login.access_token;

  await seedCurrencies();
  const branches = await seedBranches();
  const warehouses = await seedWarehouses(branches);
  const categories = await seedSimpleNamed("categories", "/categories", CATEGORIES);
  const units = await seedSimpleNamed("item units", "/item-unit", ITEM_UNITS);
  const products = await seedProducts(categories, units);
  await seedOpeningStock(warehouses, products);
  await seedProductUnits(products, units);
  await seedCustomers();
  await seedSuppliers();
  const employees = await seedEmployees(branches);
  await seedUsers(employees);
  // Week 2 documents: need the suppliers, branches, warehouses, products and units above (+ EGP for the convert).
  const suppliers = byName(await get("/supplier"));
  await seedPurchaseQuotations(suppliers, branches, warehouses, products);
  // Posting moves demo stock (never the 4 LOW products); USD must exist for invoice 3.
  await seedPurchaseInvoices(suppliers, branches, warehouses, products);
  // Returns: invoices 1 and 2 must be POSTED (returns 1–3); return 4 takes stock out of a demo warehouse.
  await seedPurchaseReturns(suppliers, branches, warehouses, products);

  printSummary();
}

main().catch((error) => {
  console.error(`\n✖ Seed failed: ${error.message}`);
  printSummary();
  process.exit(1);
});
