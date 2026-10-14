import { describe, expect, it } from "vitest";
import { classifyUtterance } from "../src/services/intent.js";
import { enforceNoUnconfirmedActions } from "../src/services/guardrail.js";
import {
  buildSummary,
  CallSummarySchema,
  NoConversationError,
  type TurnInput,
} from "../src/services/summaryService.js";

const turns = (pairs: Array<["user" | "assistant", string]>): TurnInput[] =>
  pairs.map(([role, text], i) => ({ role, text, ts: new Date(2026, 0, 1, 10, 0, i).toISOString() }));

describe("buildSummary", () => {
  it("summarizes a successful tracking call", () => {
    const s = buildSummary(turns([["assistant", "Namaste!"], ["user", "Where is order ORD-101?"], ["assistant", "It is out for delivery."]]));
    expect(s).toMatchObject({
      customer_intent: "ORDER_TRACKING",
      order_id: "ORD-101",
      resolution_status: "RESOLVED",
      actions_completed: [],
    });
    expect(CallSummarySchema.safeParse(s).success).toBe(true);
  });

  it("marks an eligible cancellation as ACTION_NOT_AVAILABLE", () => {
    const s = buildSummary(turns([["user", "Can I cancel ORD-103?"]]));
    expect(s.customer_intent).toBe("ORDER_CANCELLATION");
    expect(s.resolution_status).toBe("ACTION_NOT_AVAILABLE");
    expect(s.actions_completed).toEqual([]);
  });

  it("explains a denied return as RESOLVED without an order ID", () => {
    const s = buildSummary(turns([["user", "I received my sunscreen 14 days ago. Can I return it?"]]));
    expect(s.customer_intent).toBe("RETURN_REFUND");
    expect(s.order_id).toBeNull();
    expect(s.resolution_status).toBe("RESOLVED");
  });

  it("flags unknown orders as UNRESOLVED", () => {
    const s = buildSummary(turns([["user", "I need an update on order ORD-999"]]));
    expect(s.order_id).toBe("ORD-999");
    expect(s.resolution_status).toBe("UNRESOLVED");
  });

  it("declines out-of-scope requests", () => {
    const s = buildSummary(turns([["user", "Can you book me a flight to Goa?"]]));
    expect(s.customer_intent).toBe("OUT_OF_SCOPE");
    expect(s.resolution_status).toBe("OUT_OF_SCOPE_DECLINED");
  });

  it("refuses to summarize a call with no customer speech", () => {
    expect(() => buildSummary(turns([["assistant", "Namaste!"]]))).toThrow(NoConversationError);
  });
});

describe("schema", () => {
  it("rejects invalid summaries", () => {
    expect(CallSummarySchema.safeParse({ customer_intent: "NOPE" }).success).toBe(false);
  });
});

describe("intent", () => {
  it("classifies the demo questions", () => {
    expect(classifyUtterance("How much is shipping for an order worth ₹400?")).toBe("SHIPPING_POLICY");
    expect(classifyUtterance("Is cash on delivery available?")).toBe("COD_POLICY");
    expect(classifyUtterance("mumble mumble")).toBe("UNKNOWN");
  });
});

describe("guardrail", () => {
  it("blocks unconfirmed action claims", () => {
    expect(enforceNoUnconfirmedActions("I've cancelled your order.").blocked).toBe(true);
    expect(enforceNoUnconfirmedActions("Your refund has been processed.").blocked).toBe(true);
  });
  it("allows honest replies", () => {
    expect(enforceNoUnconfirmedActions("Your order cannot be cancelled now.").blocked).toBe(false);
  });
});