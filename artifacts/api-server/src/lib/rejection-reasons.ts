const MAX_REASONS = 1000;
const reasons = new Map<number, string>();

export function setRejectionReason(paymentId: number, reason: string): void {
  if (reasons.size >= MAX_REASONS) {
    const oldest = reasons.keys().next().value;
    if (oldest !== undefined) reasons.delete(oldest);
  }
  reasons.set(paymentId, reason.slice(0, 500));
}

export function getRejectionReason(paymentId: number): string | null {
  return reasons.get(paymentId) ?? null;
}

export function clearRejectionReason(paymentId: number): void {
  reasons.delete(paymentId);
}
