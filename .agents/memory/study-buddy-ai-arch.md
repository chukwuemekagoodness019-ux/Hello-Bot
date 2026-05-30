---
name: Study-Buddy-AI architecture & key decisions
description: Monorepo structure, AI chain, auth, volatile state, and Phase A–F hardening decisions for the Study-Buddy-AI production app.
---

## AI Provider Chain
Order: OpenRouter → OpenAI → DeepSeek → Gemini.
Only OpenRouter is active in both dev and prod (OpenAI/DeepSeek out of credits, Gemini invalid key).
classifyError() detects isAuthError (HTTP 401/403 or "invalid_api_key" in message/code) → surfaces "Invalid Key" status in admin.

## Auth
HMAC-SHA256 signed session cookies. SESSION_SECRET env var (defaults to dev string — must be set in Render prod). secure: only in production. sameSite: lax.

## Rate Limiting (added Phase F)
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

## Free Limits
messages: free=25 + grace=2 = 27; quizzes: free=2; voice: free=5.
