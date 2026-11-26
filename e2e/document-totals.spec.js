// Unit checks of utils/documentTotals.js (the live totals preview of document forms) and of the line helpers in
// utils/documentLines.js. Plain functions: they run in Node, without a browser page.
// The formulas must match the backend (../backend/src/utils/document/document-totals.ts) and the examples of
// ../backend/doc/week2/week2flow.txt §9.
import { test, expect } from "@playwright/test";
import { calcDocumentTotals, calcLineTotal, roundHalfUp } from "../src/utils/documentTotals.js";
import { filledLineIndexes, isEmptyLine, newLine, validateLines, validatePercent } from "../src/utils/documentLines.js";

function line(quantity, price, discountType = "percent", discount = "") {
  return { quantity, price, discountType, discount };
}

test.describe("calcLineTotal", () => {
  test("quantity × price, minus a percent or an amount", () => {
    expect(calcLineTotal(line("10", "150"))).toBe(1500);
    expect(calcLineTotal(line("10", "150", "percent", "10"))).toBe(1350);
    expect(calcLineTotal(line("10", "150", "amount", "20"))).toBe(1480);
  });

  test("an invalid or empty quantity / price / discount gives no total", () => {
    expect(calcLineTotal(line("", "150"))).toBeNull();
    expect(calcLineTotal(line("10", ""))).toBeNull();
    expect(calcLineTotal(line("abc", "150"))).toBeNull();
    expect(calcLineTotal(line("10", "150", "percent", "1x"))).toBeNull();
  });

  test("line totals are rounded half up to 4 decimals", () => {
    // 3 × 0.33335 = 1.00005 → 1.0001 (half up)
    expect(calcLineTotal(line("3", "0.33335"))).toBe(1.0001);
    // float noise: 0.1 × 3 = 0.30000000000000004 → 0.3
    expect(calcLineTotal(line("3", "0.1"))).toBe(0.3);
  });
});

test.describe("calcDocumentTotals", () => {
  test("the brush example: 1500, 10%, tax 14% → 1500 / 150 / 189 / 1539", () => {
    expect(calcDocumentTotals([1500], { discountType: "percent", discount: "10", tax: "14" })).toEqual({
      subTotal: 1500,
      discountValue: 150,
      taxValue: 189,
      netTotal: 1539,
    });
  });

  test("the return example: 300 with a fixed 30 and tax 14% → 37.80 / 307.80", () => {
    expect(calcDocumentTotals([300], { discountType: "amount", discount: "30", tax: "14" })).toEqual({
      subTotal: 300,
      discountValue: 30,
      taxValue: 37.8,
      netTotal: 307.8,
    });
  });

  test("percent mode uses the percent, amount mode the amount; empty = no discount / no tax", () => {
    expect(calcDocumentTotals([1000], { discountType: "percent", discount: "5", tax: "" }).discountValue).toBe(50);
    expect(calcDocumentTotals([1000], { discountType: "amount", discount: "5", tax: "" }).discountValue).toBe(5);
    expect(calcDocumentTotals([1000], { discountType: "percent", discount: "", tax: "" })).toEqual({
      subTotal: 1000,
      discountValue: 0,
      taxValue: 0,
      netTotal: 1000,
    });
  });

  test("document totals are rounded half up to 2 decimals", () => {
    // subTotal 1.005 → 1.01 (plain Math.round(1.005 * 100) / 100 gives 1)
    expect(calcDocumentTotals([1.005], { discountType: "percent", discount: "", tax: "" }).subTotal).toBe(1.01);
    // tax 14% of 10.25 = 1.435 → 1.44
    expect(calcDocumentTotals([10.25], { discountType: "percent", discount: "", tax: "14" }).taxValue).toBe(1.44);
  });
});

test("roundHalfUp", () => {
  expect(roundHalfUp(1.005, 2)).toBe(1.01);
  expect(roundHalfUp(1.00005, 4)).toBe(1.0001);
  expect(roundHalfUp(2.5, 0)).toBe(3);
  expect(roundHalfUp(-1.005, 2)).toBe(-1.01);
  expect(roundHalfUp(1e-7, 4)).toBe(0);
});

test.describe("document lines", () => {
  test("an empty line is ignored; the sent rows keep their form index", () => {
    const filled = { ...newLine(), productId: "p1" };
    const lines = [newLine(), filled, newLine()];
    expect(isEmptyLine(lines[0])).toBe(true);
    expect(isEmptyLine(filled)).toBe(false);
    expect(filledLineIndexes(lines)).toEqual([1]);
    expect(validateLines(lines).filledCount).toBe(1);
  });

  test("line validation messages", () => {
    const base = { ...newLine(), productId: "p1", itemUnitId: "u1", quantity: "10", price: "150" };
    const check = (changes) => validateLines([{ ...base, ...changes }]).errors[0];
    expect(check({})).toEqual({});
    expect(check({ productId: "", itemUnitId: "" })).toEqual({ productId: "اختر الصنف", itemUnitId: "اختر الوحدة" });
    expect(check({ quantity: "0" }).quantity).toBe("الكمية يجب أن تكون أكبر من صفر");
    expect(check({ quantity: "1.12345" }).quantity).toBe("الحد الأقصى 4 أرقام بعد العلامة العشرية");
    expect(check({ price: "" }).price).toBe("السعر مطلوب");
    expect(check({ discountType: "amount", discount: "1501" }).discount).toBe("الخصم أكبر من قيمة البند");
    expect(check({ discountType: "amount", discount: "1500" }).discount).toBeUndefined();
    expect(check({ discountType: "percent", discount: "101" }).discount).toBe("النسبة يجب أن تكون بين 0 و 100");
  });

  test("validatePercent", () => {
    expect(validatePercent("")).toBe("");
    expect(validatePercent("14")).toBe("");
    expect(validatePercent("100")).toBe("");
    expect(validatePercent("100.5")).toBe("النسبة يجب أن تكون بين 0 و 100");
    expect(validatePercent("-1")).toBe("النسبة يجب أن تكون بين 0 و 100");
    expect(validatePercent("10.123")).toBe("الحد الأقصى رقمان بعد العلامة العشرية");
  });
});
