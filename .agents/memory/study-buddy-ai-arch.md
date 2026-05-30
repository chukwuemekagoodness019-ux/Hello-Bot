---
name: Study-Buddy-AI architecture & key decisions
description: Monorepo structure, AI chain, auth, volatile state, and Phase A–F hardening decisions for the Study-Buddy-AI production app.
---

## AI Provider Chain
Order: OpenRouter → OpenAI → DeepSeek → Gemini.
Only OpenRouter is active in both dev and prod (OpenAI/DeepSeek out of credits, Gemini invalid key).
classifyError() distinguishes: isRateLimited (HTTP 429 / "rate limit" text) → "Rate Limited" (orange), isQuota (HTTP 402 / billing text) → "Out of Credits" (yellow), isAuthError (401 / "invalid_api_key") → "Invalid Key" (orange-500).
Admin Refresh button passes ?force=true to bypass 30s cache. getAiStatus(force) signature.

## Auth
HMAC-SHA256 signed session cookies. SESSION_SECRET env var (defaults to dev string — must be set in Render prod). secure: only in production. sameSite: lax.

## Rate Limiting
lib/rate-limit.ts — simple in-memory IP bucket.
- /api/admin/login: 10 req / 15 min / IP
- /api/auth/login: 20 req / 15 min / IP
- /api/auth/register: 10 req / 1 hr / IP
app.set("trust proxy", 1) added to app.ts for Render.com proxy.

## Volatile in-memory state (lost on restart)
quizStore (GC'd every 4h), responseCache (500 LRU), rejection-reasons (capped 1000), user-messages (20/user), error-log (100), feature flags, announcements, admin tokens (4h TTL).

## Key Bug Fixes
- Phase A: classifyError isAuthError → "Invalid Key" AiProviderStatus + orange badge in admin.tsx
- Phase B (BUG-B01): exam.tsx handleJoinExam setEnableTimer(hasTimer) — untimed exams showed 0:00
- 7-phase production stabilisation (completed session 2):
  - Phase 1: 429 now → "Rate Limited" (not "Out of Credits"); admin Refresh bypasses 30s cache with ?force=true
  - Phase 2: Admin-to-user direct messages now surface in chat header — Bell icon, unread badge, 30s poll, modal panel with mark-read
  - Phase 3: PLANS pricing now read from WEEKLY_PREMIUM_PRICE / MONTHLY_PREMIUM_PRICE env vars (defaults ₦2,000 / ₦6,000)
  - Phase 4: pdf-parse imported via `pdf-parse/lib/pdf-parse.js` to bypass test-file loader crash in ESM bundle
  - Phase 5: exam.tsx doSubmit had no `credentials:"include"` → 401 on auto-submit; fixed
  - Phase 6: Split-screen anti-cheat — resize listener triggers if window.innerWidth / screen.availWidth < 0.6
  - Phase 7: Chat message list `p-4 sm:p-6 pb-[168px]` — sm:p-6 shorthand overwrote pb-[168px] at 640–767px; fixed to `px-4 sm:px-6 pt-4 sm:pt-6 pb-[168px]`

## UI Stabilization — Layout Architecture (applied to all pages)
viewport-fit=cover is SET in index.html — iOS safe-area insets are real (34px on iPhone X+).
App wrapper pattern: `<div className="h-[100dvh] overflow-hidden flex flex-col">` in App() wraps OfflineBanner + WouterRouter. AppRoutes wraps content in `flex-1 min-h-0 flex flex-col overflow-hidden` + inner `flex-1 min-h-0 relative`. Each page uses `h-full` (chat) or `h-full overflow-y-auto` (quiz/exam/admin) — never `min-h-[100dvh]` or `min-h-screen`.
Safe-area CSS utilities in index.css: `.nav-safe` (min-height+pb for bottom nav), `.input-bar-bottom` (bottom: calc(3.5rem + safe-area)), `.pb-nav-safe` (outer container pb).
Critical Tailwind pitfall: shorthand `p-N sm:p-M` overrides any `pb-X` at the sm breakpoint — always split into `px-N sm:px-M pt-N sm:pt-M pb-X` when you need independent bottom padding.
Chat messages area: `pb-52` (208px) to clear the fixed input bar at max expansion (file chip + max-height textarea = up to 192px total).

## Free Limits
messages: free=25 + grace=2 = 27; quizzes: free=2; voice: free=5.

## Pricing Env Vars
WEEKLY_PREMIUM_PRICE, MONTHLY_PREMIUM_PRICE — set in Render env to override default ₦ prices.
