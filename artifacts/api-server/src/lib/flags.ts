import { supabase } from "./supabase";

export type FeatureKey = "exam" | "quiz" | "voice" | "pdf_upload" | "image_upload" | "payments";

const DEFAULTS: Record<FeatureKey, boolean> = {
  exam: true,
  quiz: true,
  voice: true,
  pdf_upload: true,
  image_upload: true,
  payments: true,
};

// In-memory working copy — loaded from Supabase at startup, kept in sync on writes.
const FLAGS: Record<FeatureKey, boolean> = { ...DEFAULTS };

export async function initFlags(): Promise<void> {
  try {
    const { data, error } = await supabase
      .from("feature_flags")
      .select("key, enabled");
    if (!error && data) {
      for (const row of data) {
        const key = row.key as string;
        if (key in FLAGS) {
          (FLAGS as Record<string, boolean>)[key] = Boolean(row.enabled);
        }
      }
    }
  } catch {
    // Table may not exist yet — silently use compiled defaults.
  }
}

export function getFlags(): Record<FeatureKey, boolean> {
  return { ...FLAGS };
}

export function setFlag(key: string, enabled: boolean): boolean {
  if (!(key in FLAGS)) return false;
  (FLAGS as Record<string, boolean>)[key] = enabled;
  // Write-through: fire-and-forget so the route stays synchronous.
  void (async () => {
    try {
      await supabase
        .from("feature_flags")
        .upsert({ key, enabled }, { onConflict: "key" });
    } catch {
      // Supabase unavailable — in-memory change already applied.
    }
  })();
  return true;
}

export function isFlagEnabled(key: FeatureKey): boolean {
  return FLAGS[key] !== false;
}
