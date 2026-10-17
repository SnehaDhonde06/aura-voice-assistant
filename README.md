

## Architecture
Customer mic
│
▼
Browser Web Speech API (STT, en-IN + hi-IN dual recognizer)
│ interim captions shown live
▼
useCall hook (React) — manages call state machine
│ POST /api/chat {messages: [...]}
▼
Express server (Node.js + TypeScript)
│
├── Rate limiter (60 req/min)
├── Zod input validation
├── LLM service → Groq / Gemini / OpenAI (auto-selected, with fallback)
│ │ tool_calls from model
│ ▼
│ Tools: get_order_details · calculate_shipping · check_cod_eligibility
│ │
│ ▼
│ Order service (read-only mock store)
│ Policy engine (deterministic rules — model cannot override)
│ Output guardrail (blocks unconfirmed action claims)
│
└── /api/summary → deterministic call summary (no LLM)
│
▼
Browser Speech Synthesis API (TTS, en-IN voice)
+ VAD-based barge-in (customer speech stops Aria mid-sentence)


**Key design principle:** the LLM interprets the customer's intent and explains results, but never makes policy decisions. Every verdict (return eligible / cancellation denied / free shipping) comes from deterministic TypeScript functions. The LLM cannot contradict them.

---

## Voice pipeline

1. **STT:** browser `SpeechRecognition` with two parallel recognizers (`en-IN` and `hi-IN`). First final result wins — handles English, Indian English, and basic Hinglish.
2. **LLM:** Groq (primary, very fast), Gemini (fallback), OpenAI (fallback). Model names are auto-discovered from each provider's `/models` endpoint if the configured name is retired.
3. **TTS:** browser `speechSynthesis` with `en-IN` voice preference. Swappable: set `VITE_TTS_PROVIDER=elevenlabs` and add server keys for premium voice.
4. **Barge-in:** a 16 ms VAD loop monitors mic level during Aria's speech. Eight consecutive frames above threshold (~130 ms of audio) cancel playback immediately.
5. **Latency:** Groq's LPU inference typically returns in 300–800 ms for short replies. The main perceived latency is browser TTS synthesis, which starts in under 50 ms.

---

## Tool execution and policy guardrails

Tools are defined in `server/src/services/tools.ts` and executed server-side only. The LLM never sees raw order data — it receives structured tool results that already include policy verdicts:

```json
{
  "ok": true,
  "order": { "orderId": "ORD-103", "status": "Processing", ... },
  "policy": {
    "cancellation": { "decision": "ALLOWED", "reason": "Order is still Processing..." },
    "return": { "decision": "NOT_APPLICABLE", ... }
  }
}
```

An output guardrail (`server/src/services/guardrail.ts`) scans every reply for phrases like "I've cancelled your order" or "your refund has been processed" and replaces them with a safe fallback, because this demo agent cannot actually modify orders.

---

## Known limitations

- **Browser STT** works reliably only in Chrome and Edge. Safari and Firefox fall back to the text input.
- **No streaming.** Each reply waits for the full LLM response. Sentence-by-sentence streaming to TTS is the main latency improvement left.
- **Barge-in** uses mic level, not a separate voice activity detection model, so loud background noise can trigger it.
- **Hinglish STT** runs two parallel browser recognizers. It works for code-switching but not for pure Hindi sentences with non-Latin script.
- **Free-tier rate limits.** Gemini's free tier hits 503 under load. Adding a Groq key (also free) provides automatic failover.
- **Mock data only.** No real orders, no real cancellations, no real refunds.

---

## Reflection

**1. Why did you choose this architecture and stack?**

TypeScript end-to-end (Node + React) means shared types between the client and server, which eliminated a whole class of bugs in tool argument shapes and summary schema. I chose Groq as the primary LLM because its LPU inference is 3–5× faster than GPU providers on short prompts, which matters a lot for a voice agent where every 200 ms of "thinking" time is felt. The provider interface means Gemini or OpenAI can be swapped in one `.env` line — useful when free-tier limits hit. Browser Web Speech API was the pragmatic choice: zero cost, zero latency to start, and good Indian English support in Chrome.

**2. What was the most difficult part?**

Keeping the LLM honest. A language model will confidently say "I've cancelled your order" or invent a refund policy exception if the system prompt isn't tight enough. I solved this with two layers: a deterministic policy engine whose verdicts are returned as structured tool results (so the LLM only explains, never decides), and an output guardrail that scans every reply for unconfirmed action claims before it reaches the customer. The ₹499 shipping edge case — where the policy says free *above* ₹499 and a fee *below* ₹499 but says nothing about exactly ₹499 — was a concrete example. The engine returns `UNSPECIFIED` rather than guessing. Most implementations would silently pick one.

**3. If I had one more week, what would I improve first?**

