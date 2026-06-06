---
name: Study-Buddy-AI architecture & key decisions
description: Monorepo structure, AI chain, auth, volatile state, and all hardening decisions for the Study-Buddy-AI production app.
---

## AI Provider Chain
Order: OpenRouter → OpenAI → DeepSeek → Groq (llama-3.3-70b-versatile).
Groq uses OpenAI-compatible client at https://api.groq.com/openai/v1.
CRITICAL: Render env var is `GROK_API_KEY` (not GROQ). Code must check: `process.env.GROQ_API_KEY || process.env.GROK_API_KEY`.
classifyError() distinguishes: isRateLimited (HTTP 429 non-quota) → "Rate Limited", isQuota (HTTP 402 OR quota text) → "Out of Credits", isAuthError (401) → "Invalid Key".
CRITICAL: isQuota must be checked BEFORE isRateLimited — OpenAI returns HTTP 429 for BOTH rate limits AND quota exhaustion. Differentiate via message text: "exceeded your current quota" / "insufficient_quota" → isQuota. If isRateLimited is checked first, OpenAI out-of-credits appears as "Rate Limited" in admin dashboard.
DeepSeek-specific patterns added to classifyError: "authentication fails", "authentication failed", "auth_subrequest_failed" → isAuthError; "insufficient balance", "account has run out", "out of credit", "payment required" → isQuota; "overloaded", "overload" → isRateLimited.
Admin Refresh button passes ?force=true to bypass 30s cache. getAiStatus(force) signature.
AiStatusResult interface: openrouter, openai, deepseek, groq. AiProviderHealth.errorDetail?: string — raw error message for admin debugging (pingOne captures it).
pingOne uses max_tokens:1 — can show "Active" even when credits exhausted for real calls (known limitation).
tryProvider() fast-fails on isAuthError || isQuota || isRateLimited — skips retry loop so fallback chain reaches next provider immediately.

## System Prompt & File Context
buildSystemPrompt(profile?: UserProfile) accepts optional user context — injects a STUDENT PROFILE block at the end of the system prompt when populated. Fields: displayName, currentStreak, bestStreak, bestScore, lastActiveDate, weakSubjects[].
SYSTEM_PROMPT_BASE defines an elite Ivy-League academic coach persona (not a chatbot): Socratic method, markdown tables for structure, layered depth, subject-specific rigor protocols, Uncertainty Protocol (never assert unverified facts), and calibrated motivation. Quiz Redirect Rule is NON-NEGOTIABLE.
buildOpenAIMessages(messages, profile?) passes profile to buildSystemPrompt and merges all [FILE_CONTEXT] system messages from the conversation INTO the system prompt (not as separate user turns). Correct pattern:
  systemContent = buildSystemPrompt(profile) + "\n\n---\n**Uploaded File Context**\n\n" + contextMessages.map(m => m.content).join(...)
  Then conversationMessages (user/assistant only) follow in order.
chatComplete(messages, profile?) and chatCompleteStream(messages, onChunk, profile?) both accept UserProfile and forward it to buildOpenAIMessages.
WEAKNESS INJECTION: chat.ts (route) fetches user weaknesses from quiz_attempts via getCachedWeaknesses(userId) with a 5-min in-memory cache (weaknessCache Map<number, WeaknessCache>). Profile built from req.user + weakness cache. Injected into BOTH /chat and /chat/stream endpoints.
UserProfile exported from ai.ts. UserState in api-client-react and api-zod schemas now includes email?, displayName? (added manually — these are handwritten schemas, not orval generated).
MessageList receives displayName?: string|null prop — welcome greeting shows "Hey, {name}! Ready to study?" when name available.

