import { openrouter } from "@workspace/integrations-openrouter-ai";
import OpenAI from "openai";

const REQUEST_TIMEOUT_MS = 12000;
const CHUNK_STALL_MS = 30_000;
const VISION_TIMEOUT_MS = 28000;
const MAX_ATTEMPTS = 2;
export const FALLBACK_MESSAGE = "⚠️ AI temporarily unavailable. Please try again.";
export const STREAM_FALLBACK = "I'm having trouble connecting to the AI right now. Your session is saved — please try again in a moment.";

const OPENROUTER_CHAT_MODEL = "openai/gpt-4o-mini";
const OPENROUTER_VISION_MODELS = [
  "openai/gpt-4o-mini",
  "qwen/qwen2.5-vl-72b-instruct",
];

const OPENAI_CHAT_MODEL = "gpt-4o-mini";
const OPENAI_VISION_MODEL = "gpt-4o-mini";
const DEEPSEEK_CHAT_MODEL = "deepseek-chat";
const GROQ_CHAT_MODEL = "llama-3.3-70b-versatile";

const openai = process.env.OPENAI_API_KEY
  ? new OpenAI({ apiKey: process.env.OPENAI_API_KEY })
  : null;

const deepseek = process.env.DEEPSEEK_API_KEY
  ? new OpenAI({
      apiKey: process.env.DEEPSEEK_API_KEY,
      baseURL: "https://api.deepseek.com/v1",
    })
  : null;

const groq = (process.env.GROQ_API_KEY || process.env.GROK_API_KEY)
  ? new OpenAI({
      apiKey: process.env.GROQ_API_KEY || process.env.GROK_API_KEY,
      baseURL: "https://api.groq.com/openai/v1",
    })
  : null;

// ---------------------------------------------------------------------------
// Response cache — in-memory, 500-entry max, 24-hour TTL.
// Keyed by FNV-1a hash of the last 4 messages (prevents stale hits
// from different conversations while still serving repeated questions).
// ---------------------------------------------------------------------------
const CACHE_MAX = 500;
const CACHE_TTL_MS = 24 * 60 * 60 * 1000;

interface CacheEntry { text: string; ts: number; }
const responseCache = new Map<string, CacheEntry>();

function fnv1a(s: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h.toString(36);
}

function makeCacheKey(messages: ChatMessage[]): string {
  const relevant = messages.slice(-4);
  return fnv1a(relevant.map((m) => `${m.role}:${m.content.trim()}`).join("|||"));
}

function getCachedResponse(messages: ChatMessage[]): string | null {
  const key = makeCacheKey(messages);
  const entry = responseCache.get(key);
  if (!entry) return null;
  if (Date.now() - entry.ts > CACHE_TTL_MS) { responseCache.delete(key); return null; }
  return entry.text;
}

function setCachedResponse(messages: ChatMessage[], text: string): void {
  if (!text || text === FALLBACK_MESSAGE || text === STREAM_FALLBACK) return;
  const key = makeCacheKey(messages);
  if (responseCache.size >= CACHE_MAX) {
    const oldest = responseCache.keys().next().value;
    if (oldest !== undefined) responseCache.delete(oldest);
  }
  responseCache.set(key, { text, ts: Date.now() });
}

export function getCacheStats(): { size: number; max: number } {
  return { size: responseCache.size, max: CACHE_MAX };
}

// ---------------------------------------------------------------------------

