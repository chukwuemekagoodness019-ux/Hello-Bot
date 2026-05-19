import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { usePaymentModal } from "@/hooks/use-payment-modal";
import { Button } from "@/components/ui/button";
import { useGetPaymentInfo } from "@workspace/api-client-react";
import { useState, useEffect } from "react";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { Label } from "@/components/ui/label";

const BASE = import.meta.env.BASE_URL as string;

export function PaymentModal() {
  const { isOpen, close } = usePaymentModal();
  const { data: paymentInfo, isLoading } = useGetPaymentInfo();
  const [selectedPlan, setSelectedPlan] = useState<string>("weekly");
  const [transactionId, setTransactionId] = useState("");
  const [screenshot, setScreenshot] = useState<File | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [success, setSuccess] = useState(false);
  const { toast } = useToast();

  useEffect(() => {
    if (isOpen) {
      setSuccess(false);
      setSubmitting(false);
      setTransactionId("");
      setScreenshot(null);
      setSelectedPlan("weekly");
    }
  }, [isOpen]);

  const handleCopy = (text: string) => {
    navigator.clipboard.writeText(text);
    toast({ title: "Copied to clipboard" });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!transactionId.trim()) {
      toast({ title: "Transaction ID required", variant: "destructive" });
      return;
    }

    setSubmitting(true);
    try {
      const formData = new FormData();
      formData.append("plan", selectedPlan);
      formData.append("transactionId", transactionId.trim());
      if (screenshot) formData.append("screenshot", screenshot);

      const res = await fetch(`${BASE}api/payment/submit`, {
        method: "POST",
        body: formData,
      });

      if (res.status === 409) {
        toast({ title: "A pending payment already exists. Please wait for admin review.", variant: "destructive" });
        return;
      }

      if (!res.ok) {
        const data = await res.json().catch(() => ({})) as { error?: string };
        toast({ title: data.error ?? "Failed to submit payment proof", variant: "destructive" });
        return;
      }

      setSuccess(true);
    } catch {
      toast({ title: "Network error. Please try again.", variant: "destructive" });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && close()}>
      <DialogContent className="sm:max-w-md bg-card text-card-foreground border-border max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-2xl font-bold">Upgrade to Premium</DialogTitle>
          <DialogDescription className="text-muted-foreground">
            Unlimited messages, quizzes, exams, and voice study sessions.
          </DialogDescription>
        </DialogHeader>

        {success ? (
          <div className="py-8 text-center space-y-4">
            <div className="w-16 h-16 bg-primary/20 text-primary rounded-full flex items-center justify-center mx-auto text-3xl">✓</div>
            <h3 className="text-xl font-bold">Pending Admin Verification</h3>
            <p className="text-muted-foreground text-sm leading-relaxed">
              Your payment proof has been received and is under review. You'll be upgraded once approved — usually within a few hours.
            </p>
            <Button onClick={close} className="mt-2">Close</Button>
          </div>
        ) : isLoading ? (
          <div className="py-12 flex justify-center">
            <span className="animate-pulse text-muted-foreground text-sm">Loading payment info…</span>
          </div>
        ) : paymentInfo ? (
          <form onSubmit={handleSubmit} className="space-y-6 py-4">
            <div className="space-y-3">
              <Label>1. Select a Plan</Label>
              <div className="grid grid-cols-2 gap-3">
                {paymentInfo.plans.map((plan) => (
                  <button
                    key={plan.id}
                    type="button"
                    onClick={() => setSelectedPlan(plan.id)}
                    className={`p-4 rounded-xl border text-left transition-all ${
                      selectedPlan === plan.id
                        ? "bg-primary/10 border-primary ring-1 ring-primary"
                        : "bg-background border-border hover:border-primary/50"
                    }`}
                  >
                    <div className="font-semibold text-sm">{plan.label}</div>
                    <div className="font-mono text-lg mt-1 text-primary">{plan.priceLabel}</div>
                  </button>
                ))}
              </div>
            </div>

            <div className="space-y-3">
              <Label>2. Make Transfer</Label>
              <div className="p-4 rounded-xl bg-secondary/50 border border-border space-y-3 text-sm">
                <div className="flex justify-between items-center">
                  <span className="text-muted-foreground">Bank</span>
                  <span className="font-semibold">{paymentInfo.provider}</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-muted-foreground">Account Name</span>
                  <span className="font-medium">{paymentInfo.accountName}</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-muted-foreground">Account Number</span>
                  <div className="flex items-center gap-2">
                    <span className="font-mono font-bold text-lg text-primary">{paymentInfo.accountNumber}</span>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="h-6 px-2 text-xs"
                      onClick={() => handleCopy(paymentInfo.accountNumber)}
                    >
                      Copy
                    </Button>
                  </div>
                </div>
              </div>
            </div>

            <div className="space-y-3">
              <Label>3. Confirm Payment</Label>
              <div className="space-y-3">
                <Input
                  placeholder="Transaction ID / Session ID"
                  value={transactionId}
                  onChange={(e) => setTransactionId(e.target.value)}
                  required
                  autoComplete="off"
                />
                <div>
                  <Label className="text-xs text-muted-foreground mb-1.5 block">
                    Payment Screenshot <span className="opacity-60">(optional but recommended)</span>
                  </Label>
                  <Input
                    type="file"
                    accept="image/*"
                    onChange={(e) => setScreenshot(e.target.files?.[0] ?? null)}
                    className="file:mr-4 file:py-1 file:px-3 file:rounded-full file:border-0 file:text-xs file:font-semibold file:bg-primary/10 file:text-primary hover:file:bg-primary/20 text-sm cursor-pointer"
                  />
                </div>
              </div>
            </div>

            <Button type="submit" className="w-full" size="lg" disabled={submitting || !transactionId.trim()}>
              {submitting ? "Submitting…" : "Submit Payment Proof"}
            </Button>
          </form>
        ) : (
          <div className="py-8 text-center text-sm text-muted-foreground">
            Payment information unavailable. Please try again.
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