## Spaced Repetition — Supabase write-through
lib/review-schedule.ts: in-memory store + Supabase `review_schedules` table.
- `initReviewSchedules()` called in startup Promise.all — loads future entries from DB into memory.
- `scheduleReview()` writes to Supabase fire-and-forget, in-memory updated synchronously.
- `checkAndDispatchDueReviews()` dispatches from in-memory; deletes from Supabase async.
- Delivery via sendAdminMessage — bell icon picks up automatically. Called void at top of GET /api/user/messages.

## Auth
HMAC-SHA256 signed session cookies. SESSION_SECRET env var (defaults to dev string — must be set in Render prod). secure: only in production. sameSite: lax.

## Rate Limiting
lib/rate-limit.ts — simple in-memory IP bucket.
- /api/admin/login: 10 req / 15 min / IP
- /api/auth/login: 20 req / 15 min / IP
- /api/auth/register: 10 req / 1 hr / IP
Per-user message/quiz/voice counters are in Supabase `users` table — NOT in-memory.
app.set("trust proxy", 1) in app.ts for Render.com proxy.

## CORS — production-safe allowlist
Set `CORS_ORIGIN=https://yourapp.replit.app` (comma-separated) in deployment secrets.
localhost + 127.0.0.1 always allowed. Same-origin (no Origin header) always allowed.

## SSE heartbeat
`POST /api/chat/stream` sends `: heartbeat\n\n` (SSE comment) every 15 s via setInterval to prevent reverse-proxy idle timeouts.

## Payment screenshots → Supabase Storage
- Upload to `payment-screenshots` bucket (create as PUBLIC in Supabase dashboard first).
- `screenshot_data` column stores either a public Storage URL (new) or legacy base64 (old).
- Admin `/admin/payments/:id/screenshot` route: if `screenshotData.startsWith("https://")` → HTTP 302 redirect; else → serve base64 buffer.
- Fallback: if Storage upload fails, base64 stored so payment is never blocked.
- Server env vars renamed: PAYMENT_ACCOUNT_NAME, PAYMENT_ACCOUNT_NUMBER, PAYMENT_PROVIDER (NOT VITE_ prefixed).

## Chat history → Supabase
- `user_conversations` table (migration 002).
- Frontend debounces sync 2 s after any conversation change → PUT /api/conversations.
- FILE_CONTEXT system messages (PDFs) stripped before sync — too large for JSONB.
- On mount: if localStorage empty, fetches GET /api/conversations and hydrates state.
- Routes: `routes/conversations.ts` — GET/PUT /api/conversations.

## Dashboard page (`/dashboard`)
- Route added to App.tsx and bottom nav of chat page (BarChart2 icon, "Stats" label).
- Fetches GET /api/dashboard: streak + weaknesses (avg<70% last 30d) + recentAttempts.
- Backend: `routes/dashboard.ts` + `lib/db-dashboard.ts` (queries quiz_attempts table).
- "Remediate" button navigates to `/?ep=encodeURIComponent(prompt)` (same URL param as exam handoff).
- Active roadmaps read from localStorage keys `roadmap_<fingerprint>`.

## Exam → Chat handoff (URL param)
- Changed from sessionStorage to URL param: `setLocation("/?ep=encodeURIComponent(prompt)")`.
- Chat reads `window.location.search` URLSearchParams `ep` in useState initializer; cleans URL with `history.replaceState` in useEffect.
- **Why:** sessionStorage fails when opened in a new tab. URL param survives any navigation pattern.

## Roadmap localStorage persistence
- `RoadmapCard` in `message-list.tsx` saves `{ milestones, checked[] }` to `roadmap_<fingerprint>`.
- Fingerprint: djb2-style hash of `milestones.join("|")`.
- Loaded on mount — checked state survives page reloads.
- Dashboard reads all `roadmap_*` keys to show active (incomplete) roadmaps.

## Persistent Stores (Supabase write-through)
announcements.ts, flags.ts, rejection-reasons.ts, error-log.ts, exam-store.ts, exam-limits.ts, review-schedule.ts, db-conversations.ts — all Supabase write-through with in-memory Map fallback.
admin tokens (admin.ts): intentionally in-memory (security — 4h TTL).

