// Leftover check for the whole e2e run (Playwright globalSetup, see playwright.config.js).
//
// The database is NOT empty: it holds the demo data (npm run seed:demo) and EGP. So "no test data
// left" can't mean "the lists are empty". Instead:
//   1. before the run: take a snapshot of every list (+ the stock of every warehouse);
//   2. after the run (the returned function = global teardown): take it again and compare.
// The run fails when a test
//   - left a record behind        (in "after", not in "before"),
//   - deleted a record that existed before, e.g. demo data (in "before", not in "after"),
//   - modified a record that existed before (its fields differ).
// updatedAt / lastLoginDate are ignored: logging in as admin or a no-op save may touch them.
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

const IGNORED_FIELDS = new Set(["updatedAt", "lastLoginDate"]);

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

// { "<path>": Map(id → fingerprint) }. warehouseIds: whose stock to include (the "before" ones).
async function takeSnapshot(warehouseIds) {
  const token = await login();
  const snapshot = {};
  for (const path of LISTS) {
    const records = await getList(token, path);
    snapshot[path] = new Map(records.map((record) => [record.id, fingerprint(record)]));
  }
  for (const id of warehouseIds ?? snapshot["/inventory"].keys()) {
    const path = `/product-inventory/inventory/${id}`;
    // A warehouse deleted during the run is reported by the /inventory list itself.
    const records = snapshot["/inventory"].has(id) ? await getList(token, path) : [];
    snapshot[path] = new Map(records.map((record) => [record.id, fingerprint(record)]));
  }
  return snapshot;
}

function compare(before, after) {
  const problems = [];
  for (const [path, beforeRecords] of Object.entries(before)) {
    const afterRecords = after[path] ?? new Map();
    for (const [id, text] of afterRecords) {
      if (!beforeRecords.has(id)) problems.push(`left behind ${path}: ${text}`);
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
    const after = await takeSnapshot([...before["/inventory"].keys()]);
    const problems = compare(before, after);
    if (problems.length > 0) {
      throw new Error(`[leftover check] the e2e run changed the database:\n  - ${problems.join("\n  - ")}`);
    }
    console.log("[leftover check] OK: no test data left, no existing (demo) record deleted or modified.");
  };
}
