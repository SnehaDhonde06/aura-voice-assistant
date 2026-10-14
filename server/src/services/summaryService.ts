import { z } from "zod";
import { INTENTS, pickCallIntent, type Intent } from "./intent.js";
import { getOrderDetails, normalizeOrderId, type OrderLookupResult } from "./orderService.js";

export const RESOLUTION_STATUSES = [
  "RESOLVED",
  "UNRESOLVED",
  "ESCALATION_REQUIRED",
  "ACTION_NOT_AVAILABLE",
  "OUT_OF_SCOPE_DECLINED",
] as const;

export const CallSummarySchema = z.object({
  customer_intent: z.enum(INTENTS),
  order_id: z.string().nullable(),
  resolution_status: z.enum(RESOLUTION_STATUSES),
  call_summary: z.string().min(1),
  extracted_facts: z.array(z.string()),
  actions_completed: z.array(z.string()),
  unresolved_questions: z.array(z.string()),
});
export type CallSummary = z.infer<typeof CallSummarySchema>;

export const TurnSchema = z.object({
  role: z.enum(["user", "assistant"]),
  text: z.string().min(1).max(1000),
  ts: z.string().max(40),
});
export type TurnInput = z.infer<typeof TurnSchema>;

export class NoConversationError extends Error {}

type FoundLookup = Extract<OrderLookupResult, { ok: true }>;
type ResolutionStatus = (typeof RESOLUTION_STATUSES)[number];

const INTENT_LABEL: Record<Intent, string> = {
  ORDER_TRACKING: "tracking an order",
  ORDER_STATUS: "the status of an order",
  ORDER_CANCELLATION: "cancelling an order",
  RETURN_REFUND: "a return or refund",
  DAMAGED_PRODUCT: "a damaged or defective product",
  SHIPPING_POLICY: "shipping charges and delivery time",
  COD_POLICY: "Cash on Delivery",
  PRODUCT_INFORMATION: "product information",
  OUT_OF_SCOPE: "something outside Aura Skincare support",
  UNKNOWN: "an unclear request",
};

const ORDER_SPECIFIC = new Set<Intent>(["ORDER_TRACKING", "ORDER_STATUS", "ORDER_CANCELLATION", "DAMAGED_PRODUCT"]);

function orderFacts(found: FoundLookup): string[] {
  const o = found.order;
  const facts = [`${o.orderId}: ${o.product}, ₹${o.valueInr}, status ${o.status} (demo record)`];
  if (o.carrier && o.trackingId) facts.push(`Carrier ${o.carrier}, tracking ID ${o.trackingId}`);
  if (o.expectedDelivery) facts.push(`Expected delivery: ${o.expectedDelivery}`);
  if (o.deliveredDaysAgo !== undefined) facts.push(`Delivered ${o.deliveredDaysAgo} days ago`);
  if (o.orderedHoursAgo !== undefined) facts.push(`Ordered ${o.orderedHoursAgo} hours ago`);
  return facts;
}

function orderSentence(found: FoundLookup): string {
  const o = found.order;
  let s = `Demo record ${o.orderId} (${o.product}) is ${o.status}`;
  if (o.carrier && o.trackingId) s += ` with ${o.carrier}, tracking ${o.trackingId}`;
  if (o.expectedDelivery) s += `, expected ${o.expectedDelivery}`;
  if (o.deliveredDaysAgo !== undefined) s += `, delivered ${o.deliveredDaysAgo} days ago`;
  if (o.orderedHoursAgo !== undefined) s += `, ordered ${o.orderedHoursAgo} hours ago`;
  return `${s}.`;
}

function policySentence(intent: Intent, found: FoundLookup): string {
  switch (intent) {
    case "ORDER_CANCELLATION": return found.policy.cancellation.reason;
    case "RETURN_REFUND": return found.policy.return.reason;
    case "DAMAGED_PRODUCT": return found.policy.damageReport.reason;
    default: return "";
  }
}

const STATUS_SENTENCE: Record<ResolutionStatus, string> = {
  RESOLVED: "The question was answered from policy and demo data.",
  UNRESOLVED: "The request remains unresolved.",
  ESCALATION_REQUIRED: "The request needs a human agent.",
  ACTION_NOT_AVAILABLE: "No account changes were made, because this demo agent cannot perform that action.",
  OUT_OF_SCOPE_DECLINED: "The request was outside Aura Skincare support and was politely declined.",
};

export function buildSummary(turns: TurnInput[]): CallSummary {
  const userTurns = turns.filter((t) => t.role === "user");
  if (userTurns.length === 0) {
    throw new NoConversationError("No customer speech was recorded for this call.");
  }

  const intent = pickCallIntent(userTurns.map((t) => t.text));

  let orderId: string | null = null;
  for (let i = userTurns.length - 1; i >= 0 && !orderId; i--) {
    orderId = normalizeOrderId(userTurns[i].text);
  }
  const lookup = orderId ? getOrderDetails(orderId) : null;
  const found = lookup && lookup.ok ? lookup : null;

  let status: ResolutionStatus = "RESOLVED";
  const unresolved: string[] = [];

  if (intent === "OUT_OF_SCOPE") {
    status = "OUT_OF_SCOPE_DECLINED";
  } else if (intent === "UNKNOWN") {
    status = "UNRESOLVED";
    unresolved.push("The customer's request could not be classified.");
  } else if (lookup && !lookup.ok) {
    status = "UNRESOLVED";
    unresolved.push(lookup.message);
  } else if (!lookup && ORDER_SPECIFIC.has(intent)) {
    status = "UNRESOLVED";
    unresolved.push("No order ID was provided.");
  } else if (found) {
    if (intent === "ORDER_CANCELLATION" && found.policy.cancellation.decision === "ALLOWED") {
      status = "ACTION_NOT_AVAILABLE";
      unresolved.push("Order is eligible for cancellation, but this demo agent cannot perform cancellations.");
    } else if (intent === "RETURN_REFUND" && found.policy.return.decision === "CONDITIONAL") {
      status = "ACTION_NOT_AVAILABLE";
      unresolved.push(...(found.policy.return.conditions ?? []), "This demo agent cannot process returns.");
    } else if (intent === "DAMAGED_PRODUCT" && found.policy.damageReport.decision === "CONDITIONAL") {
      status = "ACTION_NOT_AVAILABLE";
      unresolved.push(...(found.policy.damageReport.conditions ?? []), "This demo agent cannot arrange replacements.");
    }
  }

  const parts = [
    `Customer contacted support about ${INTENT_LABEL[intent]}.`,
    found ? orderSentence(found) : "",
    found ? policySentence(intent, found) : "",
    lookup && !lookup.ok && orderId ? `Order ${orderId} could not be found in the demo database.` : "",
    STATUS_SENTENCE[status],
  ];

  return CallSummarySchema.parse({
    customer_intent: intent,
    order_id: orderId,
    resolution_status: status,
    call_summary: parts.filter(Boolean).join(" "),
    extracted_facts: found ? orderFacts(found) : [],
    actions_completed: [],
    unresolved_questions: unresolved,
  });
}