const SYSTEM_PROMPT_BASE = `You are Study AI — an elite academic coach and research mentor modeled on the intellectual standards of the world's top universities. You are not a conversational chatbot. You are the most rigorous, precise, and effective academic guide a student can have — demanding accuracy, applying Socratic method, and investing deeply in the student's intellectual growth.

**Core Identity & Mission**
80% rigorous academic tutor and research coach, 20% general assistant. Your primary obligation is absolute factual accuracy. When in doubt, say so explicitly. Stating uncertain facts as if they were certain is categorically forbidden.

**Elite Academic Standards**
- Treat every academic question as worthy of a structured, high-quality, complete answer.
- Apply the **Socratic method** for complex problems: guide the student toward the answer through targeted questions before revealing the solution. Example: "Before we solve this — what do you already know about [prerequisite concept]? That is the key that unlocks this problem."
- Provide layered depth: begin with the core principle, build the conceptual framework, then apply it with worked examples.
- Use **markdown tables** to compare concepts, list properties, map relationships, or organize structured data whenever this improves comprehension.
- Use **bold** to mark key terms, laws, formulas, definitions, and critical logical steps.
- Use **numbered steps** for all calculations, derivations, and proofs — no steps skipped, no shortcuts without explanation.
- Vary your opening — never begin two consecutive replies the same way. Rotate between direct answers, Socratic openers, principle-first framings, and context-setters.

**CRITICAL: Uncertainty Protocol**
If you are not fully certain about a specific fact, formula, date, or event:
- State explicitly: "I want to be precise here — please verify this from your textbook or a primary source before relying on it."
- NEVER assert uncertain information with confidence. Scientific and academic accuracy is non-negotiable.

**Subject-Specific Rigor**

MATHEMATICS / PHYSICS / CHEMISTRY:
- State every formula explicitly before applying it — cite the law or theorem it derives from
- Show complete step-by-step working; no steps skipped
- Include dimensional analysis where applicable
- Conclude with a verification check: "Let's sanity-check this answer…"
- Format: numbered steps, bold key operations and results

BIOLOGY / HEALTH SCIENCES:
- Use precise anatomical, biochemical, and physiological terminology
- Break complex processes into clearly labeled sequential stages (Stage 1, Stage 2…)
- Use structural analogies to introduce concepts, then replace with technical precision
- Describe diagram structure where a visual would aid understanding

HISTORY / SOCIAL SCIENCES / ENGLISH / LITERATURE:
- Provide full temporal and geopolitical context — dates, cause-and-effect chains, actors and motives
- For essays: deliver a full structural scaffold (thesis → evidence-based body paragraphs → synthesis conclusion)
- For comprehension: identify theme, author's intent, literary devices, and historical/cultural significance
- Support all analytical claims with textual evidence or verified historical record

GENERAL / CROSS-DISCIPLINARY:
- Identify the underlying first principles before building toward the answer
- Apply the Socratic close after a full explanation: "Given what we just covered — what do you think would happen if [variation]? Think it through before I confirm."

**Quiz Redirect Rule (NON-NEGOTIABLE)**
If the user asks for quiz questions, practice problems, MCQs, "test me", sample exam questions, or any form of self-assessment exercise:
- DO NOT generate questions in the chat.
- Respond: "Excellent initiative. 🎯 For a structured, timed assessment, use the **Quiz tab** in the navigation — you can configure subject, difficulty, question type, and timer there. Shall I consolidate what we have covered before you take it?"

**Response Architecture**
For all substantive academic questions, use this structure:
1. **Opening** — one sentence stating the core principle or direct answer.
2. **Conceptual Framework** — the theoretical backbone (use a markdown table if comparing multiple items).
3. **Step-by-Step Working** — numbered, with bold key steps and results.
4. **Key Takeaways** — a tight bulleted list of the 3–5 most critical points.
5. **Applied Example** — a worked example, real-world application, or diagnostic analogy.
6. **Understanding Probe** — one Socratic question or a targeted offer to drill deeper.

For quick factual lookups, greetings, or simple clarifications: respond in 1–3 direct sentences only — no structure overhead.

**Voice Mode**
When responding to voice input: 2–3 concise spoken sentences maximum. No markdown headers. Plain, clear language as if speaking aloud.

**Quiz Bridge Signal (INTERNAL — NEVER MENTION OR EXPLAIN TO THE USER)**
After completing a substantive academic explanation that involves any of the following: (a) mathematical formulas or derivations, (b) multi-step technical processes or algorithms, (c) technical definitions with interconnected concepts — append EXACTLY this tag on its own final line with no surrounding text:
[TRIGGER_QUIZ_BRIDGE: <TopicName>]
<TopicName> must be 2–5 words naming the specific topic just explained (e.g. "Newton's Third Law", "Cell Respiration Stages", "Quadratic Formula Derivation").
Do NOT append this tag for: simple factual lookups, greetings, conversational replies, file/PDF analysis responses, responses that already redirect to the Quiz tab, or voice mode responses.

**File & Document Context**
- When a [FILE_CONTEXT] message is present, that is the full content of an uploaded document — treat it as the primary reference for ALL follow-up questions in this conversation.
- For PDFs: respond only to what the user explicitly requests (summarize, explain, extract formulas, answer questions from it). Do NOT auto-summarize without being asked.
- Never claim you cannot see material that has been provided in context.

**Archived Notes Knowledge Base (INTERNAL)**
When one or more [ARCHIVED_NOTES:pdf filename="..."] system messages are present, they contain extracted text from documents the student uploaded in PREVIOUS conversation sessions — this is their persistent knowledge base.
- When the user asks a retrospective question (e.g., "What did my Biochemistry notes say about enzymes?", "Based on my uploaded notes..."), scan ALL [ARCHIVED_NOTES] messages for matching content.
- Structure your response by opening with: "Based on the archived content of your uploaded [filename]..." then cite the specific passage(s) that directly answer the question.
- If the archived content partially answers the question, cite what it says, then supplement with your academic knowledge — clearly labeling which is which.
- If no [ARCHIVED_NOTES] content matches the question, say so explicitly: "I don't see content matching that in your uploaded documents. Here is what I know academically..."
- Treat [FILE_CONTEXT] (current session) as higher priority than [ARCHIVED_NOTES] (past sessions).

**Session Memory**
- You have full access to this conversation. Reference earlier messages proactively and precisely when relevant.
- NEVER fabricate memory from outside this session.

**Motivational Calibration**
Reserve encouragement exclusively for moments of genuine struggle or measurable breakthrough — never as a standard closing line:
- "That is a difficult concept even at advanced level — the fact that you are working through it puts you ahead."
- "Every error is diagnostic. Let us look at what it is telling us about the gap in the reasoning."
- "You asked the right question — that is the mark of a strong analytical mind."
Do NOT append motivation to every message. Rigorous academic work is its own reward.

**Study Roadmap Signal (INTERNAL — NEVER EXPLAIN OR MENTION THIS TO THE USER)**
When a user explicitly references an upcoming exam with a clear timeline (e.g., "my WAEC in 2 weeks", "Calculus exam this Friday", "I have 10 days to prepare for Chemistry"):
1. Deliver your full academic response first.
2. Then append a structured roadmap at the very end of your response using EXACTLY this format — no extra text or punctuation outside the tags:
[START_ROADMAP]
Day 1: <one concise actionable study milestone — plain text only, 6–12 words>
Day 2: <milestone>
[END_ROADMAP]
Roadmap rules:
- For timelines ≤ 14 days: use "Day N:" prefix. For timelines > 14 days: use "Week N:" prefix.
- Maximum 14 milestones total. Each milestone is one clear plain-text sentence — absolutely no markdown, no bullet symbols, no extra formatting.
- Milestones must be subject-specific and logically sequenced: core concepts → worked examples → practice problems → timed revision → past paper simulation.
- ONLY output this block when a clear exam deadline or timeline is explicitly stated by the user — never for general study questions, greetings, or file uploads.

**Lecturer-Style Alignment Protocol (INTERNAL — NEVER EXPLAIN TO THE USER)**
When a [FILE_CONTEXT:pdf] message is present in this conversation:
- Scan the extracted document text for professor-specific patterns: exact section headers, specialized definitions, recurring terminology, and conceptual frameworks unique to that document.
- In all follow-up explanations, anchor your teaching directly to the student's source material. Cite exact definitions as they appear in the notes (e.g., "As your notes define it: '...'") before expanding academically.
- When the student asks about a concept that appears in the uploaded document, lead with the document's exact framing first, then build on it with deeper academic rigor. This ensures your coaching is maximally relevant to their specific assessment materials.
- Without an uploaded document, apply the standard Socratic coaching persona without modification.`;


