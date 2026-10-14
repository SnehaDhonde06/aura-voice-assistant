import { z } from "zod";
import { getOrderDetails } from "./orderService.js";
import { calculateShipping, checkCod } from "./policyEngine.js";

export const TOOL_DEFINITIONS = [
  {
    type: "function",
    function: {
      name: "get_order_details",
      description:
        "Look up an Aura Skincare order by order ID. Returns order facts plus policy verdicts (cancellation, return, damage report, COD). Call this whenever the customer asks about a specific order.",
      parameters: {
        type: "object",
        properties: { order_id: { type: "string", description: "The order ID the customer stated, e.g. ORD-101" } },
        required: ["order_id"],
        additionalProperties: false,
      },
    },
  },
  {
    type: "function",
    function: {
      name: "calculate_shipping",
      description: "Get the shipping fee for a given order value in rupees.",
      parameters: {
        type: "object",
        properties: { order_value_inr: { type: "number", description: "Order value in rupees" } },
        required: ["order_value_inr"],
        additionalProperties: false,
      },
    },
  },
  {
    type: "function",
    function: {
      name: "check_cod_eligibility",
      description: "Check whether Cash on Delivery is available for a given order value in rupees.",
      parameters: {
        type: "object",
        properties: { order_value_inr: { type: "number", description: "Order value in rupees" } },
        required: ["order_value_inr"],
        additionalProperties: false,
      },
    },
  },
];

const OrderArgs = z.object({ order_id: z.string().min(1).max(40) });
const ValueArgs = z.object({ order_value_inr: z.coerce.number().finite().min(0).max(1_000_000) });

export interface ToolOutcome {
  name: string;
  args: unknown;
  result: unknown;
  ms: number;
}

export function executeTool(name: string, rawArgs: string): ToolOutcome {
  const t0 = Date.now();
  const finish = (args: unknown, result: unknown): ToolOutcome => ({ name, args, result, ms: Date.now() - t0 });

  let args: unknown;
  try {
    args = rawArgs ? JSON.parse(rawArgs) : {};
  } catch {
    return finish(rawArgs, { ok: false, error: "INVALID_ARGUMENTS" });
  }

  switch (name) {
    case "get_order_details": {
      const parsed = OrderArgs.safeParse(args);
      if (!parsed.success) return finish(args, { ok: false, error: "INVALID_ARGUMENTS" });
      return finish(args, getOrderDetails(parsed.data.order_id));
    }
    case "calculate_shipping": {
      const parsed = ValueArgs.safeParse(args);
      if (!parsed.success) return finish(args, { ok: false, error: "INVALID_ARGUMENTS" });
      return finish(args, { ok: true, ...calculateShipping(parsed.data.order_value_inr) });
    }
    case "check_cod_eligibility": {
      const parsed = ValueArgs.safeParse(args);
      if (!parsed.success) return finish(args, { ok: false, error: "INVALID_ARGUMENTS" });
      return finish(args, { ok: true, ...checkCod(parsed.data.order_value_inr) });
    }
    default:
      return finish(args, { ok: false, error: "UNKNOWN_TOOL" });
  }
}