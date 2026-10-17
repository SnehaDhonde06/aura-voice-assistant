// Output guardrail: blocks any reply claiming an action was performed
// (cancellation, refund, replacement) since this demo agent has no action tools.
const ACTION_CLAIMS: RegExp[] = [
  /\b(i|we)(?:'ve|\s+have)?\s+(?:just\s+|now\s+)?(cancel+ed|processed|refunded|initiated|booked|replaced|arranged|escalated)\b/i,
  /\b(?:has|have|had)\s+been\s+(?:cancel+ed|refunded|processed|initiated|replaced|booked)\b/i,
];

export const SAFE_REPLACEMENT =
  "I can only share information with you here, and I haven't made any changes to your order. Is there anything else I can help you with?";

export function enforceNoUnconfirmedActions(text: string): { text: string; blocked: boolean } {
  if (ACTION_CLAIMS.some((p) => p.test(text))) return { text: SAFE_REPLACEMENT, blocked: true };
  return { text, blocked: false };
}

export function sanitizeForSpeech(text: string): string {
  return text.replace(/[*_#`]/g, "").replace(/\s+/g, " ").trim();
}