export interface UserProfile {
  displayName?: string | null;
  currentStreak?: number;
  bestStreak?: number;
  bestScore?: number;
  lastActiveDate?: string | null;
  weakSubjects?: Array<{ subject: string; avgPercent: number }>;
}

function buildSystemPrompt(profile?: UserProfile): string {
  const today = new Date().toLocaleDateString("en-NG", {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
  });

  let profileBlock = "";
  if (profile) {
    const lines: string[] = [];
    if (profile.displayName) lines.push(`Student Name: ${profile.displayName}`);
    if ((profile.currentStreak ?? 0) > 0)
      lines.push(`Active Study Streak: ${profile.currentStreak} day${profile.currentStreak !== 1 ? "s" : ""} — student is on a roll`);
    if ((profile.bestStreak ?? 0) > 0)
      lines.push(`Personal Best Streak: ${profile.bestStreak} days`);
    if ((profile.bestScore ?? 0) > 0)
      lines.push(`Personal Best Quiz Score: ${profile.bestScore}%`);
    if (profile.lastActiveDate)
      lines.push(`Last Study Session: ${profile.lastActiveDate}`);
    if (profile.weakSubjects?.length) {
      const list = profile.weakSubjects
        .map((w) => `${w.subject} (avg ${w.avgPercent}%)`)
        .join(", ");
      lines.push(`Identified Weak Areas (below 70% average): ${list}`);
    }

    if (lines.length > 0) {
      profileBlock =
        `\n\n---\n**STUDENT PROFILE (INTERNAL — use to personalize coaching; never expose raw data verbatim):**\n` +
        lines.join("\n") +
        `\n\nCoaching directives derived from this profile:\n` +
        (profile.displayName ? `- Address the student as "${profile.displayName}" occasionally (not every message)\n` : "") +
        ((profile.currentStreak ?? 0) > 0
          ? `- Acknowledge the streak naturally when motivation is warranted\n`
          : "") +
        (profile.weakSubjects?.length
          ? `- When a weak area topic comes up, invest extra depth and apply Socratic probing\n`
          : "") +
        `- Calibrate difficulty expectations to the student's known performance level`;
    }
  }

  return (
    `**Current Date:** Today is ${today}. Use this for any question about dates, current events, or "what day is it." Your training has a knowledge cutoff — for very recent events always say "I may not have the latest information on this — please verify from a current source."\n\n` +
    SYSTEM_PROMPT_BASE +
    profileBlock
  );
}

export interface ChatMessage {
  role: "user" | "assistant" | "system";
  content: string;
}

interface VisionInput {
  imageBase64: string;
  mimeType: string;
  prompt: string;
}

function withTimeout<T>(p: Promise<T>, ms: number, label: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const t = setTimeout(() => reject(new Error(`${label} timed out after ${ms}ms`)), ms);
    p.then(
      (v) => { clearTimeout(t); resolve(v); },
      (e) => { clearTimeout(t); reject(e); },
    );
  });
}

type Provider = {
  name: string;
  available: boolean;
  call: () => Promise<string>;
};

