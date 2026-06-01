---
name: Study-Buddy-AI architecture & key decisions
description: Monorepo structure, AI chain, auth, volatile state, and all hardening decisions for the Study-Buddy-AI production app.
---

## AI Provider Chain
Order: OpenRouter → OpenAI → DeepSeek → Groq (llama-3.3-70b-versatile).
Gemini removed. Groq uses OpenAI-compatible client at https://api.groq.com/openai/v1 with env var GROQ_API_KEY.
classifyError() distinguishes: isRateLimited (HTTP 429 / "rate limit" text) → "Rate Limited" (orange), isQuota (HTTP 402 / billing text) → "Out of Credits" (yellow), isAuthError (401 / "invalid_api_key") → "Invalid Key" (orange-500).
Admin Refresh button passes ?force=true to bypass 30s cache. getAiStatus(force) signature.
AiStatusResult interface: openrouter, openai, deepseek, groq (no gemini).
admin.tsx AiStatus interface and provider keys array updated to match.

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

## Persistent Store (Supabase write-through, session 4)
announcements.ts: write-through cache. initAnnouncements() loads from `app_announcements` table at startup. setAnnouncement/clearAnnouncement fire-and-forget write to Supabase; reads always synchronous from memory.
flags.ts: same write-through pattern. initFlags() loads from `feature_flags` table. setFlag() upserts to Supabase (fire-and-forget) so route stays synchronous. isFlagEnabled() stays synchronous.
user-messages.ts: fully async. sendAdminMessage/getUserMessages/markMessagesRead/clearUserMessages/countUnread all return Promises. Reads/writes go to `admin_messages` table with in-memory Map fallback for Supabase errors.
All callers updated: admin.ts message routes async, routes/user-messages.ts async.
index.ts: Promise.all([initFlags(), initAnnouncements()]) runs at startup (graceful catch — falls back to defaults if tables absent).
SQL migration: artifacts/api-server/migrations/001_persistent_store.sql — run once in Supabase SQL editor.
exam-store.ts (quizStore): intentionally kept in-memory (exams expire in 4h, serialising Set<> to JSONB deferred).
admin tokens (admin.ts): intentionally in-memory (security — 4h TTL, re-login is acceptable).

## Voice Input (session 4)
recognition.continuous = true — keeps recording until user presses stop (not after first isFinal).
voiceBaseRef captures input.trim() at voice start — voice text is appended to existing input, not replaced.
onresult accumulates finalTranscript + interimTranscript across all event.results[i] separately; setInput(base + " " + voiceText).
onerror: no-speech is silently ignored (user just paused, keep listening). not-allowed stops and toasts. other errors stop and toast.

## Key Bug Fixes
- Phase A: classifyError isAuthError → "Invalid Key" AiProviderStatus + orange badge in admin.tsx
- Phase B (BUG-B01): exam.tsx handleJoinExam setEnableTimer(hasTimer) — untimed exams showed 0:00
- 7-phase production stabilisation (session 2)
- 12-phase final hardening pass (session 3)

## Final Hardening Pass (12 phases, session 3)
Fixes applied:
- PDF parse: import path `pdf-parse/lib/pdf-parse.js`
- Viewport: maximum-scale=1.0, user-scalable=no; CSS body touch-action: manipulation
- PWA install: PwaInstallBanner lifted to chat.tsx with single hook instance
- AI date: buildSystemPrompt() prepends live date

## UI Layout Architecture
viewport-fit=cover in index.html. App wrapper: `h-[100dvh] overflow-hidden flex flex-col`.
Safe-area CSS: .nav-safe, .input-bar-bottom, .pb-nav-safe in index.css.
Critical Tailwind pitfall: shorthand `p-N sm:p-M` overrides `pb-X` at sm — always split into px/pt/pb.
Chat messages area: pb-52 (208px) to clear fixed input bar.

## Free Limits
messages: free=25 + grace=2 = 27; quizzes: free=2; voice: free=5.

## Pricing Env Vars
WEEKLY_PREMIUM_PRICE, MONTHLY_PREMIUM_PRICE — set in Render env to override default ₦ prices.

## PWA Hook Architecture
usePwaInstall() must be called ONCE per component tree. PwaInstallButton accepts props from parent hook instance. PwaInstallBanner also receives props from same hook instance in chat.tsx.

## PDF OCR Fallback MIME Bug
upload.ts: image-based PDF visionAnalyze OCR fallback must use mimeType:"image/jpeg" NOT "application/pdf".

## Admin Patterns
deletePaymentById() in db-users.ts. AnnouncementBanner dismissal persisted to localStorage key "ann_dismissed_id". Exam bottom bar uses bg-background (not glass-subtle) to prevent bleed.
