import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import {
  Check, X, ArrowUp, Activity, RefreshCw, Users, CreditCard, Image,
  ToggleLeft, ToggleRight, Megaphone, MessageSquare, AlertTriangle, ShieldAlert,
  FileText, Send, Trash2,
} from "lucide-react";

const BASE = import.meta.env.BASE_URL as string;

type AdminUser = {
  id: number | string;
  email: string | null;
  displayName: string | null;
  isPremium: boolean;
  premiumUntil: string | null;
  messagesUsedToday: number;
  quizzesUsedToday: number;
  currentStreak: number;
  bestStreak: number;
  bestScore: number;
};

type AdminPayment = {
  id: number;
  userId: number | string;
  plan: string;
  transactionId: string;
  screenshotName: string | null;
  hasScreenshot: boolean;
  status: string;
  createdAt: string;
  rejectionReason: string | null;
};

type ProviderStatus = "Active" | "Out of Credits" | "Rate Limited" | "Invalid Key" | "Unavailable" | "Not Configured";
interface ProviderHealth { status: ProviderStatus; latency: number | null; role: string; }
interface AiStatus {
  openrouter: ProviderHealth;
  openai: ProviderHealth;
  deepseek: ProviderHealth;
  gemini?: ProviderHealth;
  cache?: { size: number; max: number };
  checkedAt: string;
}

type FeedbackItem = { id: number; userId: number | null; category: string; message: string; status: string; createdAt: string; };
type ErrorEntry = { ts: string; provider: string; stage: string; message: string; };
type FeatureFlags = Record<string, boolean>;
type Announcement = { id: string; text: string; type: "info" | "warning" | "error" } | null;
type ActiveExam = { id: string; subject: string; difficulty: string; questionCount: number; createdAt: number; expiresAt: number | null; attempts: number; maxAttempts: number; };
type ConfirmAction = { label: string; onConfirm: () => void };

type Section = "overview" | "control" | "payments" | "users" | "feedback" | "errors" | "exams";

const FLAG_LABELS: Record<string, string> = {
  exam: "Exam System",
  quiz: "Quiz System",
  voice: "Voice Input",
  pdf_upload: "PDF Upload",
  image_upload: "Image Upload",
  payments: "Payments",
};

