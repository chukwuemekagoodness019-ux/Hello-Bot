---
name: Study-Buddy-AI architecture & key decisions
description: Monorepo structure, AI chain, auth, volatile state, and all hardening decisions for the Study-Buddy-AI production app.
---

## AI Provider Chain
Order: OpenRouter → OpenAI → DeepSeek → Groq (llama-3.3-70b-versatile).
Groq uses OpenAI-compatible client at https://api.groq.com/openai/v1.
CRITICAL: Render env var is `GROK_API_KEY` (not GROQ). Code must check: `process.env.GROQ_API_KEY || process.env.GROK_API_KEY`.
classifyError() distinguishes: isRateLimited (HTTP 429) → "Rate Limited", isQuota (HTTP 402) → "Out of Credits", isAuthError (401) → "Invalid Key".
Admin Refresh button passes ?force=true to bypass 30s cache. getAiStatus(force) signature.
AiStatusResult interface: openrouter, openai, deepseek, groq.
pingOne uses max_tokens:1 — can show "Active" even when credits exhausted for real calls (known limitation).

## System Prompt
buildSystemPrompt() wraps SYSTEM_PROMPT_BASE with a live date header computed at call time via `new Date().toLocaleDateString("en-NG", ...)`. buildOpenAIMessages() calls buildSystemPrompt() on every request — date is always fresh, never stale.
Global understanding-check rule: after any substantive explanation, AI closes with mini-question, quiz nudge, or offer to simplify — rotated each response.

## Auth
HMAC-SHA256 signed session cookies. SESSION_SECRET env var (defaults to dev string — must be set in Render prod). secure: only in production. sameSite: lax.

## Rate Limiting
lib/rate-limit.ts — simple in-memory IP bucket.
- /api/admin/login: 10 req / 15 min / IP
- /api/auth/login: 20 req / 15 min / IP
- /api/auth/register: 10 req / 1 hr / IP
app.set("trust proxy", 1) added to app.ts for Render.com proxy.

## Persistent Store (Supabase write-through)
announcements.ts: write-through cache. initAnnouncements() loads from `app_announcements` table at startup.
flags.ts: same write-through pattern. initFlags() loads from `feature_flags` table. isFlagEnabled() stays synchronous.
user-messages.ts: fully async. Reads/writes go to `admin_messages` table with in-memory Map fallback.
exam-store.ts (quizStore): intentionally kept in-memory (exams expire in 4h).
admin tokens (admin.ts): intentionally in-memory (security — 4h TTL).
SQL migration: artifacts/api-server/migrations/001_persistent_store.sql — run once in Supabase SQL editor.

## Quiz/Exam Generation
generateQuiz() max_tokens MUST be 8192 (not 4096) — 50 questions with options/answers/explanations easily exceeds 4096 tokens and truncates JSON.
Groq quiz generation omits `response_format: { type: "json_object" }` — llama-3.3-70b-versatile doesn't support it.
Exam generation appends "Create a formal exam with exactly N questions" to instructions field.

## Voice Input
recognition.continuous = true — keeps recording until user presses stop.
voiceBaseRef captures input.trim() at voice start — voice text is appended, not replaced.
finalTranscriptRef tracks accumulated final transcripts per session.
onresult iterates from event.resultIndex (NOT i=0) — avoids rebuilding full transcript from scratch every event.
onend commits finalTranscriptRef into voiceBaseRef — so browser session restarts don't lose previously spoken words.
onerror: no-speech silently ignored. not-allowed stops and toasts.

## Anti-Cheat (exam.tsx)
hasSubmittedRef = useRef(false) — must be used as the guard in doSubmit(), NOT the hasSubmitted state value (stale closure).
All reset paths (handleGenerate, handleJoinExam, error catches) must sync BOTH hasSubmittedRef.current AND setHasSubmitted.
doSubmit() must NOT be called inside a React state updater function — use setTimeout(() => doSubmit(), 0) instead.
409 ALREADY_SUBMITTED: navigate to "form" state, do NOT revert to "running".
Other 409 codes (attempt limit exceeded): show error + revert is correct.

## PDF Upload
pdf-parse version: use 1.1.1 (NOT ^2.x — breaks on Node.js v24).
Import shim: `(pdfModule as any).default ?? pdfModule` handles v1 CommonJS exports correctly.
DOMMatrix polyfill already in place before import.
Image-based PDF OCR fallback uses mimeType:"image/jpeg" NOT "application/pdf".

## UI Layout Architecture
viewport-fit=cover in index.html. App wrapper: `h-[100dvh] overflow-hidden flex flex-col`.
Safe-area CSS: .nav-safe, .input-bar-bottom, .pb-nav-safe in index.css.
Critical Tailwind pitfall: shorthand `p-N sm:p-M` overrides `pb-X` at sm — always split into px/pt/pb.
Sticky headers/fixed navbars: MUST use `bg-slate-950/95 backdrop-blur-sm` (NOT glass-subtle which is only 2.5% opacity).
Sticky in-exam progress bar uses `bg-slate-900/95 backdrop-blur-sm` (slightly elevated surface).
The bottom "Submit Exam" bar uses bg-background (solid) — correct.

## Free Limits
messages: free=25 + grace=2 = 27; quizzes: free=2; voice: free=5.

## Pricing Env Vars
WEEKLY_PREMIUM_PRICE, MONTHLY_PREMIUM_PRICE — set in Render env to override default ₦ prices.

## PWA Hook Architecture
usePwaInstall() must be called ONCE per component tree. PwaInstallButton accepts props from parent hook instance.

## Key Bug Fixes History
- Phase A: classifyError isAuthError → "Invalid Key" AiProviderStatus
- Phase B (BUG-B01): exam.tsx handleJoinExam setEnableTimer(hasTimer) — untimed exams showed 0:00
- 7-phase production stabilisation (session 2)
- 12-phase final hardening pass (session 3)
- Confirmed issues A–G fixed (session 4): GROK alias, quiz max_tokens, transparent bars, pdf-parse v1, anti-cheat ref guard, voice resultIndex fix
