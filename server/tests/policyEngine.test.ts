import { describe, expect, it } from "vitest";
import { findOrder } from "../src/data/orders.js";
import {
  calculateShipping,
  checkCancellation,
  checkCod,
  checkDamageReport,
  checkReturn,
} from "../src/services/policyEngine.js";

const order = (id: string) => {
  const o = findOrder(id);
  if (!o) throw new Error("missing fixture");
  return o;
};

describe("cancellation", () => {
  it("allows Processing orders (ORD-103)", () => {
    expect(checkCancellation(order("ORD-103")).decision).toBe("ALLOWED");
  });
  it("denies Out for Delivery orders (ORD-101)", () => {
    const v = checkCancellation(order("ORD-101"));
    expect(v.decision).toBe("DENIED");
    expect(v.reason).toContain("refuse delivery");
  });
});

describe("returns", () => {
  it("denies a return 14 days after delivery (ORD-102)", () => {
    const v = checkReturn(order("ORD-102"));
    expect(v.decision).toBe("DENIED");
    expect(v.reason).toContain("14 days");
  });
  it("is not applicable before delivery", () => {
    expect(checkReturn(order("ORD-101")).decision).toBe("NOT_APPLICABLE");
  });
  it("denies damage reports after 48 hours", () => {
    expect(checkDamageReport(order("ORD-102")).decision).toBe("DENIED");
  });
});

describe("shipping", () => {
  it("charges 50 rupees below 499", () => {
    expect(calculateShipping(400)).toMatchObject({ decision: "FEE_APPLIES", feeInr: 50 });
  });
  it("is free above 499", () => {
    expect(calculateShipping(699)).toMatchObject({ decision: "FREE", feeInr: 0 });
  });
  it("does not guess at exactly 499", () => {
    expect(calculateShipping(499)).toMatchObject({ decision: "UNSPECIFIED", feeInr: null });
  });
});

describe("cod", () => {
  it("allows up to 2500", () => expect(checkCod(2500).decision).toBe("ALLOWED"));
  it("denies above 2500", () => expect(checkCod(2501).decision).toBe("DENIED"));
});