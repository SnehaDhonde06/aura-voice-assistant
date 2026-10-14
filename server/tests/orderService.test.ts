import { describe, expect, it } from "vitest";
import { getOrderDetails, normalizeOrderId } from "../src/services/orderService.js";

describe("normalizeOrderId", () => {
  it.each([
    ["ORD-101", "ORD-101"],
    ["ord 101", "ORD-101"],
    ["ORD101", "ORD-101"],
    ["my order id is ORD-102 please", "ORD-102"],
    ["order one zero three", "ORD-103"],
    ["o r d one oh one", "ORD-101"],
  ])("normalizes %s", (input, expected) => {
    expect(normalizeOrderId(input)).toBe(expected);
  });

  it.each(["", "banana", "ORD-1", "ORD-1001", "order 1 0 1 5", "101"])("rejects %s", (input) => {
    expect(normalizeOrderId(input)).toBeNull();
  });

  it("rejects non-strings", () => {
    expect(normalizeOrderId(101)).toBeNull();
    expect(normalizeOrderId(undefined)).toBeNull();
  });
});

describe("getOrderDetails", () => {
  it("returns the supplied facts for ORD-101", () => {
    const r = getOrderDetails("ORD-101");
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.order.status).toBe("Out for Delivery");
      expect(r.order.carrier).toBe("BlueDart");
      expect(r.order.trackingId).toBe("BD-982103");
      expect(r.order.expectedDelivery).toBe("6 PM today");
      expect(r.policy.cancellation.decision).toBe("DENIED");
    }
  });

  it("does not expose the full customer name", () => {
    const r = getOrderDetails("ORD-101");
    expect(JSON.stringify(r)).not.toContain("Sharma");
  });

  it("handles unknown orders safely", () => {
    const r = getOrderDetails("ORD-999");
    expect(r).toMatchObject({ ok: false, error: "ORDER_NOT_FOUND" });
  });

  it("handles invalid IDs safely", () => {
    expect(getOrderDetails("hello")).toMatchObject({ ok: false, error: "INVALID_ORDER_ID" });
  });
});