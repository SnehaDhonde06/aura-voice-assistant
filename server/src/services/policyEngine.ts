// Deterministic policy rules for Aura Skincare. The LLM receives verdicts
// from these functions and cannot override or contradict them.
import type { Order } from "../data/orders.js";

export const POLICY = {
  FREE_SHIPPING_ABOVE_INR: 499,
  SHIPPING_FEE_INR: 50,
  RETURN_WINDOW_DAYS: 7,
  DAMAGE_REPORT_WINDOW_HOURS: 48,
  COD_MAX_INR: 2500,
} as const;

export type Decision = "ALLOWED" | "DENIED" | "CONDITIONAL" | "NOT_APPLICABLE";

export interface PolicyVerdict {
  decision: Decision;
  reason: string;
  conditions?: string[];
}

export function checkCancellation(order: Order): PolicyVerdict {
  if (order.status === "Processing") {
    return { decision: "ALLOWED", reason: "Order is still Processing, so it is eligible for cancellation." };
  }
  if (order.status === "Delivered") {
    return {
      decision: "DENIED",
      reason: "Order is already delivered, so it cannot be cancelled. A return may be possible under the return policy.",
    };
  }
  return {
    decision: "DENIED",
    reason: `Order is ${order.status}, and only Processing orders can be cancelled. The customer may refuse delivery at the doorstep.`,
  };
}

export function checkReturn(order: Order): PolicyVerdict {
  if (order.status !== "Delivered" || order.deliveredDaysAgo === undefined) {
    return {
      decision: "NOT_APPLICABLE",
      reason: `Order is ${order.status}, not delivered yet, so the 7-day return window has not started.`,
    };
  }
  if (order.deliveredDaysAgo > POLICY.RETURN_WINDOW_DAYS) {
    return {
      decision: "DENIED",
      reason: `Delivered ${order.deliveredDaysAgo} days ago, which is outside the 7-day return window.`,
    };
  }
  return {
    decision: "CONDITIONAL",
    reason: `Delivered ${order.deliveredDaysAgo} day(s) ago, which is within the 7-day return window.`,
    conditions: ["The product must be unopened, unused, and in its original packaging."],
  };
}

export function checkDamageReport(order: Order): PolicyVerdict {
  if (order.status !== "Delivered" || order.deliveredDaysAgo === undefined) {
    return {
      decision: "NOT_APPLICABLE",
      reason: `Order is ${order.status}, not delivered yet, so there is nothing to report as damaged.`,
    };
  }
  if (order.deliveredDaysAgo * 24 > POLICY.DAMAGE_REPORT_WINDOW_HOURS) {
    return {
      decision: "DENIED",
      reason: `Delivered ${order.deliveredDaysAgo} days ago, which is beyond the 48-hour window for reporting damaged or defective products.`,
    };
  }
  return {
    decision: "CONDITIONAL",
    reason: `Delivered ${order.deliveredDaysAgo} day(s) ago, which is within the 48-hour reporting window.`,
    conditions: [
      "Photos of the damaged or defective product are required.",
      "The remedy offered by policy is a replacement.",
    ],
  };
}

export interface ShippingQuote {
  decision: "FREE" | "FEE_APPLIES" | "UNSPECIFIED";
  feeInr: number | null;
  reason: string;
  standardDelivery: string;
}

export function calculateShipping(valueInr: number): ShippingQuote {
  const standardDelivery = "Standard delivery takes 3 to 5 business days.";
  if (valueInr > POLICY.FREE_SHIPPING_ABOVE_INR) {
    return { decision: "FREE", feeInr: 0, reason: "Delivery is free on orders above ₹499.", standardDelivery };
  }
  if (valueInr < POLICY.FREE_SHIPPING_ABOVE_INR) {
    return {
      decision: "FEE_APPLIES",
      feeInr: POLICY.SHIPPING_FEE_INR,
      reason: "Orders below ₹499 have a ₹50 shipping fee.",
      standardDelivery,
    };
  }
  return {
    decision: "UNSPECIFIED",
    feeInr: null,
    reason:
      "Policy says free above ₹499 and a ₹50 fee below ₹499. It does not state the fee for exactly ₹499, so do not guess.",
    standardDelivery,
  };
}

export function checkCod(valueInr: number): PolicyVerdict {
  if (valueInr <= POLICY.COD_MAX_INR) {
    return {
      decision: "ALLOWED",
      reason: "Cash on Delivery is available for orders up to ₹2,500. The customer can pay by cash or UPI at the doorstep.",
    };
  }
  return { decision: "DENIED", reason: "Cash on Delivery is not available for orders above ₹2,500." };
}