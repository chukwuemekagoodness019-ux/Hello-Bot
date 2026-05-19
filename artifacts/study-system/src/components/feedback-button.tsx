import { useState } from "react";
import { MessageSquarePlus, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";

const BASE = import.meta.env.BASE_URL as string;

const CATEGORIES = [
  { id: "bug", label: "Bug Report" },
  { id: "payment", label: "Payment Issue" },
  { id: "support", label: "Support Request" },
  { id: "general", label: "General Feedback" },
];

export function FeedbackButton() {
  const [open, setOpen] = useState(false);
  const [category, setCategory] = useState("general");
  const [message, setMessage] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);
  const { toast } = useToast();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!message.trim()) return;
    setSubmitting(true);
    try {
      const res = await fetch(`${BASE}api/feedback`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ category, message }),
      });
      if (!res.ok) throw new Error("Failed");
      setDone(true);
      setTimeout(() => {
        setOpen(false);
        setDone(false);
        setMessage("");
        setCategory("general");
      }, 2000);
    } catch {
      toast({ title: "Failed to send feedback. Please try again.", variant: "destructive" });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="fixed bottom-20 right-4 z-40 md:bottom-6 w-10 h-10 bg-card border border-border rounded-full flex items-center justify-center shadow-lg hover:border-primary/50 transition-colors"
        aria-label="Send feedback"
        title="Send feedback or report an issue"
      >
        <MessageSquarePlus className="w-4 h-4 text-muted-foreground" />
      </button>

      {open && (
        <div
          className="fixed inset-0 bg-background/60 backdrop-blur-sm z-50 flex items-end sm:items-center justify-center p-4"
          onClick={(e) => e.target === e.currentTarget && setOpen(false)}
        >
          <div className="w-full max-w-sm bg-card border border-border rounded-2xl shadow-2xl overflow-hidden">
            <div className="flex items-center justify-between px-4 py-3 border-b border-border">
              <h3 className="font-semibold text-sm">Send Feedback</h3>
              <button
                onClick={() => setOpen(false)}
                className="text-muted-foreground hover:text-foreground transition-colors"
                aria-label="Close"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {done ? (
              <div className="p-8 text-center">
                <div className="text-3xl mb-2">✓</div>
                <p className="text-sm text-muted-foreground">Thanks for your feedback!</p>
              </div>
            ) : (
              <form onSubmit={handleSubmit} className="p-4 space-y-3">
                <select
                  value={category}
                  onChange={(e) => setCategory(e.target.value)}
                  className="w-full bg-background border border-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-primary"
                >
                  {CATEGORIES.map((c) => (
                    <option key={c.id} value={c.id}>{c.label}</option>
                  ))}
                </select>
                <textarea
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                  placeholder="Describe your issue or feedback..."
                  rows={4}
                  className="w-full bg-background border border-border rounded-lg px-3 py-2 text-sm resize-none focus:outline-none focus:ring-1 focus:ring-primary"
                  required
                />
                <Button
                  type="submit"
                  className="w-full"
                  size="sm"
                  disabled={submitting || !message.trim()}
                >
                  {submitting ? "Sending…" : "Send Feedback"}
                </Button>
              </form>
            )}
          </div>
        </div>
      )}
    </>
  );
}
