import { findOrder, listOrders, type Order, type OrderStatus } from "../data/orders.js";
import {
  checkCancellation,
  checkCod,
  checkDamageReport,
  checkReturn,
  type PolicyVerdict,
} from "./policyEngine.js";

const SPOKEN_DIGITS: Record<string, string> = {
  zero: "0", oh: "0", one: "1", two: "2", three: "3",
  four: "4", five: "5", six: "6", seven: "7", eight: "8", nine: "9",
};

// Accepts "ORD-101", "ord 101", "ORD101", "order id is 101", "order one zero one", "o r d one oh one"
const ORDER_ID_PATTERN =
  /\bo\s*r\s*d(?:er)?(?:\s*(?:id|number|no\.?|is|#|-))*\s*((?:\d\s*){3})(?!\s*\d)/;

export function normalizeOrderId(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const text = raw
    .toLowerCase()
    .replace(/\b(zero|oh|one|two|three|four|five|six|seven|eight|nine)\b/g, (w) => SPOKEN_DIGITS[w] ?? w);
  const match = ORDER_ID_PATTERN.exec(text);
  if (!match) return null;
  return `ORD-${match[1].replace(/\s/g, "")}`;
}

export interface PublicOrder {
  orderId: string;
  customerFirstName: string;
  product: string;
  valueInr: number;
  status: OrderStatus;
  carrier?: string;
  trackingId?: string;
  expectedDelivery?: string;
  deliveredDaysAgo?: number;
  orderedHoursAgo?: number;
}

export interface OrderPolicyView {
  cancellation: PolicyVerdict;
  return: PolicyVerdict;
  damageReport: PolicyVerdict;
  cod: PolicyVerdict;
}

export type OrderLookupResult =
  | { ok: true; order: PublicOrder; policy: OrderPolicyView; dataSource: "demo" }
  | { ok: false; error: "INVALID_ORDER_ID" | "ORDER_NOT_FOUND"; message: string };

function toPublic(o: Order): PublicOrder {
  const { customerName, ...rest } = o;
  return { ...rest, customerFirstName: customerName.split(" ")[0] };
}

export function getOrderDetails(rawId: unknown): OrderLookupResult {
  const id = normalizeOrderId(rawId);
  if (!id) {
    return {
      ok: false,
      error: "INVALID_ORDER_ID",
      message: "That does not look like a valid order ID. Order IDs look like ORD-101.",
    };
  }
  const order = findOrder(id);
  if (!order) {
    return { ok: false, error: "ORDER_NOT_FOUND", message: `No order with ID ${id} exists in the demo database.` };
  }
  return {
    ok: true,
    dataSource: "demo",
    order: toPublic(order),
    policy: {
      cancellation: checkCancellation(order),
      return: checkReturn(order),
      damageReport: checkDamageReport(order),
      cod: checkCod(order.valueInr),
    },
  };
}

export function listPublicOrders(): PublicOrder[] {
  return listOrders().map(toPublic);
}