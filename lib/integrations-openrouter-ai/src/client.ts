import OpenAI from "openai";

let _client: OpenAI | null = null;

function getClient(): OpenAI {
  if (_client) return _client;

  const baseURL =
    process.env.AI_INTEGRATIONS_OPENROUTER_BASE_URL ||
    (process.env.OPENROUTER_API_KEY ? "https://openrouter.ai/api/v1" : undefined);

  const apiKey =
    process.env.AI_INTEGRATIONS_OPENROUTER_API_KEY ||
    process.env.OPENROUTER_API_KEY;

  if (!baseURL || !apiKey) {
    throw new Error(
      "OpenRouter is not configured. Set OPENROUTER_API_KEY " +
        "(or both AI_INTEGRATIONS_OPENROUTER_BASE_URL and AI_INTEGRATIONS_OPENROUTER_API_KEY).",
    );
  }

  _client = new OpenAI({ baseURL, apiKey });
  return _client;
}

// Proxy so that all existing `openrouter.chat.completions.create(...)` call-sites
// continue to work unchanged, but the client (and its credential check) is only
// created on first use — not at module-load / server-boot time.
// This prevents the server from crashing on startup when credentials are absent.
export const openrouter: OpenAI = new Proxy({} as OpenAI, {
  get(_target, prop: string | symbol) {
    const client = getClient();
    const value = (client as unknown as Record<string | symbol, unknown>)[prop];
    return typeof value === "function" ? value.bind(client) : value;
  },
});