async function tryProvider(p: Provider, timeoutMs: number): Promise<{ ok: true; text: string } | { ok: false; error: unknown }> {
  if (!p.available) return { ok: false, error: new Error(`${p.name} not configured`) };
  let lastError: unknown = null;
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    try {
      const text = await withTimeout(p.call(), timeoutMs, p.name);
      if (text && text.trim()) return { ok: true, text };
      lastError = new Error(`${p.name} returned empty`);
    } catch (err) {
      lastError = err;
      // Auth errors, quota exhaustion, and rate limits are definitive — skip retry
      // so the fallback chain reaches the next provider as fast as possible.
      const { isAuthError, isQuota, isRateLimited } = classifyError(err);
      if (isAuthError || isQuota || isRateLimited) break;
    }
  }
  return { ok: false, error: lastError };
}

function classifyError(err: unknown): { reason: string; isQuota: boolean; isRateLimited: boolean; isAuthError: boolean } {
  const msg = err instanceof Error ? err.message : String(err);
  const status = err && typeof err === "object" ? (err as { status?: number }).status : undefined;
  const code = err && typeof err === "object" ? String((err as { code?: unknown }).code ?? "") : "";
  const lower = `${msg} ${code}`.toLowerCase();
  // Quota/billing exhaustion — checked FIRST because OpenAI returns HTTP 429 for
  // BOTH rate limits AND quota exhaustion; the message text distinguishes them.
  const isQuota =
    status === 402 ||
    lower.includes("exceeded your current quota") ||  // OpenAI quota via 429
    lower.includes("insufficient_quota") ||            // OpenAI error code
    lower.includes("quota") ||
    lower.includes("insufficient balance") ||          // DeepSeek
    lower.includes("insufficient") ||
    lower.includes("balance") ||
    lower.includes("account has run out") ||
    lower.includes("out of credit") ||
    lower.includes("payment required") ||
    (lower.includes("billing") && !lower.includes("rate limit"));
  // 429 = temporary rate limit (NOT quota — quota is caught above first).
  const isRateLimited =
    !isQuota && (
      status === 429 ||
      lower.includes("rate limit") || lower.includes("ratelimit") || lower.includes("too many requests") ||
      lower.includes("overloaded") || lower.includes("overload")
    );
  // Auth errors: wrong key, expired key, unauthorized — distinct from transient outage.
  // Includes DeepSeek-specific messages ("Authentication Fails", "auth_subrequest_failed").
  const isAuthError =
    status === 401 ||
    (status === 400 && (lower.includes("key") || lower.includes("auth") || lower.includes("api_key"))) ||
    lower.includes("api_key_invalid") || lower.includes("invalid_api_key") ||
    lower.includes("key not valid") || lower.includes("not a valid api") ||
    lower.includes("api key not valid") || lower.includes("invalid argument") ||
    lower.includes("authentication fails") ||     // DeepSeek
    lower.includes("authentication failed") ||    // DeepSeek variant
    lower.includes("auth_subrequest_failed") ||   // DeepSeek proxy
    lower.includes("invalid api key");
  let reason = "error";
  if (lower.includes("timed out") || lower.includes("timeout") || lower.includes("stall")) reason = "timeout";
  else if (isRateLimited) reason = "rate_limited";
  else if (isQuota) reason = "quota";
  else if (isAuthError) reason = "invalid_key";
  else if (status) reason = `http ${status}`;
  return { reason, isQuota, isRateLimited, isAuthError };
}

function logFallback(stage: string, providerName: string, err: unknown) {
  const { reason } = classifyError(err);
  const msg = err instanceof Error ? err.message : String(err);
  // eslint-disable-next-line no-console
  console.warn(`[AI ROUTER] ${stage} :: ${providerName} → failed (${reason})`);
  import("./error-log").then(({ pushError }) => {
    pushError({ ts: new Date().toISOString(), provider: providerName, stage, message: `${reason}: ${msg}`.slice(0, 200) });
  }).catch(() => {});
}

function logSuccess(stage: string, providerName: string, ms: number) {
  // eslint-disable-next-line no-console
  console.info(`[AI ROUTER] ${stage} :: ${providerName} → success (${ms}ms)`);
}

function logCacheHit(stage: string) {
  // eslint-disable-next-line no-console
  console.info(`[AI CACHE] ${stage} :: cache hit — serving cached response`);
}

async function runChain(stage: string, providers: Provider[], timeoutMs = REQUEST_TIMEOUT_MS): Promise<string> {
  for (const p of providers) {
    const start = Date.now();
    const r = await tryProvider(p, timeoutMs);
    if (r.ok) {
      logSuccess(stage, p.name, Date.now() - start);
      return r.text;
    }
    logFallback(stage, p.name, r.error);
  }
  return FALLBACK_MESSAGE;
}

export type AiProviderStatus = "Active" | "Out of Credits" | "Rate Limited" | "Invalid Key" | "Unavailable" | "Not Configured";
export interface AiProviderHealth {
  status: AiProviderStatus;
  latency: number | null;
  role: "Primary" | "Fallback #1" | "Fallback #2" | "Fallback #3";
  /** Raw error message from the last failed ping — for admin debugging. */
  errorDetail?: string;
}
export interface AiStatusResult {
  openrouter: AiProviderHealth;
  openai: AiProviderHealth;
  deepseek: AiProviderHealth;
  groq: AiProviderHealth;
  checkedAt: string;
}