function StatusBadge({ status }: { status: string }) {
  const variants: Record<string, string> = {
    pending: "bg-yellow-500/15 text-yellow-600 border-yellow-500/30",
    approved: "bg-emerald-500/15 text-emerald-600 border-emerald-500/30",
    rejected: "bg-red-500/15 text-red-600 border-red-500/30",
    unread: "bg-blue-500/15 text-blue-600 border-blue-500/30",
    investigating: "bg-yellow-500/15 text-yellow-600 border-yellow-500/30",
    resolved: "bg-emerald-500/15 text-emerald-600 border-emerald-500/30",
  };
  const cls = variants[status] || "bg-muted text-muted-foreground border-border";
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium border ${cls}`}>
      {status.charAt(0).toUpperCase() + status.slice(1)}
    </span>
  );
}

export default function AdminPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  // BUG-08 FIX: Do not read secret key from URL query param (leaks to logs/history).
  const [secretKey, setSecretKey] = useState("");
  const { toast } = useToast();
  const [token, setToken] = useState<string | null>(null);
  const [loginPending, setLoginPending] = useState(false);

  const [activeSection, setActiveSection] = useState<Section>("overview");
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [payments, setPayments] = useState<AdminPayment[]>([]);
  const [summary, setSummary] = useState<{ totalUsers: number; premiumUsers: number; pendingPayments: number; approvedPayments: number } | null>(null);
  const [aiStatus, setAiStatus] = useState<AiStatus | null>(null);
  const [aiLoading, setAiLoading] = useState(false);
  const [screenshotUrl, setScreenshotUrl] = useState<string | null>(null);
  const [paymentFilter, setPaymentFilter] = useState<"all" | "pending" | "approved" | "rejected">("all");

  const [flags, setFlags] = useState<FeatureFlags>({});
  const [announcement, setAnnouncement] = useState<Announcement>(null);
  const [newAnnText, setNewAnnText] = useState("");
  const [newAnnType, setNewAnnType] = useState<"info" | "warning" | "error">("info");
  const [feedbackItems, setFeedbackItems] = useState<FeedbackItem[]>([]);
  const [errorLog, setErrorLog] = useState<ErrorEntry[]>([]);
  const [activeExams, setActiveExams] = useState<ActiveExam[]>([]);
  const [confirmAction, setConfirmAction] = useState<ConfirmAction | null>(null);

  // Phase 5: reject with reason dialog
  const [rejectDialog, setRejectDialog] = useState<{ paymentId: number; reason: string } | null>(null);
  const [rejectPending, setRejectPending] = useState(false);

  // Phase 6: admin → user message dialog
  const [messageDialog, setMessageDialog] = useState<{ userId: number | string; userName: string; text: string } | null>(null);
  const [messagePending, setMessagePending] = useState(false);

  const adminHeaders = (t: string) => ({ "x-admin-token": t });
  const adminJsonHeaders = (t: string) => ({ "x-admin-token": t, "Content-Type": "application/json" });

  const fetchDashboard = async (t: string) => {
    try {
      const [uRes, pRes, sRes] = await Promise.all([
        fetch(`${BASE}api/admin/users`, { headers: adminHeaders(t) }),
        fetch(`${BASE}api/admin/payments`, { headers: adminHeaders(t) }),
        fetch(`${BASE}api/admin/summary`, { headers: adminHeaders(t) }),
      ]);
      if (uRes.ok) setUsers(await uRes.json());
      if (pRes.ok) setPayments(await pRes.json());
      if (sRes.ok) setSummary(await sRes.json());
    } catch {}
  };

  const fetchAiStatus = async (t: string, force = false) => {
    setAiLoading(true);
    try {
      const url = force ? `${BASE}api/admin/ai-status?force=true` : `${BASE}api/admin/ai-status`;
      const r = await fetch(url, { headers: adminHeaders(t) });
      if (r.ok) setAiStatus(await r.json());
    } catch {} finally {
      setAiLoading(false);
    }
  };

  const fetchFlags = async (t: string) => {
    try {
      const r = await fetch(`${BASE}api/admin/flags`, { headers: adminHeaders(t) });
      if (r.ok) setFlags(await r.json());
    } catch {}
  };

  const fetchAnnouncement = async (t: string) => {
    try {
      const r = await fetch(`${BASE}api/admin/announcement`, { headers: adminHeaders(t) });
      if (r.ok) setAnnouncement(await r.json());
    } catch {}
  };

  const fetchFeedback = async (t: string) => {
    try {
      const r = await fetch(`${BASE}api/admin/feedback`, { headers: adminHeaders(t) });
      if (r.ok) setFeedbackItems(await r.json());
    } catch {}
  };

  const fetchErrors = async (t: string) => {
    try {
      const r = await fetch(`${BASE}api/admin/errors`, { headers: adminHeaders(t) });
      if (r.ok) setErrorLog(await r.json());
    } catch {}
  };

  const fetchExams = async (t: string) => {
    try {
      const r = await fetch(`${BASE}api/admin/exams`, { headers: adminHeaders(t) });
      if (r.ok) setActiveExams(await r.json());
    } catch {}
  };

  const viewScreenshot = async (paymentId: number) => {
    try {
      const r = await fetch(`${BASE}api/admin/payments/${paymentId}/screenshot`, { headers: adminHeaders(token!) });
      if (!r.ok) { toast({ title: "No screenshot available", variant: "destructive" }); return; }
      const blob = await r.blob();
      setScreenshotUrl(URL.createObjectURL(blob));
    } catch {
      toast({ title: "Failed to load screenshot", variant: "destructive" });
    }
  };

  useEffect(() => {
    if (token) {
      fetchDashboard(token);
      fetchAiStatus(token);
      fetchFlags(token);
      fetchAnnouncement(token);
      fetchFeedback(token);
      fetchErrors(token);
      fetchExams(token);
    }
  }, [token]);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoginPending(true);
    try {
      const res = await fetch(`${BASE}api/admin/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ secretKey, password, email }),
      });
      if (res.ok) {
        const data = await res.json() as { token: string };
        setToken(data.token);
        toast({ title: "Logged in successfully" });
      } else {
        toast({ title: "Login failed — check credentials", variant: "destructive" });
      }
    } catch {
      toast({ title: "Network error. Please try again.", variant: "destructive" });
    } finally {
      setLoginPending(false);
    }
  };

  const handleDeletePayment = (id: number) => {
    setConfirmAction({
      label: `Delete payment record #${id}? This is permanent and cannot be undone.`,
      onConfirm: async () => {
        try {
          const res = await fetch(`${BASE}api/admin/payments/${id}`, { method: "DELETE", headers: adminHeaders(token!) });
          if (res.ok) { toast({ title: "Payment deleted" }); fetchDashboard(token!); }
          else { toast({ title: "Failed to delete payment", variant: "destructive" }); }
        } catch { toast({ title: "Network error", variant: "destructive" }); }
        setConfirmAction(null);
      },
    });
  };

  // Phase 5: opens reject dialog instead of immediately rejecting
  const handlePaymentAction = async (id: number, action: "approve" | "reject") => {
    if (action === "reject") {
      setRejectDialog({ paymentId: id, reason: "" });
      return;
    }
    try {
      const res = await fetch(`${BASE}api/admin/payments/${id}/${action}`, { method: "POST", headers: adminHeaders(token!) });
      if (res.ok) { toast({ title: "Payment approved" }); fetchDashboard(token!); }
    } catch {}
  };

  const handleRejectConfirm = async () => {
    if (!rejectDialog) return;
    setRejectPending(true);
    try {
      const res = await fetch(`${BASE}api/admin/payments/${rejectDialog.paymentId}/reject`, {
        method: "POST",
        headers: adminJsonHeaders(token!),
        body: JSON.stringify({ reason: rejectDialog.reason.trim() }),
      });
      if (res.ok) { toast({ title: "Payment rejected" }); fetchDashboard(token!); }
    } catch {} finally {
      setRejectPending(false);
      setRejectDialog(null);
    }
  };

  // BUG-03 FIX: id is now number | string
  const handleUpgrade = async (id: number | string) => {
    try {
      const res = await fetch(`${BASE}api/admin/users/${String(id)}/upgrade`, {
        method: "POST",
        headers: adminJsonHeaders(token!),
        body: JSON.stringify({ plan: "monthly" }),
      });
      if (res.ok) { toast({ title: "User upgraded to Premium" }); fetchDashboard(token!); }
    } catch {}
  };

  const handleRevoke = (id: number | string) => {
    const label = users.find((u) => u.id === id)?.email || users.find((u) => u.id === id)?.displayName || `User #${id}`;
    setConfirmAction({
      label: `Revoke Premium for ${label}? Their access will end immediately.`,
      onConfirm: async () => {
        try {
          const res = await fetch(`${BASE}api/admin/users/${String(id)}/revoke`, { method: "POST", headers: adminHeaders(token!) });
          if (res.ok) { toast({ title: "Premium revoked" }); fetchDashboard(token!); }
        } catch {}
      },
    });
  };

  // Phase 6: open message dialog
  const handleOpenMessage = (id: number | string, displayName: string | null, email: string | null) => {
    const userName = displayName || email || `User #${id}`;
    setMessageDialog({ userId: id, userName, text: "" });
  };

  const handleSendMessage = async () => {
    if (!messageDialog || !messageDialog.text.trim()) return;
    setMessagePending(true);
    try {
      const res = await fetch(`${BASE}api/admin/users/${String(messageDialog.userId)}/message`, {
        method: "POST",
        headers: adminJsonHeaders(token!),
        body: JSON.stringify({ text: messageDialog.text.trim(), fromAdmin: "Admin" }),
      });
      if (res.ok) {
        toast({ title: `Message sent to ${messageDialog.userName}` });
        setMessageDialog(null);
      } else {
        toast({ title: "Failed to send message", variant: "destructive" });
      }
    } catch {
      toast({ title: "Network error", variant: "destructive" });
    } finally {
      setMessagePending(false);
    }
  };

  const handleClearErrors = () => {
    setConfirmAction({
      label: "Clear all error log entries? This cannot be undone.",
      onConfirm: async () => {
        try {
          const res = await fetch(`${BASE}api/admin/errors`, { method: "DELETE", headers: adminHeaders(token!) });
          if (res.ok) { setErrorLog([]); toast({ title: "Error log cleared" }); }
        } catch {}
      },
    });
  };

  const handleToggleFlag = async (key: string, current: boolean) => {
    try {
      const res = await fetch(`${BASE}api/admin/flags/${key}`, {
        method: "PUT",
        headers: adminJsonHeaders(token!),
        body: JSON.stringify({ enabled: !current }),
      });
      if (res.ok) {
        setFlags((prev) => ({ ...prev, [key]: !current }));
        toast({ title: `${FLAG_LABELS[key] ?? key} ${!current ? "enabled" : "disabled"}` });
      }
    } catch {}
  };

  const handleSetAnnouncement = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newAnnText.trim()) return;
    try {
      const res = await fetch(`${BASE}api/admin/announcement`, {
        method: "POST",
        headers: adminJsonHeaders(token!),
        body: JSON.stringify({ text: newAnnText.trim(), type: newAnnType }),
      });
      if (res.ok) {
        const a = await res.json();
        setAnnouncement(a);
        setNewAnnText("");
        toast({ title: "Announcement published" });
      }
    } catch {}
  };

  const handleClearAnnouncement = async () => {
    try {
      const res = await fetch(`${BASE}api/admin/announcement`, { method: "DELETE", headers: adminHeaders(token!) });
      if (res.ok) { setAnnouncement(null); toast({ title: "Announcement cleared" }); }
    } catch {}
  };

  const handleFeedbackStatus = async (id: number, status: string) => {
    try {
      const res = await fetch(`${BASE}api/admin/feedback/${id}/status`, {
        method: "PUT",
        headers: adminJsonHeaders(token!),
        body: JSON.stringify({ status }),
      });
      if (res.ok) {
        setFeedbackItems((prev) => prev.map((f) => f.id === id ? { ...f, status } : f));
      }
    } catch {}
  };

  const handleDeleteFeedback = (id: number) => {
    setConfirmAction({
      label: `Delete feedback #${id}? This cannot be undone.`,
      onConfirm: async () => {
        try {
          const res = await fetch(`${BASE}api/admin/feedback/${id}`, { method: "DELETE", headers: adminHeaders(token!) });
          if (res.ok) {
            setFeedbackItems((prev) => prev.filter((f) => f.id !== id));
            toast({ title: "Feedback deleted" });
          }
        } catch {}
      },
    });
  };

  const handleRevokeExam = (id: string) => {
    setConfirmAction({
      label: "Revoke this exam? All participants will immediately lose access.",
      onConfirm: async () => {
        try {
          const res = await fetch(`${BASE}api/admin/exams/${id}`, { method: "DELETE", headers: adminHeaders(token!) });
          if (res.ok) {
            setActiveExams((prev) => prev.filter((e) => e.id !== id));
            toast({ title: "Exam revoked" });
          }
        } catch {}
      },
    });
  };

  // Build user lookup map for payments section (show email/name instead of ID)
  const userMap = new Map(users.map((u) => [String(u.id), u]));

  const filteredPayments = paymentFilter === "all" ? payments : payments.filter((p) => p.status === paymentFilter);
  const unreadFeedback = feedbackItems.filter((f) => f.status === "unread").length;

  if (!token) {
    return (
      <div className="h-full flex items-center justify-center bg-background p-4 overflow-y-auto">
        <form onSubmit={handleLogin} className="w-full max-w-sm space-y-4 p-8 bg-card rounded-2xl border border-border shadow-2xl relative overflow-hidden">
          <div className="absolute top-0 left-0 w-full h-1 bg-primary" />
          <div className="space-y-2 text-center mb-8">
            <h1 className="text-2xl font-bold">Admin Access</h1>
            <p className="text-sm text-muted-foreground">Authorized personnel only</p>
          </div>
          <div className="space-y-3">
            <Input type="email" placeholder="Admin Email (if required)" value={email} onChange={(e) => setEmail(e.target.value)} className="bg-background h-12" autoComplete="email" />
            <Input type="text" placeholder="Admin Secret Key" value={secretKey} onChange={(e) => setSecretKey(e.target.value)} className="bg-background h-12 font-mono text-sm" autoComplete="off" />
            <Input type="password" placeholder="Admin Password" value={password} onChange={(e) => setPassword(e.target.value)} className="bg-background h-12" autoComplete="current-password" />
            <Button type="submit" className="w-full h-12" disabled={loginPending || !secretKey || !password}>
              {loginPending ? "Verifying…" : "Access Panel"}
            </Button>
          </div>
        </form>
      </div>
    );
  }

  const NAV: { id: Section; label: string; icon: React.ReactNode; badge?: number }[] = [
    { id: "overview", label: "Overview", icon: <Activity className="w-4 h-4" /> },
    { id: "control", label: "Control", icon: <ToggleRight className="w-4 h-4" /> },
    { id: "payments", label: "Payments", icon: <CreditCard className="w-4 h-4" />, badge: payments.filter((p) => p.status === "pending").length || undefined },
    { id: "users", label: "Users", icon: <Users className="w-4 h-4" /> },
    { id: "exams", label: "Exams", icon: <FileText className="w-4 h-4" />, badge: activeExams.length || undefined },
    { id: "feedback", label: "Feedback", icon: <MessageSquare className="w-4 h-4" />, badge: unreadFeedback || undefined },
    { id: "errors", label: "Errors", icon: <AlertTriangle className="w-4 h-4" />, badge: errorLog.length || undefined },
  ];

  return (
    <div className="h-full bg-background text-foreground overflow-y-auto">
      {/* Header */}
      <header className="border-b border-border px-4 sm:px-6 py-4 flex items-center justify-between">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold">Admin Dashboard</h1>
          <p className="text-muted-foreground text-xs mt-0.5">AI Study System Control Panel</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => { if (token) { fetchDashboard(token); fetchFlags(token); fetchFeedback(token); fetchErrors(token); } }}>
            <RefreshCw className="w-4 h-4 mr-1.5" />
            Refresh
          </Button>
          <Button variant="outline" size="sm" onClick={() => setToken(null)}>Sign Out</Button>
        </div>
      </header>

      {/* Tab nav */}
      <nav className="border-b border-border px-4 sm:px-6 flex gap-1 overflow-x-auto">
        {NAV.map(({ id, label, icon, badge }) => (
          <button
            key={id}
            onClick={() => setActiveSection(id)}
            className={`flex items-center gap-1.5 px-3 py-3 text-sm font-medium whitespace-nowrap border-b-2 transition-colors relative ${
              activeSection === id
                ? "border-primary text-primary"
                : "border-transparent text-muted-foreground hover:text-foreground"
            }`}
          >
            {icon}
            {label}
            {badge ? (
              <span className="ml-1 bg-primary text-primary-foreground text-xs rounded-full w-4 h-4 flex items-center justify-center leading-none">{badge}</span>
            ) : null}
          </button>
        ))}
      </nav>

      <div className="max-w-6xl mx-auto p-4 sm:p-6 space-y-6">

        {/* ── OVERVIEW ──────────────────────────────────────────────── */}
        {activeSection === "overview" && (
          <>
            {summary && (
              <div className="grid gap-3 grid-cols-2 sm:grid-cols-4">
                {[
                  { label: "Total Users", value: summary.totalUsers, icon: Users },
                  { label: "Premium", value: summary.premiumUsers, icon: CreditCard },
                  { label: "Pending", value: summary.pendingPayments, icon: CreditCard },
                  { label: "Approved", value: summary.approvedPayments, icon: Check },
                ].map(({ label, value, icon: Icon }) => (
                  <div key={label} className="p-4 bg-card rounded-xl border border-border shadow-sm">
                    <div className="flex items-center gap-2 text-xs uppercase tracking-wider text-muted-foreground mb-1">
                      <Icon className="w-3.5 h-3.5" />{label}
                    </div>
                    <div className="text-2xl font-bold">{value}</div>
                  </div>
                ))}
              </div>
            )}

            <div className="p-5 bg-card rounded-xl border border-border shadow-sm">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-lg font-semibold flex items-center gap-2">
                  <Activity className="w-5 h-5 text-primary" />AI Provider Status
                </h2>
                <Button size="sm" variant="ghost" onClick={() => token && fetchAiStatus(token, true)} disabled={aiLoading}>
                  <RefreshCw className={`w-4 h-4 mr-1.5 ${aiLoading ? "animate-spin" : ""}`} />
                  Refresh
                </Button>
              </div>
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                {aiStatus ? (
                  (["openrouter", "openai", "deepseek", "gemini"] as const).map((key) => {
                    const p = aiStatus[key];
                    if (!p) return null;
                    const color = p.status === "Active" ? "text-emerald-500 bg-emerald-500/10 border-emerald-500/20"
                      : p.status === "Rate Limited" ? "text-orange-400 bg-orange-400/10 border-orange-400/20"
                      : p.status === "Out of Credits" ? "text-yellow-500 bg-yellow-500/10 border-yellow-500/20"
                      : p.status === "Invalid Key" ? "text-orange-500 bg-orange-500/10 border-orange-500/20"
                      : p.status === "Not Configured" ? "text-muted-foreground bg-muted border-border"
                      : "text-red-500 bg-red-500/10 border-red-500/20";
                    return (
                      <div key={key} className={`p-4 rounded-lg border ${color}`}>
                        <div className="flex items-center justify-between mb-1">
                          <span className="font-semibold capitalize text-sm">{key}</span>
                          <span className="text-xs opacity-70">{p.role}</span>
                        </div>
                        <div className="text-sm font-medium">{p.status}</div>
                        {p.latency !== null && <div className="text-xs opacity-60 mt-0.5">{p.latency}ms</div>}
                      </div>
                    );
                  })
                ) : (
                  <div className="col-span-4 text-center text-muted-foreground text-sm py-4">
                    {aiLoading ? "Checking providers…" : "Click Refresh to check status"}
                  </div>
                )}
              </div>
              {aiStatus && (
                <div className="flex items-center justify-between mt-3">
                  <p className="text-xs text-muted-foreground">Last checked: {new Date(aiStatus.checkedAt).toLocaleTimeString()}</p>
                  {aiStatus.cache && (
                    <p className="text-xs text-muted-foreground">Response cache: {aiStatus.cache.size}/{aiStatus.cache.max} entries</p>
                  )}
                </div>
              )}
            </div>
          </>
        )}

        {/* ── CONTROL ───────────────────────────────────────────────── */}
        {activeSection === "control" && (
          <>
            <div className="p-5 bg-card rounded-xl border border-border shadow-sm">
              <h2 className="text-lg font-semibold flex items-center gap-2 mb-4">
                <ToggleRight className="w-5 h-5 text-primary" />Feature Flags
              </h2>
              <div className="space-y-3">
                {Object.entries(FLAG_LABELS).map(([key, label]) => {
                  const enabled = flags[key] !== false;
                  return (
                    <div key={key} className="flex items-center justify-between p-3 bg-background rounded-lg border border-border">
                      <div>
                        <div className="text-sm font-medium">{label}</div>
                        <div className="text-xs text-muted-foreground">{key}</div>
                      </div>
                      <button
                        onClick={() => handleToggleFlag(key, enabled)}
                        className={`flex items-center gap-2 text-sm font-medium transition-colors ${enabled ? "text-emerald-500" : "text-red-500"}`}
                      >
                        {enabled
                          ? <><ToggleRight className="w-6 h-6" /><span>Enabled</span></>
                          : <><ToggleLeft className="w-6 h-6" /><span>Disabled</span></>
                        }
                      </button>
                    </div>
                  );
                })}
              </div>
            </div>

            <div className="p-5 bg-card rounded-xl border border-border shadow-sm">
              <h2 className="text-lg font-semibold flex items-center gap-2 mb-4">
                <Megaphone className="w-5 h-5 text-primary" />Global Announcement
              </h2>
              {announcement ? (
                <div className={`p-4 rounded-lg border mb-4 text-sm ${
                  announcement.type === "error" ? "bg-red-500/10 border-red-500/30 text-red-300"
                  : announcement.type === "warning" ? "bg-yellow-500/10 border-yellow-500/30 text-yellow-300"
                  : "bg-blue-500/10 border-blue-500/30 text-blue-300"
                }`}>
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <span className="text-xs uppercase font-semibold opacity-70 block mb-1">{announcement.type}</span>
                      <p>{announcement.text}</p>
                    </div>
                    <Button size="sm" variant="ghost" className="h-7 px-2 shrink-0" onClick={handleClearAnnouncement}>
                      <X className="w-3.5 h-3.5" />
                    </Button>
                  </div>
                </div>
              ) : (
                <p className="text-sm text-muted-foreground mb-4">No active announcement.</p>
              )}
              <form onSubmit={handleSetAnnouncement} className="space-y-3">
                <textarea
                  value={newAnnText}
                  onChange={(e) => setNewAnnText(e.target.value)}
                  placeholder="Announcement text…"
                  rows={2}
                  className="w-full bg-background border border-border rounded-lg px-3 py-2 text-sm resize-none focus:outline-none focus:ring-1 focus:ring-primary"
                />
                <div className="flex items-center gap-2">
                  <select
                    value={newAnnType}
                    onChange={(e) => setNewAnnType(e.target.value as "info" | "warning" | "error")}
                    className="bg-background border border-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-primary"
                  >
                    <option value="info">Info</option>
                    <option value="warning">Warning</option>
                    <option value="error">Error</option>
                  </select>
                  <Button type="submit" size="sm" disabled={!newAnnText.trim()}>
                    {announcement ? "Update" : "Publish"}
                  </Button>
                  {announcement && (
                    <Button type="button" size="sm" variant="outline" onClick={handleClearAnnouncement}>
                      Clear
                    </Button>
                  )}
                </div>
              </form>
            </div>
          </>
        )}

        {/* ── PAYMENTS ──────────────────────────────────────────────── */}
        {activeSection === "payments" && (
          <div className="p-5 bg-card rounded-xl border border-border shadow-sm">
            <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
              <h2 className="text-lg font-semibold flex items-center gap-2">
                <CreditCard className="w-5 h-5 text-primary" />Payments
              </h2>
              <div className="flex gap-1">
                {(["all", "pending", "approved", "rejected"] as const).map((f) => (
                  <button
                    key={f}
                    onClick={() => setPaymentFilter(f)}
                    className={`px-3 py-1 rounded-full text-xs font-medium transition-colors border ${
                      paymentFilter === f ? "bg-primary text-primary-foreground border-primary" : "text-muted-foreground border-border hover:border-primary/40"
                    }`}
                  >
                    {f.charAt(0).toUpperCase() + f.slice(1)}
                    {f === "all" && ` (${payments.length})`}
                    {f !== "all" && ` (${payments.filter((p) => p.status === f).length})`}
                  </button>
                ))}
              </div>
            </div>
            {filteredPayments.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground text-sm">
                No {paymentFilter === "all" ? "" : paymentFilter + " "}payments found
              </div>
            ) : (
              <div className="space-y-3">
                {filteredPayments.map((pay) => {
                  const payUser = userMap.get(String(pay.userId));
                  const userLabel = payUser
                    ? (payUser.displayName || payUser.email || `User #${pay.userId}`)
                    : `User #${pay.userId}`;
                  return (
                    <div key={pay.id} className="flex flex-col sm:flex-row sm:items-start justify-between gap-3 p-4 bg-background rounded-lg border border-border">
                      <div className="space-y-1 min-w-0 flex-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-medium text-sm">{userLabel}</span>
                          <StatusBadge status={pay.status} />
                          <span className="text-xs text-muted-foreground bg-muted px-2 py-0.5 rounded-full capitalize">{pay.plan}</span>
                        </div>
                        {payUser?.email && payUser?.displayName && (
                          <div className="text-xs text-muted-foreground">{payUser.email}</div>
                        )}
                        <div className="text-xs text-muted-foreground font-mono truncate">{pay.transactionId}</div>
                        <div className="text-xs text-muted-foreground">{new Date(pay.createdAt).toLocaleString()}</div>
                        {pay.status === "rejected" && pay.rejectionReason && (
                          <div className="text-xs text-red-400 bg-red-500/8 border border-red-500/20 rounded px-2 py-1 mt-1">
                            Reason: {pay.rejectionReason}
                          </div>
                        )}
                      </div>
                      <div className="flex items-center gap-2 shrink-0 flex-wrap">
                        {pay.hasScreenshot && (
                          <Button size="sm" variant="outline" className="h-8 gap-1.5 text-xs" onClick={() => viewScreenshot(pay.id)}>
                            <Image className="w-3.5 h-3.5" />Receipt
                          </Button>
                        )}
                        {pay.status === "pending" && (
                          <>
                            <Button size="sm" variant="outline" className="h-8 gap-1.5 text-xs text-emerald-600 border-emerald-500/30 hover:bg-emerald-500/10" onClick={() => handlePaymentAction(pay.id, "approve")}>
                              <Check className="w-3.5 h-3.5" />Approve
                            </Button>
                            <Button size="sm" variant="outline" className="h-8 gap-1.5 text-xs text-red-600 border-red-500/30 hover:bg-red-500/10" onClick={() => handlePaymentAction(pay.id, "reject")}>
                              <X className="w-3.5 h-3.5" />Reject
                            </Button>
                          </>
                        )}
                        <Button size="sm" variant="ghost" className="h-8 gap-1 text-xs text-muted-foreground hover:text-red-500 hover:bg-red-500/10" onClick={() => handleDeletePayment(pay.id)}>
                          <Trash2 className="w-3.5 h-3.5" />Delete
                        </Button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* ── USERS ─────────────────────────────────────────────────── */}
        {activeSection === "users" && (
          <div className="p-5 bg-card rounded-xl border border-border shadow-sm">
            <h2 className="text-lg font-semibold flex items-center gap-2 mb-4">
              <Users className="w-5 h-5 text-primary" />Users ({users.length})
            </h2>
            <div className="space-y-3">
              {users.map((u) => (
                <div key={String(u.id)} className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-4 bg-background rounded-lg border border-border">
                  <div className="space-y-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-medium text-sm">{u.displayName || u.email || `User #${u.id}`}</span>
                      {u.isPremium ? (
                        <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-primary/15 text-primary border border-primary/30">✦ Premium</span>
                      ) : (
                        <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-muted text-muted-foreground border border-border">Free</span>
                      )}
                    </div>
                    {u.email && u.displayName && (
                      <div className="text-xs text-muted-foreground">{u.email}</div>
                    )}
                    <div className="flex gap-3 text-xs text-muted-foreground flex-wrap">
                      <span>ID #{u.id}</span>
                      <span>💬 {u.messagesUsedToday} msgs</span>
                      <span>📝 {u.quizzesUsedToday} quizzes</span>
                      <span>🔥 {u.currentStreak} streak</span>
                      <span>🏆 Best: {u.bestScore}%</span>
                    </div>
                    {u.premiumUntil && (
                      <div className="text-xs text-muted-foreground">Premium until: {new Date(u.premiumUntil).toLocaleDateString()}</div>
                    )}
                  </div>
                  <div className="flex items-center gap-2 shrink-0 flex-wrap">
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-8 gap-1.5 text-xs"
                      onClick={() => handleOpenMessage(u.id, u.displayName, u.email)}
                      title="Send message to user"
                    >
                      <Send className="w-3.5 h-3.5" />Message
                    </Button>
                    {!u.isPremium ? (
                      <Button size="sm" variant="outline" className="h-8 gap-1.5 text-xs" onClick={() => handleUpgrade(u.id)}>
                        <ArrowUp className="w-3.5 h-3.5" />Upgrade
                      </Button>
                    ) : (
                      <Button size="sm" variant="outline" className="h-8 gap-1.5 text-xs text-red-600 border-red-500/30 hover:bg-red-500/10" onClick={() => handleRevoke(u.id)}>
                        <X className="w-3.5 h-3.5" />Revoke
                      </Button>
                    )}
                  </div>
                </div>
              ))}
              {users.length === 0 && <div className="text-center py-8 text-muted-foreground text-sm">No users yet</div>}
            </div>
          </div>
        )}

        {/* ── FEEDBACK ──────────────────────────────────────────────── */}
        {activeSection === "feedback" && (
          <div className="p-5 bg-card rounded-xl border border-border shadow-sm">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold flex items-center gap-2">
                <MessageSquare className="w-5 h-5 text-primary" />
                Feedback Inbox
                {unreadFeedback > 0 && <span className="bg-primary text-primary-foreground text-xs px-2 py-0.5 rounded-full">{unreadFeedback} unread</span>}
              </h2>
              <Button size="sm" variant="ghost" onClick={() => token && fetchFeedback(token)}>
                <RefreshCw className="w-4 h-4" />
              </Button>
            </div>
            {feedbackItems.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground text-sm">No feedback yet</div>
            ) : (
              <div className="space-y-3">
                {feedbackItems.map((item) => (
                  <div key={item.id} className="p-4 bg-background rounded-lg border border-border space-y-2">
                    <div className="flex items-center justify-between gap-2 flex-wrap">
                      <div className="flex items-center gap-2">
                        <StatusBadge status={item.status} />
                        <span className="text-xs bg-muted px-2 py-0.5 rounded-full capitalize">{item.category}</span>
                        <span className="text-xs text-muted-foreground">User #{item.userId ?? "?"}</span>
                      </div>
                      <span className="text-xs text-muted-foreground">{new Date(item.createdAt).toLocaleString()}</span>
                    </div>
                    <p className="text-sm leading-relaxed">{item.message}</p>
                    <div className="flex items-center justify-between gap-2 flex-wrap">
                      <div className="flex gap-1.5">
                        {(["unread", "investigating", "resolved"] as const).map((s) => (
                          <button
                            key={s}
                            disabled={item.status === s}
                            onClick={() => handleFeedbackStatus(item.id, s)}
                            className={`text-xs px-2.5 py-1 rounded-full border transition-colors ${
                              item.status === s
                                ? "bg-primary/10 border-primary/30 text-primary"
                                : "border-border text-muted-foreground hover:border-primary/40"
                            }`}
                          >
                            {s.charAt(0).toUpperCase() + s.slice(1)}
                          </button>
                        ))}
                      </div>
                      <button
                        onClick={() => handleDeleteFeedback(item.id)}
                        className="text-xs px-2.5 py-1 rounded-full border border-red-500/30 text-red-500 hover:bg-red-500/10 transition-colors"
                      >
                        Delete
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* ── EXAMS ─────────────────────────────────────────────────── */}
        {activeSection === "exams" && (
          <div className="p-5 bg-card rounded-xl border border-border shadow-sm">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold flex items-center gap-2">
                <FileText className="w-5 h-5 text-primary" />Active Exams
                <span className="text-sm font-normal text-muted-foreground">({activeExams.length} live)</span>
              </h2>
              <Button size="sm" variant="ghost" onClick={() => token && fetchExams(token)}>
                <RefreshCw className="w-4 h-4" />
              </Button>
            </div>
            {activeExams.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground text-sm">No active exams in memory</div>
            ) : (
              <div className="space-y-3">
                {activeExams.map((exam) => (
                  <div key={exam.id} className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-4 bg-background rounded-lg border border-border">
                    <div className="space-y-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-medium text-sm truncate">{exam.subject}</span>
                        <span className="text-xs bg-muted px-2 py-0.5 rounded-full capitalize">{exam.difficulty}</span>
                      </div>
                      <div className="flex gap-3 text-xs text-muted-foreground flex-wrap">
                        <span>{exam.questionCount} questions</span>
                        <span>{exam.attempts}{exam.maxAttempts > 0 ? `/${exam.maxAttempts}` : ""} attempt{exam.attempts !== 1 ? "s" : ""}</span>
                        {exam.expiresAt && <span>Expires {new Date(exam.expiresAt).toLocaleString()}</span>}
                        {!exam.expiresAt && <span>No expiry</span>}
                      </div>
                      <div className="text-xs text-muted-foreground font-mono truncate opacity-60">{exam.id}</div>
                    </div>
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-8 gap-1.5 text-xs text-red-600 border-red-500/30 hover:bg-red-500/10 shrink-0"
                      onClick={() => handleRevokeExam(exam.id)}
                    >
                      <X className="w-3.5 h-3.5" />Revoke
                    </Button>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* ── ERROR LOG ─────────────────────────────────────────────── */}
        {activeSection === "errors" && (
          <div className="p-5 bg-card rounded-xl border border-border shadow-sm">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold flex items-center gap-2">
                <ShieldAlert className="w-5 h-5 text-primary" />Error Log
                <span className="text-sm font-normal text-muted-foreground">(last {errorLog.length} entries)</span>
              </h2>
              <div className="flex items-center gap-2">
                <Button size="sm" variant="ghost" onClick={() => token && fetchErrors(token)}>
                  <RefreshCw className="w-4 h-4" />
                </Button>
                {errorLog.length > 0 && (
                  <Button size="sm" variant="outline" className="h-8 text-xs text-red-600 border-red-500/30 hover:bg-red-500/10" onClick={handleClearErrors}>
                    Clear
                  </Button>
                )}
              </div>
            </div>
            {errorLog.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground text-sm">No errors logged — system is healthy ✓</div>
            ) : (
              <div className="space-y-2">
                {errorLog.map((entry, i) => (
                  <div key={i} className="flex flex-col sm:flex-row sm:items-center gap-2 p-3 bg-background rounded-lg border border-border text-xs">
                    <div className="flex items-center gap-2 shrink-0">
                      <span className="text-muted-foreground font-mono">{new Date(entry.ts).toLocaleTimeString()}</span>
                      <span className="bg-red-500/10 text-red-400 border border-red-500/20 px-2 py-0.5 rounded-full">{entry.provider}</span>
                      <span className="bg-muted text-muted-foreground px-2 py-0.5 rounded-full">{entry.stage}</span>
                    </div>
                    <span className="text-muted-foreground truncate">{entry.message}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

      </div>

      {/* Screenshot modal */}
      {screenshotUrl && (
        <div className="fixed inset-0 bg-background/90 backdrop-blur-sm z-50 flex items-center justify-center p-4" onClick={() => setScreenshotUrl(null)}>
          <div className="relative max-w-2xl w-full" onClick={(e) => e.stopPropagation()}>
            <Button className="absolute -top-10 right-0" variant="outline" size="sm" onClick={() => setScreenshotUrl(null)}>
              <X className="w-4 h-4 mr-1" />Close
            </Button>
            <img src={screenshotUrl} alt="Payment receipt" className="w-full rounded-xl border border-border shadow-2xl" />
          </div>
        </div>
      )}

      {/* Confirmation modal */}
      {confirmAction && (
        <div className="fixed inset-0 bg-background/80 backdrop-blur-sm z-50 flex items-center justify-center p-4" onClick={() => setConfirmAction(null)}>
          <div className="bg-card border border-border rounded-2xl p-6 max-w-sm w-full shadow-2xl text-center space-y-4" onClick={(e) => e.stopPropagation()}>
            <div className="w-12 h-12 bg-destructive/10 rounded-full flex items-center justify-center mx-auto">
              <AlertTriangle className="w-6 h-6 text-destructive" />
            </div>
            <h3 className="text-lg font-bold">Confirm Action</h3>
            <p className="text-sm text-muted-foreground">{confirmAction.label}</p>
            <div className="flex gap-3">
              <Button variant="outline" className="flex-1 h-11" onClick={() => setConfirmAction(null)}>Cancel</Button>
              <Button
                variant="destructive"
                className="flex-1 h-11"
                onClick={() => { confirmAction.onConfirm(); setConfirmAction(null); }}
              >
                Confirm
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Phase 5: Reject with reason dialog */}
      {rejectDialog && (
        <div className="fixed inset-0 bg-background/80 backdrop-blur-sm z-50 flex items-center justify-center p-4" onClick={() => setRejectDialog(null)}>
          <div className="bg-card border border-border rounded-2xl p-6 max-w-sm w-full shadow-2xl space-y-4" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-lg font-bold">Reject Payment</h3>
            <p className="text-sm text-muted-foreground">Provide a reason so the user understands why their payment was rejected.</p>
            <textarea
              value={rejectDialog.reason}
              onChange={(e) => setRejectDialog((d) => d ? { ...d, reason: e.target.value } : d)}
              placeholder="e.g. Screenshot unclear, wrong amount, transaction ID not found…"
              rows={3}
              className="w-full bg-background border border-border rounded-lg px-3 py-2 text-sm resize-none focus:outline-none focus:ring-1 focus:ring-destructive"
              autoFocus
            />
            <div className="flex gap-3">
              <Button variant="outline" className="flex-1 h-11" onClick={() => setRejectDialog(null)}>Cancel</Button>
              <Button
                variant="destructive"
                className="flex-1 h-11"
                onClick={handleRejectConfirm}
                disabled={rejectPending}
              >
                {rejectPending ? "Rejecting…" : "Reject Payment"}
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Phase 6: Send message to user dialog */}
      {messageDialog && (
        <div className="fixed inset-0 bg-background/80 backdrop-blur-sm z-50 flex items-center justify-center p-4" onClick={() => setMessageDialog(null)}>
          <div className="bg-card border border-border rounded-2xl p-6 max-w-sm w-full shadow-2xl space-y-4" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-lg font-bold flex items-center gap-2">
              <Send className="w-5 h-5 text-primary" />
              Message {messageDialog.userName}
            </h3>
            <p className="text-xs text-muted-foreground">This message will appear the next time the user visits the app.</p>
            <textarea
              value={messageDialog.text}
              onChange={(e) => setMessageDialog((d) => d ? { ...d, text: e.target.value } : d)}
              placeholder="Type your message to this user…"
              rows={4}
              className="w-full bg-background border border-border rounded-lg px-3 py-2 text-sm resize-none focus:outline-none focus:ring-1 focus:ring-primary"
              autoFocus
              maxLength={1000}
            />
            <div className="flex items-center justify-between">
              <span className="text-xs text-muted-foreground">{messageDialog.text.length}/1000</span>
            </div>
            <div className="flex gap-3">
              <Button variant="outline" className="flex-1 h-11" onClick={() => setMessageDialog(null)}>Cancel</Button>
              <Button
                className="flex-1 h-11"
                onClick={handleSendMessage}
                disabled={messagePending || !messageDialog.text.trim()}
              >
                {messagePending ? "Sending…" : "Send Message"}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
