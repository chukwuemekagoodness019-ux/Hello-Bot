---
name: Study-Buddy-AI architecture & key decisions
description: Monorepo structure, AI chain, auth, volatile state, and all hardening decisions for the Study-Buddy-AI production app.
---

## AI Provider Chain
Order: OpenRouter → OpenAI → DeepSeek → Gemini.
Only OpenRouter is active in both dev and prod (OpenAI/DeepSeek out of credits, Gemini invalid key).
classifyError() distinguishes: isRateLimited (HTTP 429 / "rate limit" text) → "Rate Limited" (orange), isQuota (HTTP 402 / billing text) → "Out of Credits" (yellow), isAuthError (401 / "invalid_api_key") → "Invalid Key" (orange-500).
Admin Refresh button passes ?force=true to bypass 30s cache. getAiStatus(force) signature.

## System Prompt
SYSTEM_PROMPT_BASE is a static string. buildSystemPrompt() wraps it with a live date header computed at call time via `new Date().toLocaleDateString("en-NG", ...)`. buildOpenAIMessages() calls buildSystemPrompt() on every request — date is always fresh, never stale.
Global understanding-check rule added: after any substantive explanation, AI closes with a mini-question, quiz nudge, or offer to simplify — rotated each response.

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

## Final Hardening Pass (12 phases, session 3)
Audited all pages and confirmed no fixes needed for: overlay layering (solid bg-background barrier at z-15 blocks bleed), chat title generation (generateTitle() in chat-history-context.tsx is comprehensive), image follow-up memory (system messages preserved via buildHistory), limits enforcement, admin isolation.
Fixes applied:
- PDF parse: import path changed to `pdf-parse/lib/pdf-parse.js`
- Viewport: added `maximum-scale=1.0, user-scalable=no` — prevents double-tap/pinch zoom in PWA
- CSS body: `touch-action: manipulation` — prevents double-tap zoom while keeping scroll
- PWA install: lifted usePwaInstall() to chat.tsx; PwaInstallButton now accepts props (no duplicate hook); PwaInstallBanner added below chat header (dismissible, persists to localStorage key `pwa-banner-dismissed`)
- AI date: buildSystemPrompt() prepends live date; knowledge-cutoff caveat for recent events

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
formatNairaPrice() in payment.ts formats raw integers to ₦ strings. payment-modal.tsx shows "—" as fallback when priceLabel is empty.

## PWA Icons
Brand icon stored at attached_assets/1780188862120_1780189173182.png — copy to public/icon-192.png, icon-512.png, apple-touch-icon.png for PWA icon replacement.

## Admin Payment Deletion
deletePaymentById() added to db-users.ts (Supabase DELETE). DELETE /admin/payments/:id route in admin.ts requires adminMiddleware. Delete button in admin.tsx uses confirmAction dialog (same pattern as other destructive actions) — Trash2 icon.

## Announcement Dismissal
AnnouncementBanner stores dismissed ID in localStorage under key "ann_dismissed_id" — persists across navigation. dismissedId initialised from localStorage via useState lazy initializer.

## PDF OCR Fallback MIME Bug
upload.ts: when PDF is image-based and falls back to visionAnalyze OCR, use mimeType:"image/jpeg" NOT "application/pdf". Vision APIs reject data:application/pdf;base64 URLs — they require image MIME types.

## Exam Bottom Bar Bleed (Issue B)
exam.tsx fixed submit bar: was `glass-subtle border-t border-white/8` (translucent bleed) → changed to `bg-background border-t border-border`. quiz.tsx has no floating action bar — no bleed issue there.

## PWA Hook Architecture
usePwaInstall() must be called ONCE per component tree and props passed down. Multiple hook instances compete for window.__pwaInstallPrompt (singleton, nulled after first consumer). PwaInstallButton now accepts props (canInstall, isIOS, install, showIOSGuide, closeIOSGuide) — hook is lifted to chat.tsx. PwaInstallBanner also receives props from same hook instance.
