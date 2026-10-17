// Mock order database. In production this would be replaced with a read-only
// database query. The policy engine and tool layer do not need to change.
export type OrderStatus = "Processing" | "Shipped" | "Out for Delivery" | "Delivered";

export interface Order {
  readonly orderId: string;
  readonly customerName: string;
  readonly product: string;
  readonly valueInr: number;
  readonly status: OrderStatus;
  readonly carrier?: string;
  readonly trackingId?: string;
  readonly expectedDelivery?: string;
  readonly deliveredDaysAgo?: number;
  readonly orderedHoursAgo?: number;
}

export const DEMO_DATA_LABEL = "Demo data supplied with the assessment. Not real customer records.";

const ORDERS: readonly Order[] = [
  {
    orderId: "ORD-101",
    customerName: "Priya Sharma",
    product: "Vitamin C Serum (30ml)",
    valueInr: 699,
    status: "Out for Delivery",
    carrier: "BlueDart",
    trackingId: "BD-982103",
    expectedDelivery: "6 PM today",
  },
  {
    orderId: "ORD-102",
    customerName: "Rahul Verma",
    product: "Hydrating Sunscreen SPF 50",
    valueInr: 499,
    status: "Delivered",
    carrier: "Delhivery",
    trackingId: "DL-441029",
    deliveredDaysAgo: 14,
  },
  {
    orderId: "ORD-103",
    customerName: "Ananya Patel",
    product: "Green Tea Face Wash + Toner",
    valueInr: 850,
    status: "Processing",
    orderedHoursAgo: 3,
  },
];

export function findOrder(id: string): Order | undefined {
  return ORDERS.find((o) => o.orderId === id);
}

export function listOrders(): readonly Order[] {
  return ORDERS;
}