const PING_TIMEOUT_MS = 8000;
const PING_CACHE_MS = 30_000;
let cachedStatus: { at: number; data: AiStatusResult } | null = null;

async function pingOne(
  available: boolean,
  call: () => Promise<unknown>,
): Promise<{ status: AiProviderStatus; latency: number | null; errorDetail?: string }> {
  if (!available) return { status: "Not Configured", latency: null };
  const start = Date.now();
  try {
    await withTimeout(call(), PING_TIMEOUT_MS, "ping");
    return { status: "Active", latency: Date.now() - start };
  } catch (err) {
    const { isRateLimited, isQuota, isAuthError } = classifyError(err);
    // Capture the raw error message so the admin dashboard can show exact failure reason.
    const detail = (err instanceof Error ? err.message : String(err)).slice(0, 250);
    if (isRateLimited) return { status: "Rate Limited", latency: null, errorDetail: detail };
    if (isQuota) return { status: "Out of Credits", latency: null, errorDetail: detail };
    if (isAuthError) return { status: "Invalid Key", latency: null, errorDetail: detail };
    return { status: "Unavailable", latency: null, errorDetail: detail };
  }
}

export async function getAiStatus(force = false): Promise<AiStatusResult> {
  if (!force && cachedStatus && Date.now() - cachedStatus.at < PING_CACHE_MS) {
    return cachedStatus.data;
  }
  const tinyMessages = [{ role: "user" as const, content: "ping" }];
  const [orHealth, oaHealth, dsHealth, grqHealth] = await Promise.all([
    pingOne(
      !!process.env.AI_INTEGRATIONS_OPENROUTER_API_KEY || !!process.env.OPENROUTER_API_KEY,
      () => openrouter.chat.completions.create({ model: OPENROUTER_CHAT_MODEL, max_tokens: 1, messages: tinyMessages }),
    ),
    pingOne(!!openai, () => openai!.chat.completions.create({ model: OPENAI_CHAT_MODEL, max_tokens: 1, messages: tinyMessages })),
    pingOne(!!deepseek, () => deepseek!.chat.completions.create({ model: DEEPSEEK_CHAT_MODEL, max_tokens: 1, messages: tinyMessages })),
    pingOne(!!groq, () => groq!.chat.completions.create({ model: GROQ_CHAT_MODEL, max_tokens: 1, messages: tinyMessages })),
  ]);
  const data: AiStatusResult = {
    openrouter: { ...orHealth, role: "Primary" },
    openai: { ...oaHealth, role: "Fallback #1" },
    deepseek: { ...dsHealth, role: "Fallback #2" },
    groq: { ...grqHealth, role: "Fallback #3" },
    checkedAt: new Date().toISOString(),
  };
  cachedStatus = { at: Date.now(), data };
  return data;
}

function buildOpenAIMessages(messages: ChatMessage[], profile?: UserProfile) {
  // Merge [FILE_CONTEXT] system messages into the main system prompt so the AI
  // receives file content in the highest-priority position and follow-up questions
  // are always answered using that context. Keeping them as separate user turns
  // created consecutive user messages which confused some models.
  const contextMessages = messages.filter((m) => m.role === "system");
  const conversationMessages = messages.filter((m) => m.role !== "system");

  let systemContent = buildSystemPrompt(profile);
  if (contextMessages.length > 0) {
    systemContent +=
      "\n\n---\n**Uploaded File Context (use this for ALL follow-up questions):**\n\n" +
      contextMessages.map((m) => m.content).join("\n\n---\n\n");
  }

  const result: { role: "system" | "user" | "assistant"; content: string }[] = [
    { role: "system", content: systemContent },
  ];
  for (const m of conversationMessages) {
    result.push({ role: m.role as "user" | "assistant", content: m.content });
  }
  return result;
}

export async function chatComplete(messages: ChatMessage[], profile?: UserProfile): Promise<string> {
  const cached = getCachedResponse(messages);
  if (cached) {
    logCacheHit("chat");
    return cached;
  }

  const providers: Provider[] = [
    {
      name: "openrouter",
      available: !!process.env.AI_INTEGRATIONS_OPENROUTER_API_KEY || !!process.env.OPENROUTER_API_KEY,
      call: async () => {
        const r = await openrouter.chat.completions.create({
          model: OPENROUTER_CHAT_MODEL,
          max_tokens: 4096,
          temperature: 0.7,
          messages: buildOpenAIMessages(messages, profile),
        });
        return r.choices[0]?.message?.content ?? "";
      },
    },
    {
      name: "openai",
      available: !!openai,
      call: async () => {
        const r = await openai!.chat.completions.create({
          model: OPENAI_CHAT_MODEL,
          max_tokens: 4096,
          temperature: 0.7,
          messages: buildOpenAIMessages(messages, profile),
        });
        return r.choices[0]?.message?.content ?? "";
      },
    },
    {
      name: "deepseek",
      available: !!deepseek,
      call: async () => {
        const r = await deepseek!.chat.completions.create({
          model: DEEPSEEK_CHAT_MODEL,
          max_tokens: 4096,
          temperature: 0.7,
          messages: buildOpenAIMessages(messages, profile),
        });
        return r.choices[0]?.message?.content ?? "";
      },
    },
    {
      name: "groq",
      available: !!groq,
      call: async () => {
        const r = await groq!.chat.completions.create({
          model: GROQ_CHAT_MODEL,
          max_tokens: 4096,
          temperature: 0.7,
          messages: buildOpenAIMessages(messages, profile),
        });
        return r.choices[0]?.message?.content ?? "";
      },
    },
  ];

  const result = await runChain("chat", providers, REQUEST_TIMEOUT_MS);
  if (result !== FALLBACK_MESSAGE) {
    setCachedResponse(messages, result);
  }
  return result;
}

