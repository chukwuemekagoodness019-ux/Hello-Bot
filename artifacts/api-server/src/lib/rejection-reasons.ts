const reasons = new Map<number, string>();

export function setRejectionReason(paymentId: number, reason: string): void {
  reasons.set(paymentId, reason.slice(0, 500));
}

export function getRejectionReason(paymentId: number): string | null {
  return reasons.get(paymentId) ?? null;
}

export function clearRejectionReason(paymentId: number): void {
  reasons.delete(paymentId);
}
