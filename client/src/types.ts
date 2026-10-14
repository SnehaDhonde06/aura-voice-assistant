export type Role = "user" | "assistant";
export type Phase = "welcome" | "call" | "summary";
export type CallState = "idle" | "listening" | "thinking" | "speaking";
export type MicStatus = "off" | "requesting" | "on" | "denied" | "unavailable";
export type InputMode = "voice" | "text";

export interface Turn {
  role: Role;
  text: string;
  ts: string;
}

export interface ToolTrace {
  name: string;
  args: unknown;
  result: unknown;
  ms: number;
}

export interface TurnTrace {
  id: number;
  userText: string;
  tools: ToolTrace[];
  totalMs: number;
  guardrailBlocked: boolean;
}

export interface PublicOrder {
  orderId: string;
  customerFirstName: string;
  product: string;
  valueInr: number;
  status: string;
  carrier?: string;
  trackingId?: string;
  expectedDelivery?: string;
  deliveredDaysAgo?: number;
  orderedHoursAgo?: number;
}

export interface CallSummary {
  customer_intent: string;
  order_id: string | null;
  resolution_status: string;
  call_summary: string;
  extracted_facts: string[];
  actions_completed: string[];
  unresolved_questions: string[];
}

export type SummaryState =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "empty" }
  | { status: "error"; message: string }
  | { status: "ready"; data: CallSummary };

export interface ChatResponse {
  reply: string;
  trace: ToolTrace[];
  guardrailBlocked: boolean;
  totalMs: number;
}