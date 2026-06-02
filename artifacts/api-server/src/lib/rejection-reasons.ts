import { supabase } from "./supabase";

const MAX_REASONS = 1000;
const reasons = new Map<number, string>();

export async function initRejectionReasons(): Promise<void> {
  try {
    const { data, error } = await supabase
      .from("payment_rejection_reasons")
      .select("payment_id, reason");
    if (!error && data) {
      for (const row of data) {
        reasons.set(Number(row.payment_id), String(row.reason).slice(0, 500));
      }
    }
  } catch {
    // Table may not exist yet — silently use empty map.
  }
}

export function setRejectionReason(paymentId: number, reason: string): void {
  if (reasons.size >= MAX_REASONS) {
    const oldest = reasons.keys().next().value;
    if (oldest !== undefined) reasons.delete(oldest);
  }
  const trimmed = reason.slice(0, 500);
  reasons.set(paymentId, trimmed);
  void (async () => {
    try {
      await supabase
        .from("payment_rejection_reasons")
        .upsert({ payment_id: paymentId, reason: trimmed }, { onConflict: "payment_id" });
    } catch {
      // Supabase unavailable — in-memory change already applied.
    }
  })();
}

export function getRejectionReason(paymentId: number): string | null {
  return reasons.get(paymentId) ?? null;
}

export function clearRejectionReason(paymentId: number): void {
  reasons.delete(paymentId);
  void (async () => {
    try {
      await supabase
        .from("payment_rejection_reasons")
        .delete()
        .eq("payment_id", paymentId);
    } catch {
      // Supabase unavailable — in-memory cleared already.
    }
  })();
}
