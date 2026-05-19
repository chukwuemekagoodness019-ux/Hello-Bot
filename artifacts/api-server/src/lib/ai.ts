import { openrouter } from "@workspace/integrations-openrouter-ai";
import OpenAI from "openai";

const REQUEST_TIMEOUT_MS = 12000;
const VISION_TIMEOUT_MS = 28000;
const MAX_ATTEMPTS = 2;
export const FALLBACK_MESSAGE = "⚠️ AI temporarily unavailable. Please try again.";
export const STREAM_FALLBACK = "I'm having trouble connecting to the AI right now. Your session is saved — please try again in a moment.";

const OPENROUTER_CHAT_MODEL = "openai/gpt-4o-mini";
const OPENROUTER_VISION_MODELS = [
  "openai/gpt-4o-mini",
  "google/gemini-flash-1.5",
  "qwen/qwen2.5-vl-72b-instruct",
];

const OPENAI_CHAT_MODEL = "gpt-4o-mini";
const OPENAI_VISION_MODEL = "gpt-4o-mini";
const DEEPSEEK_CHAT_MODEL = "deepseek-chat";

const openai = process.env.OPENAI_API_KEY
  ? new OpenAI({ apiKey: process.env.OPENAI_API_KEY })
  : null;

const deepseek = process.env.DEEPSEEK_API_KEY
  ? new OpenAI({
      apiKey: process.env.DEEPSEEK_API_KEY,
      baseURL: "https://api.deepseek.com/v1",
    })
  : null;

const SYSTEM_PROMPT = `You are AI Study Assistant — a sharp, warm, and highly effective study companion built for students, especially in Nigeria. You think like a top student who is also a patient teacher.

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
- Do NOT add a motivational line to every reply — reserve them for moments where the student needs a boost.`;

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
    }
  }
  return { ok: false, error: lastError };
}

function classifyError(err: unknown): { reason: string; isQuota: boolean } {
  const msg = err instanceof Error ? err.message : String(err);
  const status = err && typeof err === "object" ? (err as { status?: number }).status : undefined;
  const code = err && typeof err === "object" ? String((err as { code?: unknown }).code ?? "") : "";
  const lower = `${msg} ${code}`.toLowerCase();
  const isQuota =
    status === 402 || status === 429 ||
    lower.includes("quota") || lower.includes("insufficient") ||
    lower.includes("balance") || lower.includes("billing");
  let reason = "error";
  if (lower.includes("timed out") || lower.includes("timeout")) reason = "timeout";
  else if (isQuota) reason = "quota";
  else if (status) reason = `http ${status}`;
  return { reason, isQuota };
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

export type AiProviderStatus = "Active" | "Out of Credits" | "Unavailable" | "Not Configured";
export interface AiProviderHealth {
  status: AiProviderStatus;
  latency: number | null;
  role: "Primary" | "Fallback #1" | "Fallback #2";
}
export interface AiStatusResult {
  openrouter: AiProviderHealth;
  openai: AiProviderHealth;
  deepseek: AiProviderHealth;
  checkedAt: string;
}

const PING_TIMEOUT_MS = 5000;
const PING_CACHE_MS = 30_000;
let cachedStatus: { at: number; data: AiStatusResult } | null = null;

async function pingOne(
  available: boolean,
  call: () => Promise<unknown>,
): Promise<{ status: AiProviderStatus; latency: number | null }> {
  if (!available) return { status: "Not Configured", latency: null };
  const start = Date.now();
  try {
    await withTimeout(call(), PING_TIMEOUT_MS, "ping");
    return { status: "Active", latency: Date.now() - start };
  } catch (err) {
    const { isQuota } = classifyError(err);
    return { status: isQuota ? "Out of Credits" : "Unavailable", latency: null };
  }
}

export async function getAiStatus(): Promise<AiStatusResult> {
  if (cachedStatus && Date.now() - cachedStatus.at < PING_CACHE_MS) {
    return cachedStatus.data;
  }
  const tinyMessages = [{ role: "user" as const, content: "ping" }];
  const [orHealth, oaHealth, dsHealth] = await Promise.all([
    pingOne(
      !!process.env.AI_INTEGRATIONS_OPENROUTER_API_KEY || !!process.env.OPENROUTER_API_KEY,
      () => openrouter.chat.completions.create({ model: OPENROUTER_CHAT_MODEL, max_tokens: 1, messages: tinyMessages }),
    ),
    pingOne(!!openai, () => openai!.chat.completions.create({ model: OPENAI_CHAT_MODEL, max_tokens: 1, messages: tinyMessages })),
    pingOne(!!deepseek, () => deepseek!.chat.completions.create({ model: DEEPSEEK_CHAT_MODEL, max_tokens: 1, messages: tinyMessages })),
  ]);
  const data: AiStatusResult = {
    openrouter: { ...orHealth, role: "Primary" },
    openai: { ...oaHealth, role: "Fallback #1" },
    deepseek: { ...dsHealth, role: "Fallback #2" },
    checkedAt: new Date().toISOString(),
  };
  cachedStatus = { at: Date.now(), data };
  return data;
}

function buildOpenAIMessages(messages: ChatMessage[]) {
  const result: { role: "system" | "user" | "assistant"; content: string }[] = [
    { role: "system", content: SYSTEM_PROMPT },
  ];
  for (const m of messages) {
    if (m.role === "system") {
      result.push({ role: "user", content: m.content });
    } else {
      result.push({ role: m.role as "user" | "assistant", content: m.content });
    }
  }
  return result;
}

export async function chatComplete(messages: ChatMessage[]): Promise<string> {
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
  ];
  return runChain("chat", providers, REQUEST_TIMEOUT_MS);
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

  const quizMessages = [
    { role: "system" as const, content: "You generate study quizzes as strict JSON." },
    { role: "user" as const, content: userPrompt },
  ];

  const providers: Provider[] = [
    {
      name: "openrouter",
      available: !!process.env.AI_INTEGRATIONS_OPENROUTER_API_KEY || !!process.env.OPENROUTER_API_KEY,
      call: async () => {
        const r = await openrouter.chat.completions.create({
          model: OPENROUTER_CHAT_MODEL,
          max_tokens: 4096,
          temperature: 0.4,
          response_format: { type: "json_object" },
          messages: quizMessages,
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
          temperature: 0.4,
          response_format: { type: "json_object" },
          messages: quizMessages,
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
          temperature: 0.4,
          response_format: { type: "json_object" },
          messages: quizMessages,
        });
        return r.choices[0]?.message?.content ?? "";
      },
    },
  ];

  const raw = await runChain("quiz", providers, 60_000);
  if (raw === FALLBACK_MESSAGE) return [];

  let parsed: { questions?: Array<Omit<GeneratedQuestion, "id">> };
  try {
    parsed = JSON.parse(raw);
  } catch {
    const match = raw.match(/\{[\s\S]*\}/);
    parsed = match ? JSON.parse(match[0]) : { questions: [] };
  }
  return (parsed.questions ?? []).slice(0, numQuestions).map((q, i) => ({
    id: `q${i + 1}`,
    prompt: q.prompt,
    type: questionType,
    options: q.options,
    correctAnswer: q.correctAnswer,
    explanation: q.explanation,
  }));
}

