import { supabase } from "./supabase";

export type AnnouncementType = "info" | "warning" | "error";

export interface Announcement {
  id: string;
  text: string;
  type: AnnouncementType;
}

// In-memory cache — populated at startup from Supabase, kept in sync on writes.
let current: Announcement | null = null;

export async function initAnnouncements(): Promise<void> {
  try {
    const { data, error } = await supabase
      .from("app_announcements")
      .select("id, text, type")
      .eq("active", true)
      .limit(1)
      .maybeSingle();
    if (!error && data) {
      current = { id: String(data.id), text: String(data.text), type: data.type as AnnouncementType };
    }
  } catch {
    // Table may not exist yet — silently use in-memory default (null).
  }
}

export function getAnnouncement(): Announcement | null {
  return current;
}

export function setAnnouncement(a: Announcement): void {
  current = a;
  void (async () => {
    try {
      await supabase.from("app_announcements").delete().neq("id", "___never___");
      await supabase.from("app_announcements").insert({
        id: a.id,
        text: a.text,
        type: a.type,
        active: true,
      });
    } catch {
      // Supabase unavailable — in-memory change still took effect.
    }
  })();
}

export function clearAnnouncement(): void {
  current = null;
  void (async () => {
    try {
      await supabase.from("app_announcements").delete().neq("id", "___never___");
    } catch {
      // Supabase unavailable — in-memory change still took effect.
    }
  })();
}