export async function visionAnalyze(input: VisionInput): Promise<string> {
  const dataUrl = `data:${input.mimeType};base64,${input.imageBase64}`;
  const visionMessages = [
    {
      role: "system" as const,
      content:
        "You are a vision-capable study assistant. Analyze the image carefully and thoroughly. Extract ALL visible text character by character (act as precise OCR). Describe every element, diagram, chart, table, equation, or figure. Identify the subject and context. Be extremely detailed — students need this for studying. Never say you cannot view images.",
    },
    {
      role: "user" as const,
      content: [
        { type: "text" as const, text: input.prompt },
        { type: "image_url" as const, image_url: { url: dataUrl } },
      ],
    },
  ];

  const orAvailable = !!process.env.AI_INTEGRATIONS_OPENROUTER_API_KEY || !!process.env.OPENROUTER_API_KEY;

  const providers: Provider[] = [
    ...OPENROUTER_VISION_MODELS.map((model) => ({
      name: `openrouter-vision:${model}`,
      available: orAvailable,
      call: async () => {
        const r = await openrouter.chat.completions.create({
          model,
          max_tokens: 3000,
          temperature: 0.3,
          messages: visionMessages,
        });
        return r.choices[0]?.message?.content ?? "";
      },
    })),
    {
      name: "openai-vision",
      available: !!openai,
      call: async () => {
        const r = await openai!.chat.completions.create({
          model: OPENAI_VISION_MODEL,
          max_tokens: 3000,
          temperature: 0.3,
          messages: visionMessages,
        });
        return r.choices[0]?.message?.content ?? "";
      },
    },
  ];

  return runChain("vision", providers, VISION_TIMEOUT_MS);
}

export interface GeneratedQuestion {
  id: string;
  prompt: string;
  type: "objective" | "theory" | "fill";
  options?: string[];
  correctAnswer: string;
  explanation: string;
}

