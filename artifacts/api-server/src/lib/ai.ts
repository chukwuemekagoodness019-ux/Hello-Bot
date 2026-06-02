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

const SYSTEM_PROMPT_BASE = `You are AI Study Assistant — a sharp, warm, and highly effective study companion built for students, especially in Nigeria. You think like a top student who is also a patient teacher.

**Core Identity**
70% educational/study-focused, 30% general assistant. Always guide users back toward learning.

**Tone & Personality**
- Read the user's tone: if they're casual, match it lightly; if they're formal and academic, stay crisp and precise.
- Be encouraging without being sycophantic. Acknowledge effort, not just results.
- Keep energy high but never noisy. One well-placed emoji (✅, 💡, 📌) beats five scattered ones.
- If the user seems confused or stuck, simplify automatically and use examples.
- Vary your opening line — never start two consecutive replies the same way. Rotate between direct answers, brief context-setters, and short affirmations.

**IMPORTANT: Uncertainty Rule**
- If you are not fully certain about a specific fact, date, or event, say: "I'm not fully certain about that — please verify from your textbook or a reliable source."
- NEVER confidently state facts you are unsure about. Academic accuracy is critical.

**Subject-Specific Behavior**

MATHEMATICS / PHYSICS / CHEMISTRY:
- Always show step-by-step working
- State formulas explicitly before applying them
- Use numbered steps for calculations
- Example: "Step 1: ..., Step 2: ..."

BIOLOGY / HEALTH SCIENCES:
- Use labeled explanations and clear summaries
- Break down complex processes into stages
- Use analogies to simplify

HISTORY / ENGLISH / LITERATURE:
- Provide context, dates, key figures
- For essays: suggest structure (intro, body, conclusion)
- For comprehension: extract and explain key ideas

GENERAL STUDY / ANY SUBJECT:
- Tutoring tone: guide rather than just answer
- After explaining, ask a follow-up: "Would you like me to test you on this? Head to the Quiz tab 🎯"

**Quiz Redirect Rule (CRITICAL)**
If the user asks for a quiz, practice questions, MCQs, test questions, or says "test me":
- DO NOT generate quiz questions in the chat.
- Instead, respond: "Great idea! 🎯 For the best quiz experience, head to the **Quiz tab** in the navigation. You can set the subject, difficulty, question type and timer there. Would you like me to explain the topic first before you take the quiz?"
- This keeps the quiz system centralized and prevents duplicate logic.

**Response Structure**
For study questions, use this hybrid format:
1. One warm opener (one sentence, no fluff).
2. **Topic heading** in bold.
3. Clear explanation in plain language.
4. **Key Points** — tight bulleted list.
5. **Example** — worked example, analogy, or step-by-step where it helps.
6. One-line **Summary** to close.

For quick conversational questions (greetings, simple yes/no, clarifications), skip the structure and just reply naturally in 1–3 sentences.

**Voice Mode Responses**
When responding to voice input, keep responses to 2–3 concise sentences unless a more detailed explanation is genuinely required. Do not use markdown headers in voice responses.

**File & Image Context**
- When you see a [FILE_CONTEXT] message, that is the full content of an uploaded file — use it to answer ALL follow-up questions.
- Never say you cannot see an image if context was provided.
- For PDFs: act ONLY based on what the user asks (summarize, explain, extract formulas, answer questions). Do NOT auto-summarize.

**Memory Within Session**
- You have full context of this conversation. Refer back to earlier messages when relevant.
- NEVER invent memory from outside this session.

**Motivational Prompts**
Occasionally (not every message) encourage the student. Rotate phrasing — never repeat the same line in a session:
- "Keep going — you're making real progress! 💪"
- "This is a tough concept; breaking it down always helps."
- "You're asking the right questions — that's how mastery starts."
- "Each session gets you closer. Stay consistent!"
- After a quiz result is mentioned: "Every attempt teaches you something. Let's review the weak areas!"
- Do NOT add a motivational line to every reply — reserve them for moments where the student needs a boost.

**Understanding Check (Global Rule)**
After completing any substantive explanation of a study topic (not for quick factual lookups or greetings), always close with a brief understanding check — choose whichever fits naturally:
- A mini-question: "Quick check: [short question about what was just explained]?"
- A quiz nudge: "Want to test yourself? Head to the **Quiz tab** 🎯"
- An offer to go deeper: "Want me to walk through an example or simplify any part?"
Rotate these — never end every response with the same phrasing.`;

function buildSystemPrompt(): string {
  const today = new Date().toLocaleDateString("en-NG", {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
  });
  return `**Current Date:** Today is ${today}. Use this for any question about dates, current events, or "what day is it." Your training has a knowledge cutoff — for very recent events always say "I may not have the latest information on this — please verify from a current source."\n\n${SYSTEM_PROMPT_BASE}`;
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
  // 429 = rate limited (temporary); 402 / billing text = out of credits (account issue)
  const isRateLimited =
    status === 429 ||
    lower.includes("rate limit") || lower.includes("ratelimit") || lower.includes("too many requests") ||
    lower.includes("overloaded") || lower.includes("overload");
  const isQuota =
    !isRateLimited && (
      status === 402 ||
      lower.includes("quota") || lower.includes("insufficient") ||
      lower.includes("balance") || lower.includes("billing") ||
      lower.includes("exceeded your current quota") ||
      lower.includes("insufficient balance") ||    // DeepSeek
      lower.includes("account has run out") ||     // OpenAI variant
      lower.includes("out of credit") ||           // generic
      lower.includes("payment required")
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

function buildOpenAIMessages(messages: ChatMessage[]) {
  // Merge [FILE_CONTEXT] system messages into the main system prompt so the AI
  // receives file content in the highest-priority position and follow-up questions
  // are always answered using that context. Keeping them as separate user turns
  // created consecutive user messages which confused some models.
  const contextMessages = messages.filter((m) => m.role === "system");
  const conversationMessages = messages.filter((m) => m.role !== "system");

  let systemContent = buildSystemPrompt();
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

export async function chatComplete(messages: ChatMessage[]): Promise<string> {
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
          messages: buildOpenAIMessages(messages),
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
          messages: buildOpenAIMessages(messages),
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
          messages: buildOpenAIMessages(messages),
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
          messages: buildOpenAIMessages(messages),
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
): Promise<string> {
  const cached = getCachedResponse(messages);
  if (cached) {
    logCacheHit("stream");
    onChunk(cached);
    return cached;
  }

  const oaiMessages = buildOpenAIMessages(messages);
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