## SQL Migrations
- 001 = initial persistent store tables
- 002 = rejection_reasons + ai_error_log + review_schedules + user_conversations
  (run `migrations/002_persistence_upgrade.sql` in Supabase SQL editor)
- 003 = active_exams + exam_limits
All fallback to in-memory if tables absent.

## Quiz/Exam Generation
generateQuiz() max_tokens MUST be 8192 (not 4096) — 50 questions with options/answers/explanations easily exceeds 4096 tokens and truncates JSON.
Groq quiz generation omits `response_format: { type: "json_object" }` — llama-3.3-70b-versatile doesn't support it.
TOP-UP PATTERN: generateQuiz() uses a local makeQuizProviders(msgs) helper (providers built per-messages-array) and parseQuizJson() helper. After the initial runChain("quiz"), if questions.length > 0 && questions.length < numQuestions, fires one additional runChain("quiz-topup") with a "generate exactly N MORE different questions" prompt. Max 1 top-up to avoid cost blow-up. Both calls use the same provider chain via makeQuizProviders.
Image context cap: upload.ts caps image contextNote at 4000 chars (PDF uses 6000 chars).

## Voice Input (Complete Pattern)
recognition.continuous = true — keeps recording until user presses stop.
voiceBaseRef captures input.trim() at voice start — voice text appended, not replaced.
finalTranscriptRef: kept for cleanup in onend but NOT used in display (see bug below).
processedIndexRef tracks which result indices have already been finalized — loops from processedIndexRef.current (NOT event.resultIndex) for final detection.
manualStopRef: set to true in stopVoice() — distinguishes manual stops from browser-ended sessions.
CRITICAL VOICE BUG FIX: DO NOT use `combined = finalTranscriptRef + interimTranscript` for display. Chrome's continuous-mode interimTranscript contains the FULL utterance so far (including already-finalized words), so combining both doubles/triples words ("How how how"). 
CORRECT PATTERN: In onresult, commit finals IMMEDIATELY to voiceBaseRef (not finalTranscriptRef), then display = voiceBaseRef.current + " " + interimTranscript.trim() only. interimTranscript is truly only the unsettled suffix.
VOICE DUPLICATION ROOT CAUSE (definitive): Old recognition instances fire buffered onresult events AFTER their onend fires and a new session has started. Both sessions share the same refs (voiceBaseRef, processedIndexRef). Old speech gets re-committed to voiceBaseRef → duplication, especially severe on Android Chrome which buffers aggressively.
DEFINITIVE FIX — SESSION ID GUARD: sessionIdRef = useRef<number>(0). In startRecognitionInstance: (1) increment sessionIdRef FIRST and capture as `mySessionId = (sessionIdRef.current += 1)`, (2) abort old recognitionRef.current AFTER increment (its onend is now stale), (3) create new instance, (4) all handlers (onstart/onresult/onerror/onend) check `sessionIdRef.current === mySessionId` at entry — if stale, return immediately. In stopVoice: increment sessionIdRef BEFORE abort so queued events are dropped. In startVoice: do NOT manually abort before calling startRecognitionInstance — the function handles it internally in the correct order (abort before would fire onend before session ID invalidation, causing spurious restart).
SECONDARY DEFENSE (still active): restartTimeRef (timestamp) + restartBaseRef (snapshot). During ECHO_WINDOW_MS (1200ms) after restart, skip final/interim text whose lowercase form is a substring of the snapshot. Also use processedIndexRef.current (NOT event.resultIndex) for interim loop.
onend: voiceBaseRef already has all finalized text, so just reset finalTranscriptRef and processedIndexRef. If !manualStopRef, record restartTimeRef+restartBaseRef THEN create a NEW recognition instance and call .start() — never call .start() on an ended instance (throws InvalidStateError in Chrome).
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