Real-time streaming: chunk the LLM response by sentence and pipe each sentence to TTS as it arrives, rather than waiting for the full reply. This alone would cut perceived latency by 60–70% for longer answers. After that, I'd replace browser STT with Groq Whisper (also free), which handles accents and Hinglish far better and works in all browsers.

**4. At 1,000 conversations a day, what would need to change?**

- **LLM costs** become real. At ~500 tokens per turn and ~5 turns per call, that is ~2.5 million tokens per day. Groq's free tier would be exhausted in minutes; the provider interface makes it straightforward to switch to a paid tier or route by load.
- **The mock order store** would be replaced with a read-only database query. The policy engine and tool layer don't need to change.
- **STT and TTS** would move server-side (Groq Whisper + ElevenLabs or Cartesia) for consistency across browsers and to support call recording.
- **Observability:** the agent trace panel is useful during development, but at scale you'd want structured logs (turn latency per provider, guardrail block rate, intent distribution, resolution rate) to catch regressions and measure quality.
- **Rate limiting** is per-IP today. At scale you'd tie it to a customer session token and add a queue for burst traffic.

---

## Setup

### Prerequisites
- Node.js 20 LTS
- A free API key from [Google AI Studio](https://aistudio.google.com) (Gemini) or [Groq](https://console.groq.com)

### Local development (Windows PowerShell)

```powershell
# Clone and install
git clone https://github.com/YOUR_USERNAME/aura-voice-studio.git
cd aura-voice-studio

# Server
cd server
Copy-Item .env.example .env
# Edit .env: add your GEMINI_API_KEY or GROQ_API_KEY
npm install
npm run dev       # http://localhost:8787

# Client (new terminal)
cd ..\client
Copy-Item .env.example .env
npm install
npm run dev       # http://localhost:5173
```

Open **http://localhost:5173** in Chrome or Edge. Allow the microphone when prompted.

### Run tests

```powershell
cd server
npm test
```

### List available models for your keys

```powershell
cd server
npm run models
```

---

## Demo script

1. **Start call.** Aria greets you.
2. **Order tracking:** say "Where is order ORD-101?" — Aria calls `get_order_details`, returns BlueDart tracking and expected delivery.
3. **Cancellation:** say "Can I cancel ORD-103?" — Aria confirms it's eligible (Processing status) but explains she cannot action it in this demo.
4. **Policy denial:** say "I received my order 14 days ago, can I return it?" — Aria explains the 7-day window has passed.
5. **Shipping:** say "How much is shipping for ₹400?" — Aria calls `calculate_shipping`, returns ₹50 fee.
6. **Unknown order:** say "What about order ORD-999?" — Aria says she couldn't locate it and asks you to verify.
7. **Out of scope:** say "Can you book me a flight to Goa?" — Aria politely declines.
8. **Barge in:** while Aria is speaking, start talking — she stops immediately.
9. **End call.** View the transcript, JSON summary, and copy/download buttons.
10. Open **Under the hood** to show the evaluator the tool calls, policy verdicts, and latency numbers.

---

## Manual evaluation checklist

- [ ] Start Call works in Chrome/Edge, mic permission requested only then
- [ ] Orb changes state: Idle → Listening → Thinking → Speaking
- [ ] ORD-101: Out for Delivery, BlueDart, expected 6 PM today
- [ ] ORD-102: Delivered 14 days ago, return denied
- [ ] ORD-103: Processing, cancellation allowed
- [ ] ORD-999: handled gracefully, not invented
- [ ] ₹400 shipping: ₹50 fee
- [ ] ₹499 shipping: Aria says policy doesn't specify that exact amount
- [ ] ₹600 shipping: free delivery
- [ ] Flight to Goa: out-of-scope decline
- [ ] Barge-in: Aria stops when you speak during playback
- [ ] End Call produces a transcript and JSON summary
- [ ] Copy JSON and Download JSON buttons work
- [ ] Copy transcript and Download transcript buttons work
- [ ] Text input fallback works when mic is denied
- [ ] No API keys in the browser (check DevTools → Network)
- [ ] Under the hood shows tool calls and policy verdicts

---

## Deployment

See deployment section in README or the deployment steps provided separately.

---

## `.env.example`

PORT=8787
CORS_ORIGIN=http://localhost:5173
LLM_PROVIDER=gemini
GEMINI_API_KEY=your_gemini_api_key_here
GEMINI_MODEL=gemini-3.8-flash
GEMINI_FALLBACK_MODELS=gemini-3.5-flash-lite
GROQ_API_KEY=your_groq_api_key_here
GROQ_MODEL=llama-3.1-8b-instant
OPENAI_API_KEY=
OPENAI_MODEL=gpt-4o-mini
ELEVENLABS_API_KEY=
ELEVENLABS_VOICE_ID=