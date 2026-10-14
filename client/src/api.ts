import type { CallSummary, ChatResponse, PublicOrder, Turn } from "./types";

export const API_BASE: string = import.meta.env.VITE_API_URL ?? "";

export class ApiError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.name = "ApiError";
    this.status = status;
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`${API_BASE}${path}`, init);
  } catch {
    throw new ApiError(0, "I couldn't reach the server. Please check your connection and try again.");
  }
  if (!res.ok) {
    let message = "Something went wrong on the server.";
    try {
      const j = (await res.json()) as { message?: string };
      if (j.message) message = j.message;
    } catch {
      /* response had no JSON body */
    }
    throw new ApiError(res.status, message);
  }
  return (await res.json()) as T;
}

const jsonPost = (body: unknown): RequestInit => ({
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify(body),
});

export const sendChat = (messages: { role: string; content: string }[]) =>
  request<ChatResponse>("/api/chat", jsonPost({ messages }));

export const fetchSummary = (turns: Turn[]) => request<CallSummary>("/api/summary", jsonPost({ turns }));

export const fetchOrders = () => request<{ label: string; orders: PublicOrder[] }>("/api/orders");

export const fetchHealth = () => request<{ ok: boolean; llmConfigured: boolean }>("/api/health");