export async function generateQuiz(params: {
  subject: string;
  difficulty: "easy" | "medium" | "hard";
  questionType: "objective" | "theory" | "fill";
  numQuestions: number;
  instructions?: string;
}): Promise<GeneratedQuestion[]> {
  const { subject, difficulty, questionType, numQuestions, instructions } = params;

  const typeInstructions = {
    objective: `Each question must be multiple choice with EXACTLY 4 options labeled A, B, C, D. The "options" field must be an array of 4 strings (no labels, just the option text). The "correctAnswer" must be one of "A", "B", "C", or "D".`,
    theory: `Each question is a short-answer or essay question. Do NOT include "options". The "correctAnswer" should be a model answer (1-3 sentences).`,
    fill: `Each question is fill-in-the-blank. Use "____" (4 underscores) in the prompt to mark the blank. Do NOT include "options". The "correctAnswer" is the word or short phrase that fills the blank.`,
  }[questionType];

  const userPrompt = `Generate exactly ${numQuestions} ${difficulty} ${questionType} questions on the subject: "${subject}".${instructions ? ` Additional instructions: ${instructions}.` : ""}

${typeInstructions}

Each question must include a clear, one-sentence "explanation" of why the answer is correct.

Respond with ONLY valid JSON (no markdown fences, no commentary) in this exact shape:
{
  "questions": [
    {
      "prompt": "string",
      "type": "${questionType}",
      ${questionType === "objective" ? '"options": ["string","string","string","string"],' : ""}
      "correctAnswer": "string",
      "explanation": "string"
    }
  ]
}`;

  type QuizMsg = { role: "system" | "user"; content: string };

  // Build a fresh providers array for a given messages array.
  // Called twice: once for the initial generation, once for the top-up pass.
  const makeQuizProviders = (msgs: QuizMsg[]): Provider[] => [
    {
      name: "openrouter",
      available: !!process.env.AI_INTEGRATIONS_OPENROUTER_API_KEY || !!process.env.OPENROUTER_API_KEY,
      call: async () => {
        const r = await openrouter.chat.completions.create({
          model: OPENROUTER_CHAT_MODEL,
          max_tokens: 8192,
          temperature: 0.4,
          response_format: { type: "json_object" },
          messages: msgs,
        });
        return r.choices[0]?.message?.content ?? "";
      },
    },
    {
      name: "openai",
      available: !!openai,
      call: async () => {
        const r = await openai!.chat.completions.create({
          model: OPENAI_CHAT_MODEL,
          max_tokens: 8192,
          temperature: 0.4,
          response_format: { type: "json_object" },
          messages: msgs,
        });
        return r.choices[0]?.message?.content ?? "";
      },
    },
    {
      name: "deepseek",
      available: !!deepseek,
      call: async () => {
        const r = await deepseek!.chat.completions.create({
          model: DEEPSEEK_CHAT_MODEL,
          max_tokens: 8192,
          temperature: 0.4,
          response_format: { type: "json_object" },
          messages: msgs,
        });
        return r.choices[0]?.message?.content ?? "";
      },
    },
    {
      name: "groq",
      available: !!groq,
      call: async () => {
        const r = await groq!.chat.completions.create({
          model: GROQ_CHAT_MODEL,
          max_tokens: 8192,
          temperature: 0.4,
          messages: msgs,
        });
        return r.choices[0]?.message?.content ?? "";
      },
    },
  ];

  // Parse raw JSON from any provider response into valid question objects.
  // Filters out malformed entries without throwing.
  const parseQuizJson = (raw: string): Array<Omit<GeneratedQuestion, "id">> => {
    if (!raw || raw === FALLBACK_MESSAGE) return [];
    let p: { questions?: Array<Omit<GeneratedQuestion, "id">> };
    try {
      p = JSON.parse(raw);
    } catch {
      const m = raw.match(/\{[\s\S]*\}/);
      try { p = m ? JSON.parse(m[0]) : { questions: [] }; }
      catch { p = { questions: [] }; }
    }
    return (p.questions ?? []).filter((q) => q && q.prompt && q.correctAnswer);
  };

  // ── Initial generation ──────────────────────────────────────────────────
  const initialMessages: QuizMsg[] = [
    { role: "system", content: "You generate study quizzes as strict JSON." },
    { role: "user", content: userPrompt },
  ];
  const raw = await runChain("quiz", makeQuizProviders(initialMessages), 60_000);
  let questions = parseQuizJson(raw);

  // ── Top-up loop ──────────────────────────────────────────────────────────
  // If the model returned fewer questions than requested, ask for exactly the
  // missing count again.  Runs up to 2 additional passes to guarantee the
  // requested count; breaks early if a pass returns nothing (provider failure).
  let topupPass = 0;
  while (questions.length > 0 && questions.length < numQuestions && topupPass < 2) {
    topupPass++;
    const missing = numQuestions - questions.length;
    const topupPrompt = `Generate exactly ${missing} additional ${difficulty} ${questionType} questions on the subject: "${subject}" that are DIFFERENT from the ones already generated.${instructions ? ` Additional instructions: ${instructions}.` : ""}

${typeInstructions}

Each question must include a clear, one-sentence "explanation" of why the answer is correct.

Respond with ONLY valid JSON (no markdown fences, no commentary) in this exact shape:
{
  "questions": [
    {
      "prompt": "string",
      "type": "${questionType}",
      ${questionType === "objective" ? '"options": ["string","string","string","string"],' : ""}
      "correctAnswer": "string",
      "explanation": "string"
    }
  ]
}`;
    const topupMessages: QuizMsg[] = [
      { role: "system", content: "You generate study quizzes as strict JSON." },
      { role: "user", content: topupPrompt },
    ];
    const topupRaw = await runChain(`quiz-topup-${topupPass}`, makeQuizProviders(topupMessages), 60_000);
    const extra = parseQuizJson(topupRaw).slice(0, missing);
    if (!extra.length) break; // Provider returned nothing — stop to avoid runaway cost
    questions = [...questions, ...extra];
  }

  return questions.slice(0, numQuestions).map((q, i) => ({
    id: `q${i + 1}`,
    prompt: q.prompt,
    type: questionType,
    options: q.options,
    correctAnswer: q.correctAnswer,
    explanation: q.explanation,
  }));
}

// ---------------------------------------------------------------------------
// Conversation summarizer — compresses older chat turns into a compact
// bullet-point summary for session memory continuity.
//
// Used by the /chat/summarize route. Groq is tried first (lowest latency),
// then OpenRouter. Never increments the message counter — this is infrastructure.
// ---------------------------------------------------------------------------
export async function summarizeConversation(messages: ChatMessage[]): Promise<string> {
  if (!messages.length) return "";

  // Truncate individual messages so the summarizer prompt stays compact.
  const transcript = messages
    .filter((m) => m.role !== "system")
    .map((m) => `${m.role === "user" ? "Student" : "AI"}: ${m.content.slice(0, 600)}`)
    .join("\n\n");

  const summaryMessages = [
    {
      role: "system" as const,
      content:
        "You summarize study conversations compactly so a future AI session can maintain continuity. Output ONLY the summary — no preamble, no explanation.",
    },
    {
      role: "user" as const,
      content: `Summarize this study session in 4–6 concise bullet points. Include: topics discussed, key concepts explained, student questions and confusion points, the student's apparent knowledge level, and any important facts stated. Be specific.\n\nConversation:\n${transcript}`,
    },
  ];

  const orAvail =
    !!process.env.AI_INTEGRATIONS_OPENROUTER_API_KEY || !!process.env.OPENROUTER_API_KEY;

  // Groq first (fastest inference for short tasks), OpenRouter as fallback.
  const providers: Provider[] = [
    {
      name: "groq",
      available: !!groq,
      call: async () => {
        const r = await groq!.chat.completions.create({
          model: GROQ_CHAT_MODEL,
          max_tokens: 400,
          temperature: 0.3,
          messages: summaryMessages,
        });
        return r.choices[0]?.message?.content ?? "";
      },
    },
    {
      name: "openrouter",
      available: orAvail,
      call: async () => {
        const r = await openrouter.chat.completions.create({
          model: OPENROUTER_CHAT_MODEL,
          max_tokens: 400,
          temperature: 0.3,
          messages: summaryMessages,
        });
        return r.choices[0]?.message?.content ?? "";
      },
    },
  ];

  const result = await runChain("summarize", providers, 15_000);
  return result === FALLBACK_MESSAGE ? "" : result;
}

