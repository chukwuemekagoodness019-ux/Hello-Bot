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
tryProvider() fast-fails on isAuthError || isQuota || isRateLimited — skips retry loop so fallback chain reaches next provider immediately.

## System Prompt & File Context
buildSystemPrompt() wraps SYSTEM_PROMPT_BASE with a live date header.
buildOpenAIMessages() merges all [FILE_CONTEXT] system messages from the conversation INTO the system prompt (not as separate user turns). Previous design put them as user-role messages creating consecutive user messages that confused models. Correct pattern:
  systemContent = buildSystemPrompt() + "\n\n---\n**Uploaded File Context**\n\n" + contextMessages.map(m => m.content).join(...)
  Then conversationMessages (user/assistant only) follow in order.
This ensures PDF and image context always reaches the AI at highest priority for ALL follow-up questions.

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

## Voice Input (Complete Pattern)
recognition.continuous = true — keeps recording until user presses stop.
voiceBaseRef captures input.trim() at voice start — voice text appended, not replaced.
finalTranscriptRef tracks accumulated final transcripts per session.
processedIndexRef tracks which result indices have already been finalized — guards against Chrome re-firing resultIndex=0 on internal resets (double-adds without this guard).
manualStopRef: set to true in stopVoice() — distinguishes manual stops from browser-ended sessions.
onresult loops from Math.max(event.resultIndex, processedIndexRef.current) for final transcripts; updates processedIndexRef.current = i+1.
onend: commits finalTranscriptRef into voiceBaseRef, resets processedIndexRef. If !manualStopRef, creates a NEW recognition instance and calls .start() — never call .start() on an ended instance (throws InvalidStateError in Chrome).
Auto-restart ensures the user doesn't have to tap mic again after Chrome's ~60s silence timeout.
onerror: "no-speech" and "aborted" are silently ignored. "not-allowed" sets manualStopRef=true.

## PDF Upload
pdf-parse version: use 1.1.1 (NOT ^2.x — breaks on Node.js v24).
Import shim: `(pdfModule as any).default ?? pdfModule` handles v1 CommonJS exports correctly.
DOMMatrix polyfill already in place before import.
Image-based PDF OCR fallback uses mimeType:"image/jpeg" NOT "application/pdf".

## UI Layout Architecture
viewport-fit=cover in index.html. App wrapper: `h-[100dvh] overflow-hidden flex flex-col`.
Safe-area CSS: .nav-safe, .input-bar-bottom, .pb-nav-safe in index.css.
Sticky headers/fixed navbars: MUST use `bg-slate-950/95 backdrop-blur-sm` (NOT glass-subtle which is only 2.5% opacity).
Sticky in-exam progress bar uses `bg-slate-900/95 backdrop-blur-sm`.
The bottom "Submit Exam" bar uses bg-background (solid) — correct.

## Glassmorphism Design System
.glass = gradient 7%→4% + blur(24px) saturate(1.4) + inset border shadows — richer than flat rgba.
.glass-sm = gradient 5%→3% + blur(16px) saturate(1.3).
.glass-subtle = flat rgba(255,255,255,0.025) — used only for non-scrolling backgrounds (NOT sticky bars).
.glass-premium = indigo-tinted gradient + blur(32px) saturate(1.6) — for AI message bubbles and key cards.
AI message bubbles use glass-premium + border-white/10. User bubbles use indigo-500→violet-700 gradient + ring-1 ring-white/10.

## Chat Bubble Overflow Prevention
Bubble containers MUST have: max-w-[88%] min-w-0 overflow-hidden.
User message text MUST have: break-words [overflow-wrap:anywhere].
ai-prose pre: overflow-x:auto max-width:100% word-break:normal white-space:pre.
ai-prose table: display:block overflow-x:auto.
The outer flex column must have min-w-0 to prevent flex overflow.

## Rolling Conversation Summarization (Session Memory)
Trigger: after each AI response in handleSend(), when conversation (pre-exchange snapshot) has ≥30 non-system chat messages (SUMMARY_THRESHOLD=30). Keeps last 10 verbatim (KEEP_RECENT=10).
Backend: POST /api/chat/summarize — sessionMiddleware required, does NOT increment message/voice counters. Accepts {messages: ChatMessage[]}, returns {summary: string}. Uses summarizeConversation() in ai.ts (Groq first → OpenRouter, max_tokens=400, temperature=0.3).
Frontend trigger (triggerSummarize): fires background fetch after await streamChat() in handleSend. Uses preMessages snapshot taken before the exchange so no stale-closure issue. compressConversation() in context uses setConversations(prev=>...) so always sees latest state.
compressConversation(): preserves [FILE_CONTEXT...] system messages verbatim, replaces old summary + older chat msgs with new [CONVERSATION_SUMMARY] system message + last KEEP_RECENT chat msgs. buildOpenAIMessages() already merges all system messages into the system prompt — summary lands in highest-priority position automatically.
summaryInProgressRef prevents concurrent summarisation calls.

## TypeScript Environment Note
The monorepo lib packages (api-client-react, api-zod, integrations-openrouter-ai) export directly from src — no dist step. This produces pre-existing TS6305 errors in typecheck but does NOT affect builds (esbuild for API, Vite for frontend both resolve correctly). Do not attempt to "fix" these — they are intentional design.

## Free Limits
messages: free=25 + grace=2 = 27; quizzes: free=2; voice: free=5.

## Pricing Env Vars
WEEKLY_PREMIUM_PRICE, MONTHLY_PREMIUM_PRICE — set in Render env to override default ₦ prices.

## PWA Hook Architecture
usePwaInstall() must be called ONCE per component tree. PwaInstallButton accepts props from parent hook instance.

## PDF OCR Fallback MIME Bug
upload.ts: image-based PDF visionAnalyze OCR fallback must use mimeType:"image/jpeg" NOT "application/pdf".
