import OpenAI from "openai";

const baseURL =
  process.env.AI_INTEGRATIONS_OPENROUTER_BASE_URL ||
  (process.env.OPENROUTER_API_KEY ? "https://openrouter.ai/api/v1" : undefined);

const apiKey =
  process.env.AI_INTEGRATIONS_OPENROUTER_API_KEY ||
  process.env.OPENROUTER_API_KEY;

if (!baseURL || !apiKey) {
  throw new Error(
    "OpenRouter is not configured. Set OPENROUTER_API_KEY (or both AI_INTEGRATIONS_OPENROUTER_BASE_URL and AI_INTEGRATIONS_OPENROUTER_API_KEY).",
  );
}

export const openrouter = new OpenAI({
  baseURL,
  apiKey,
});