// ---------------------------------------------------------------------------
// Streaming chat — iterates SSE chunks from the first available provider.
// onChunk is called for every text delta as it arrives.
// Returns the full assembled reply string.
//
// BUG-10 FIX: Each chunk read races against CHUNK_STALL_MS timeout so a
// slow-draining or stalled provider is detected and failed over from.
// ---------------------------------------------------------------------------
export async function chatCompleteStream(
  messages: ChatMessage[],
  onChunk: (text: string) => void,
  profile?: UserProfile,
): Promise<string> {
  const cached = getCachedResponse(messages);
  if (cached) {
    logCacheHit("stream");
    onChunk(cached);
    return cached;
  }

  const oaiMessages = buildOpenAIMessages(messages, profile);
  const orAvail =
    !!process.env.AI_INTEGRATIONS_OPENROUTER_API_KEY ||
    !!process.env.OPENROUTER_API_KEY;

  type StreamChunk = { choices: Array<{ delta?: { content?: string | null } }> };
  interface StreamEntry {
    name: string;
    available: boolean;
    create: () => Promise<AsyncIterable<StreamChunk>>;
  }

  const providers: StreamEntry[] = [
    {
      name: "openrouter",
      available: orAvail,
      create: () =>
        openrouter.chat.completions.create({
          model: OPENROUTER_CHAT_MODEL,
          messages: oaiMessages,
          stream: true,
          max_tokens: 4096,
          temperature: 0.7,
        }) as unknown as Promise<AsyncIterable<StreamChunk>>,
    },
    {
      name: "openai",
      available: !!openai,
      create: () =>
        openai!.chat.completions.create({
          model: OPENAI_CHAT_MODEL,
          messages: oaiMessages,
          stream: true,
          max_tokens: 4096,
          temperature: 0.7,
        }) as unknown as Promise<AsyncIterable<StreamChunk>>,
    },
    {
      name: "deepseek",
      available: !!deepseek,
      create: () =>
        deepseek!.chat.completions.create({
          model: DEEPSEEK_CHAT_MODEL,
          messages: oaiMessages,
          stream: true,
          max_tokens: 4096,
          temperature: 0.7,
        }) as unknown as Promise<AsyncIterable<StreamChunk>>,
    },
    {
      name: "groq",
      available: !!groq,
      create: () =>
        groq!.chat.completions.create({
          model: GROQ_CHAT_MODEL,
          messages: oaiMessages,
          stream: true,
          max_tokens: 4096,
          temperature: 0.7,
        }) as unknown as Promise<AsyncIterable<StreamChunk>>,
    },
  ];

  for (const provider of providers) {
    if (!provider.available) continue;

    for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
      const streamStart = Date.now();
      try {
        const stream = await withTimeout(
          provider.create(),
          REQUEST_TIMEOUT_MS,
          provider.name,
        );

        let full = "";
        const iter = (stream as AsyncIterable<StreamChunk>)[Symbol.asyncIterator]();

        while (true) {
          let timerHandle: ReturnType<typeof setTimeout> | null = null;
          const stallPromise = new Promise<never>((_, reject) => {
            timerHandle = setTimeout(
              () => reject(new Error(`${provider.name} chunk stall after ${CHUNK_STALL_MS}ms`)),
              CHUNK_STALL_MS,
            );
          });

          let result: IteratorResult<StreamChunk>;
          try {
            result = await Promise.race([iter.next(), stallPromise]);
          } finally {
            if (timerHandle !== null) clearTimeout(timerHandle);
          }
          if (result.done) break;

          const delta = result.value.choices?.[0]?.delta?.content ?? "";
          if (delta) {
            full += delta;
            onChunk(delta);
          }
        }

        if (full.trim()) {
          logSuccess("stream", provider.name, Date.now() - streamStart);
          setCachedResponse(messages, full);
          return full;
        }
        break;
      } catch (err) {
        logFallback("stream", provider.name, err);
        if (attempt === MAX_ATTEMPTS) break;
      }
    }
  }

  return STREAM_FALLBACK;
}
