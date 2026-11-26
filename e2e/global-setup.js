// Leftover check for the whole e2e run (Playwright globalSetup, see playwright.config.js).
//
// The database is NOT empty: it holds the demo data (npm run seed:demo) and EGP. So "no test data
// left" can't mean "the lists are empty". Instead:
//   1. before the run: take a snapshot of every list (+ the stock of every warehouse, + the product
//      units of every product, + the item card of every product in every warehouse);
//   2. after the run (the returned function = global teardown): take it again and compare.
// The run fails when a test
//   - left a record behind        (in "after", not in "before"),
//   - deleted a record that existed before, e.g. demo data (in "before", not in "after"),
//   - modified a record that existed before (its fields differ).
// updatedAt / lastLoginDate are ignored: logging in as admin or a no-op save may touch them.
// isExpired (quotations) is ignored too: the server computes it from today's date, so a run that crosses
// midnight would see it change.
//
// Paginated Week 2 lists (PAGINATED_LISTS) are read page by page (pageSize 100).
// One leftover is ALLOWED: a quotation converted to an invoice can never be deleted (backend rule, like stock
// movements), so a NEW quotation with status CONVERTED whose notes contain "e2e-" may stay. The DRAFT invoice
// it became is deleted by the test (DELETE /purchase-invoices/:id), like everything else the tests create.
//
// When the API is down the check is skipped (the backend tests skip themselves too).
import { API_URL } from "./helpers.js";

const LISTS = [
  "/currency",
  "/branch",
  "/inventory",
  "/categories",
  "/item-unit",
  "/products",
  "/customer",
  "/supplier",
  "/employees",
  "/users",
];

// Week 2 document lists: data = { items, meta }.
const PAGINATED_LISTS = ["/purchase-quotations", "/purchase-invoices"];

const IGNORED_FIELDS = new Set(["updatedAt", "lastLoginDate", "isExpired"]);

// The one allowed leftover (see the top of this file).
function isAllowedLeftover(path, record) {
  return (
    path === "/purchase-quotations" && record.status === "CONVERTED" && String(record.notes ?? "").includes("e2e-")
  );
}

// A stable text of a record without the ignored fields (also inside nested objects).
function fingerprint(value) {
  return JSON.stringify(value, (key, field) => (IGNORED_FIELDS.has(key) ? undefined : field));
}

async function login() {
  const response = await fetch(`${API_URL}/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username: "admin", password: "admin123" }),
  });
  if (!response.ok) throw new Error(`leftover check: admin login failed (${response.status})`);
  return (await response.json()).data.access_token;
}

async function getList(token, path) {
  const response = await fetch(`${API_URL}${path}`, { headers: { Authorization: `Bearer ${token}` } });
  if (!response.ok) throw new Error(`leftover check: GET ${path} failed (${response.status})`);
  return (await response.json()).data;
}

// Every item of a paginated list (all pages).
async function getAllPages(token, path) {
  const items = [];
  for (let page = 1; ; page += 1) {
    const data = await getList(token, `${path}?page=${page}&pageSize=100`);
    items.push(...data.items);
    if (page >= data.meta.totalPages) return items;
  }
}

// { "<path>": Map(id → fingerprint) }. warehouseIds / productIds: whose stock / units to include
// (the "before" ones; left out → all current ones).
async function takeSnapshot(warehouseIds, productIds) {
  const token = await login();
  const snapshot = {};
  for (const path of LISTS) {
    const records = await getList(token, path);
    snapshot[path] = new Map(records.map((record) => [record.id, fingerprint(record)]));
  }
  for (const path of PAGINATED_LISTS) {
    const records = await getAllPages(token, path);
    snapshot[path] = new Map(records.map((record) => [record.id, fingerprint(record)]));
  }
  for (const id of warehouseIds ?? snapshot["/inventory"].keys()) {
    const path = `/product-inventory/inventory/${id}`;
    // A warehouse deleted during the run is reported by the /inventory list itself.
    const records = snapshot["/inventory"].has(id) ? await getList(token, path) : [];
    snapshot[path] = new Map(records.map((record) => [record.id, fingerprint(record)]));
  }
  // Product units (Week 2). The primary unit entry has id null: key by itemUnitId (one row per unit).
  for (const id of productIds ?? snapshot["/products"].keys()) {
    const path = `/products/${id}/units`;
    // A product deleted during the run is reported by the /products list itself.
    const records = snapshot["/products"].has(id) ? await getList(token, path) : [];
    snapshot[path] = new Map(records.map((record) => [record.itemUnitId, fingerprint(record)]));
  }
  // Item cards (Week 2): per product × warehouse, the number of movements + the last balance.
  // Movements are never deleted, so a test that moved demo stock shows up here as "modified".
  // The item card also works for a product / warehouse deleted during the run (the list reports that).
  const cards = new Map();
  for (const productId of productIds ?? snapshot["/products"].keys()) {
    for (const warehouseId of warehouseIds ?? snapshot["/inventory"].keys()) {
      const card = await getList(token, `/stock-movements/item-card?productId=${productId}&warehouseId=${warehouseId}`);
      const lastBalance = card.movements.at(-1)?.balanceAfter ?? null;
      cards.set(`${productId} in ${warehouseId}`, fingerprint({ movements: card.movements.length, lastBalance }));
    }
  }
  snapshot["/stock-movements/item-card"] = cards;
  return snapshot;
}

function compare(before, after) {
  const problems = [];
  for (const [path, beforeRecords] of Object.entries(before)) {
    const afterRecords = after[path] ?? new Map();
    for (const [id, text] of afterRecords) {
      if (!beforeRecords.has(id) && !isAllowedLeftover(path, JSON.parse(text))) {
        problems.push(`left behind ${path}: ${text}`);
      }
    }
    for (const [id, text] of beforeRecords) {
      if (!afterRecords.has(id)) problems.push(`deleted (existed before the run) ${path}: ${text}`);
      else if (afterRecords.get(id) !== text) {
        problems.push(`modified (existed before the run) ${path}:\n      before: ${text}\n      after:  ${afterRecords.get(id)}`);
      }
    }
  }
  return problems;
}

async function isApiUp() {
  try {
    await fetch(API_URL, { signal: AbortSignal.timeout(3000) });
    return true;
  } catch {
    return false;
  }
}

export default async function globalSetup() {
  if (!(await isApiUp())) {
    console.log(`[leftover check] skipped: backend not reachable on ${API_URL}`);
    return undefined;
  }
  const before = await takeSnapshot();

  // Global teardown: runs once after all tests.
  return async () => {
    const after = await takeSnapshot([...before["/inventory"].keys()], [...before["/products"].keys()]);
    const problems = compare(before, after);
    if (problems.length > 0) {
      throw new Error(`[leftover check] the e2e run changed the database:\n  - ${problems.join("\n  - ")}`);
    }
    console.log("[leftover check] OK: no test data left, no existing (demo) record deleted or modified.");
  };
}
