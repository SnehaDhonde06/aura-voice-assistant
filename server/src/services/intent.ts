export const INTENTS = [
  "ORDER_TRACKING",
  "ORDER_STATUS",
  "ORDER_CANCELLATION",
  "RETURN_REFUND",
  "DAMAGED_PRODUCT",
  "SHIPPING_POLICY",
  "COD_POLICY",
  "PRODUCT_INFORMATION",
  "OUT_OF_SCOPE",
  "UNKNOWN",
] as const;

export type Intent = (typeof INTENTS)[number];

// Order matters: the first matching rule wins.
const RULES: Array<[Intent, RegExp]> = [
  ["ORDER_CANCELLATION", /\bcancel/],
  ["DAMAGED_PRODUCT", /\b(damag|defect|broken|leak|spill|torn|crack)/],
  ["RETURN_REFUND", /\b(return|refund|replace|exchange|money back)/],
  ["COD_POLICY", /\b(cod|cash on delivery|pay on delivery|pay (by )?cash)\b/],
  ["SHIPPING_POLICY", /\b(shipping|delivery (charge|fee|cost|time)|how (long|many days)|business days|free delivery)\b/],
  ["ORDER_TRACKING", /\b(track|tracking|where is|where's|where are|out for delivery|when will .* (arrive|come|deliver))/],
  ["ORDER_STATUS", /\b(status|update|delivered|processing|shipped)\b/],
  ["PRODUCT_INFORMATION", /\b(serum|sunscreen|face ?wash|toner|ingredient|skin|organic|moisturi[sz]er|product|vitamin c|spf)/],
  ["OUT_OF_SCOPE", /\b(flight|hotel|weather|movie|cricket|stock|bitcoin|recipe|joke|news|politic|loan|train ticket|cab|taxi)/],
];

export function classifyUtterance(text: string): Intent {
  const t = text.toLowerCase();
  for (const [intent, pattern] of RULES) {
    if (pattern.test(t)) return intent;
  }
  return "UNKNOWN";
}

export function pickCallIntent(userTexts: string[]): Intent {
  const counts = new Map<Intent, number>();
  for (const text of userTexts) {
    const intent = classifyUtterance(text);
    if (intent !== "UNKNOWN") counts.set(intent, (counts.get(intent) ?? 0) + 1);
  }
  let best: Intent = "UNKNOWN";
  let bestCount = 0;
  for (const [intent, count] of counts) {
    if (count > bestCount) {
      best = intent;
      bestCount = count;
    }
  }
  return best;
}