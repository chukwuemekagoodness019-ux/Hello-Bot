import { supabase } from "./supabase";

const MAX_ENTRIES = 100;

export interface ErrorEntry {
  ts: string;
  provider: string;
  stage: string;
  message: string;
}

const log: ErrorEntry[] = [];

export async function initErrorLog(): Promise<void> {
  try {
    const { data, error } = await supabase
      .from("ai_error_log")
      .select("ts, provider, stage, message")
      .order("ts", { ascending: false })
      .limit(MAX_ENTRIES);
    if (!error && data && data.length > 0) {
      log.length = 0;
      for (const r of data) {
        log.push({
          ts: String(r.ts),
          provider: String(r.provider),
          stage: String(r.stage),
          message: String(r.message),
        });
      }
    }
  } catch {
    // Table may not exist yet — silently use empty log.
  }
}

export function pushError(entry: ErrorEntry): void {
  log.unshift(entry);
  if (log.length > MAX_ENTRIES) log.pop();
  void (async () => {
    try {
      await supabase.from("ai_error_log").insert({
        ts: entry.ts,
        provider: entry.provider,
        stage: entry.stage,
        message: entry.message,
      });
    } catch {
      // Supabase unavailable — in-memory log already updated.
    }
  })();
}

export function getErrorLog(): ErrorEntry[] {
  return [...log];
}

export function clearErrorLog(): void {
  log.length = 0;
  void (async () => {
    try {
      await supabase.from("ai_error_log").delete().neq("id", 0);
    } catch {
      // Supabase unavailable — in-memory log cleared.
    }
  })();
}