// ---------------------------------------------------------------------------
// Streaming chat — iterates SSE chunks from the first available provider.
// onChunk is called for every text delta as it arrives.
// Returns the full assembled reply string.
// ---------------------------------------------------------------------------
export async function chatCompleteStream(
  messages: ChatMessage[],
  onChunk: (text: string) => void,
): Promise<string> {
  const oaiMessages = buildOpenAIMessages(messages);
  const orAvail =
    !!process.env.AI_INTEGRATIONS_OPENROUTER_API_KEY ||
    !!process.env.OPENROUTER_API_KEY;

  interface StreamEntry {
    name: string;
    available: boolean;
    create: () => Promise<AsyncIterable<{ choices: Array<{ delta?: { content?: string | null } }> }>>;
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
        }) as unknown as Promise<AsyncIterable<{ choices: Array<{ delta?: { content?: string | null } }> }>>,
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
        }) as unknown as Promise<AsyncIterable<{ choices: Array<{ delta?: { content?: string | null } }> }>>,
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
        }) as unknown as Promise<AsyncIterable<{ choices: Array<{ delta?: { content?: string | null } }> }>>,
    },
  ];

  for (const provider of providers) {
    if (!provider.available) continue;

    for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
      try {
        const stream = await withTimeout(
          provider.create(),
          REQUEST_TIMEOUT_MS,
          provider.name,
        );
        let full = "";
        for await (const chunk of stream) {
          const delta = chunk.choices?.[0]?.delta?.content ?? "";
          if (delta) {
            full += delta;
            onChunk(delta);
          }
        }
        if (full.trim()) {
          logSuccess("stream", provider.name, 0);
          return full;
        }
        break; // empty response — try next provider
      } catch (err) {
        logFallback("stream", provider.name, err);
        if (attempt === MAX_ATTEMPTS) break;
      }
    }
  }

  return STREAM_FALLBACK;
}
