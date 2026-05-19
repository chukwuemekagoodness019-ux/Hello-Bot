import { useState, useEffect, useRef } from "react";
import { useLocation } from "wouter";
import {
  ChevronLeft, Clock, Trophy, CheckCircle, XCircle, FileText,
  MessageSquare, GraduationCap, Lock, Copy, Share2, Link2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { useGetMe } from "@workspace/api-client-react";
import { PaymentModal } from "@/components/payment-modal";
import { usePaymentModal } from "@/hooks/use-payment-modal";
import { useToast } from "@/hooks/use-toast";
import { useFeatureFlags } from "@/hooks/use-feature-flags";

const BASE = import.meta.env.BASE_URL as string;

type QuizQuestion = { id: string; prompt: string; type: "objective" | "theory" | "fill"; options?: string[]; };
type QuizResult = {
  quizId: string; score: number; total: number; percent: number;
  results: Array<{ questionId: string; prompt: string; userAnswer: string; correctAnswer: string; isCorrect: boolean; explanation: string; }>;
  streak?: { currentStreak: number; bestStreak: number; bestScore: number };
};
type Quiz = { quizId: string; examId?: string; accessKey?: string; subject: string; difficulty: "easy" | "medium" | "hard"; questionType: "objective" | "theory" | "fill"; timeMinutes: number; questions: QuizQuestion[]; };
type ExamState = "form" | "share" | "running" | "submitted" | "results";

const EXAM_RESULTS_KEY = "hi_there_exam_history";

function saveExamResult(result: { subject: string; score: number; total: number; percent: number; date: string; }) {
  try {
    const existing = JSON.parse(localStorage.getItem(EXAM_RESULTS_KEY) || "[]");
    existing.unshift(result);
    localStorage.setItem(EXAM_RESULTS_KEY, JSON.stringify(existing.slice(0, 20)));
  } catch {}
}

export default function ExamPage() {
  const [state, setState] = useState<ExamState>("form");
  const { toast } = useToast();
  const paymentModal = usePaymentModal();
  const { data: user, refetch: refetchMe } = useGetMe();
  const [, setLocation] = useLocation();
  const { flags } = useFeatureFlags();

  const [subject, setSubject] = useState("");
  const [difficulty, setDifficulty] = useState<"easy" | "medium" | "hard">("medium");
  const [questionType, setQuestionType] = useState<"objective" | "theory" | "fill">("objective");
  const [numQuestions, setNumQuestions] = useState("20");
  const [enableTimer, setEnableTimer] = useState(true);
  const [timeLimitMins, setTimeLimitMins] = useState("30");
  const [showAnswers, setShowAnswers] = useState(true);

  const [joinMode, setJoinMode] = useState(false);
  const [joinCode, setJoinCode] = useState("");
  const [joinKey, setJoinKey] = useState("");

  const [examShareCode, setExamShareCode] = useState("");
  const [examShareLink, setExamShareLink] = useState("");

  const [isGenerating, setIsGenerating] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isJoining, setIsJoining] = useState(false);

  const [activeQuiz, setActiveQuiz] = useState<Quiz | null>(null);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const answersRef = useRef<Record<string, string>>({});
  const [quizResult, setQuizResult] = useState<QuizResult | null>(null);
  const [timeLeft, setTimeLeft] = useState(0);
  const [hasSubmitted, setHasSubmitted] = useState(false);
  const [tabViolations, setTabViolations] = useState(0);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const timerWarningsRef = useRef<Set<number>>(new Set());

  const [examInstructions, setExamInstructions] = useState("");
  const [expiresIn, setExpiresIn] = useState("24");
  const [maxAttempts, setMaxAttempts] = useState("0");
  const [showSubmitConfirm, setShowSubmitConfirm] = useState(false);

  const autoJoinAttemptedRef = useRef(false);
  const [autoJoining, setAutoJoining] = useState(() => {
    const params = new URLSearchParams(window.location.search);
    return !!(params.get("code"));
  });

  useEffect(() => () => { if (timerRef.current) clearInterval(timerRef.current); }, []);

  // Anti-cheat: 3 violations before auto-submit
  useEffect(() => {
    if (state !== "running") return;
    const handleVisibilityChange = () => {
      if (document.hidden) {
        setTabViolations((v) => {
          const next = v + 1;
          if (next === 1) {
            toast({ title: "⚠️ Warning: Tab switch detected", description: "Two more violations and your exam will be auto-submitted.", variant: "destructive" });
          } else if (next === 2) {
            toast({ title: "⚠️ Second warning: Stay on this tab!", description: "One more violation and your exam will be auto-submitted.", variant: "destructive" });
          } else if (next >= 3) {
            toast({ title: "🚨 Exam auto-submitted — cheating detected." });
            doSubmit();
          }
          return next;
        });
      }
    };
    document.addEventListener("visibilitychange", handleVisibilityChange);
    return () => document.removeEventListener("visibilitychange", handleVisibilityChange);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state]);

  useEffect(() => {
    if (autoJoinAttemptedRef.current) return;
    autoJoinAttemptedRef.current = true;
    const params = new URLSearchParams(window.location.search);
    const code = params.get("code");
    const key = params.get("key") || "";
    if (code) handleJoinExam(code, key);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const startTimer = (totalSecs: number) => {
    timerWarningsRef.current.clear();
    setTimeLeft(totalSecs);
    timerRef.current = setInterval(() => {
      setTimeLeft((prev) => {
        if (prev === 120 && !timerWarningsRef.current.has(120)) { timerWarningsRef.current.add(120); toast({ title: "⏰ 2 minutes remaining!", variant: "destructive" }); }
        else if (prev === 60 && !timerWarningsRef.current.has(60)) { timerWarningsRef.current.add(60); toast({ title: "⚠️ Last minute! Submit your exam now.", variant: "destructive" }); }
        if (prev <= 1) { if (timerRef.current) clearInterval(timerRef.current); timerRef.current = null; handleAutoSubmit(); return 0; }
        return prev - 1;
      });
    }, 1000);
  };

  const formatTime = (seconds: number) => {
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = seconds % 60;
    if (h > 0) return `${h}:${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
    return `${m}:${s.toString().padStart(2, "0")}`;
  };

  const handleGenerate = async (e?: React.FormEvent) => {
    e?.preventDefault();
    if (!subject.trim()) { toast({ title: "Subject required", variant: "destructive" }); return; }
    const n = parseInt(numQuestions, 10);
    if (isNaN(n) || n < 10 || n > 50) { toast({ title: "Questions must be between 10 and 50", variant: "destructive" }); return; }

    setIsGenerating(true);
    try {
      const res = await fetch(`${BASE}api/exam/generate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          subject, difficulty, questionType, numQuestions: n,
          timeMinutes: enableTimer ? parseInt(timeLimitMins, 10) : 999,
          instructions: `${examInstructions ? examInstructions + ". " : ""}This is a formal exam. Generate exactly ${n} questions.`,
          expiresInHours: parseInt(expiresIn, 10),
          maxAttempts: parseInt(maxAttempts, 10),
        }),
      });

      if (res.status === 402) {
        const data = await res.json().catch(() => ({})) as Record<string, unknown>;
        if (data.code === "PREMIUM_REQUIRED" || data.code === "LIMIT_REACHED") paymentModal.open();
        else toast({ title: String(data.error ?? "Upgrade required."), variant: "destructive" });
        return;
      }
      if (res.status === 503) { toast({ title: "Exam feature is temporarily unavailable.", variant: "destructive" }); return; }
      if (!res.ok) { const data = await res.json().catch(() => ({})) as Record<string, unknown>; toast({ title: String(data.error ?? "Failed to generate exam."), variant: "destructive" }); return; }

      const quiz = await res.json() as Quiz;
      if (!quiz.questions?.length) { toast({ title: "Exam generation returned no questions. Try again.", variant: "destructive" }); return; }

      setActiveQuiz(quiz);
      setAnswers({});
      answersRef.current = {};
      setHasSubmitted(false);
      setTabViolations(0);
      refetchMe();

      if (quiz.quizId && quiz.accessKey) {
        const origin = window.location.origin;
        const path = window.location.pathname.replace(/\/$/, "");
        const link = `${origin}${path}?code=${encodeURIComponent(quiz.quizId)}&key=${encodeURIComponent(quiz.accessKey)}`;
        setExamShareCode(quiz.quizId);
        setExamShareLink(link);
        setState("share");
      } else {
        setState("running");
        if (enableTimer) startTimer(parseInt(timeLimitMins, 10) * 60);
      }
    } catch {
      toast({ title: "Network error. Check your connection and try again.", variant: "destructive" });
    } finally {
      setIsGenerating(false);
    }
  };

  const handleJoinExam = async (code: string, key: string = "") => {
    if (!code.trim()) { toast({ title: "Exam code is required.", variant: "destructive" }); return; }
    setIsJoining(true);
    const keyParam = key.trim() ? `?key=${encodeURIComponent(key.trim())}` : "";
    try {
      const res = await fetch(`${BASE}api/exam/${encodeURIComponent(code.trim())}${keyParam}`);
      if (res.status === 404) { toast({ title: "Exam not found or expired.", variant: "destructive" }); setAutoJoining(false); return; }
      if (res.status === 403) { toast({ title: "Invalid access key.", variant: "destructive" }); setAutoJoining(false); return; }
      if (!res.ok) { const data = await res.json().catch(() => ({})) as Record<string, unknown>; toast({ title: String(data.error ?? "Failed to load exam."), variant: "destructive" }); setAutoJoining(false); return; }
      const quiz = await res.json() as Quiz;
      if (!quiz.questions?.length) { toast({ title: "Exam is empty.", variant: "destructive" }); setAutoJoining(false); return; }
      setActiveQuiz(quiz);
      setAnswers({});
      answersRef.current = {};
      setHasSubmitted(false);
      setTabViolations(0);
      setState("running");
      setAutoJoining(false);
      if (quiz.timeMinutes && quiz.timeMinutes < 999) startTimer(quiz.timeMinutes * 60);
    } catch {
      toast({ title: "Network error. Check your connection.", variant: "destructive" });
      setAutoJoining(false);
    } finally {
      setIsJoining(false);
    }
  };

  const handleAutoSubmit = () => { toast({ title: "⏰ Time's up! Submitting your exam." }); doSubmit(); };

  const doSubmit = async (quiz: Quiz | null = activeQuiz) => {
    if (!quiz || hasSubmitted) return;
    setHasSubmitted(true);
    setState("submitted");
    if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null; }
    setIsSubmitting(true);
    try {
      const res = await fetch(`${BASE}api/exam/submit`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ quizId: quiz.quizId, subject: quiz.subject, difficulty: quiz.difficulty, questionType: quiz.questionType, questions: quiz.questions, answers: Object.entries(answersRef.current).map(([questionId, answer]) => ({ questionId, answer })) }),
      });
      if (res.status === 409) { const data = await res.json().catch(() => ({})) as Record<string, unknown>; toast({ title: String(data.error ?? "Submission blocked."), variant: "destructive" }); setHasSubmitted(false); setState("running"); return; }
      if (!res.ok) { toast({ title: "Failed to submit exam.", variant: "destructive" }); setHasSubmitted(false); setState("running"); return; }
      const result = await res.json() as QuizResult;
      setQuizResult(result);
      setState("results");
      refetchMe();
      saveExamResult({ subject: quiz.subject, score: result.score, total: result.total, percent: result.percent, date: new Date().toISOString() });
    } catch {
      toast({ title: "Network error during submission.", variant: "destructive" });
      setHasSubmitted(false);
      setState("running");
    } finally {
      setIsSubmitting(false);
    }
  };

  const copyToClipboard = (text: string, label: string) => {
    navigator.clipboard.writeText(text).then(() => toast({ title: `${label} copied` })).catch(() => toast({ title: "Copy failed", variant: "destructive" }));
  };

  const answeredCount = Object.values(answers).filter((a) => a.trim() !== "").length;
  const totalQuestions = activeQuiz?.questions.length ?? 0;
  const getTimerColor = () => !enableTimer || timeLeft > 300 ? "text-primary bg-primary/10" : timeLeft > 60 ? "text-yellow-500 bg-yellow-500/10" : "text-red-500 bg-red-500/10 animate-pulse";
  const isPremium = user?.isPremium;
  const userLoaded = user !== undefined;

  const BottomNav = () => (
    <nav className="fixed bottom-0 inset-x-0 z-20 bg-background/95 backdrop-blur border-t border-border flex md:hidden h-14">
      <button className="flex-1 flex flex-col items-center justify-center gap-0.5 text-muted-foreground hover:text-foreground transition-colors" onClick={() => setLocation("/", { replace: true })}><MessageSquare className="w-5 h-5" /><span className="text-[10px] font-medium">Chat</span></button>
      <button className="flex-1 flex flex-col items-center justify-center gap-0.5 text-muted-foreground hover:text-foreground transition-colors" onClick={() => setLocation("/quiz", { replace: true })}><GraduationCap className="w-5 h-5" /><span className="text-[10px] font-medium">Quiz</span></button>
      <button className="flex-1 flex flex-col items-center justify-center gap-0.5 text-primary"><FileText className="w-5 h-5" /><span className="text-[10px] font-medium">Exam</span></button>
    </nav>
  );

  if (autoJoining) {
    return (
      <div className="min-h-[100dvh] bg-background text-foreground flex flex-col items-center justify-center gap-4">
        <div className="w-14 h-14 bg-primary/10 border border-primary/20 rounded-2xl flex items-center justify-center">
          <FileText className="w-7 h-7 text-primary animate-pulse" />
        </div>
        <p className="text-base font-medium">Loading exam…</p>
        <p className="text-sm text-muted-foreground">Please wait</p>
      </div>
    );
  }

  if (!flags.exam) {
    return (
      <div className="min-h-[100dvh] bg-background text-foreground flex flex-col pb-14 md:pb-0">
        <header className="h-14 flex items-center justify-between px-4 border-b border-border sticky top-0 bg-background/95 backdrop-blur z-30">
          <button className="inline-flex items-center gap-2 text-muted-foreground hover:text-foreground" onClick={() => setLocation("/", { replace: true })}><ChevronLeft className="w-5 h-5" /><span className="font-medium">Back</span></button>
          <div className="flex items-center gap-2"><FileText className="w-4 h-4 text-primary" /><span className="font-semibold text-sm">Exam Mode</span></div>
          <div className="w-20" />
        </header>
        <main className="flex-1 flex flex-col items-center justify-center p-6 text-center max-w-sm mx-auto">
          <div className="w-14 h-14 glass rounded-2xl flex items-center justify-center mb-4"><FileText className="w-7 h-7 text-muted-foreground" /></div>
          <h2 className="text-xl font-bold mb-2">Exam Unavailable</h2>
          <p className="text-muted-foreground text-sm">This feature is temporarily unavailable.</p>
        </main>
        <BottomNav />
      </div>
    );
  }

  if (userLoaded && !isPremium && state === "form" && !autoJoining) {
    return (
      <div className="min-h-[100dvh] bg-background text-foreground flex flex-col pb-14 md:pb-0">
        <header className="h-14 flex items-center justify-between px-4 border-b border-border sticky top-0 bg-background/95 backdrop-blur z-30">
          <button className="inline-flex items-center gap-2 text-muted-foreground hover:text-foreground" onClick={() => setLocation("/", { replace: true })}><ChevronLeft className="w-5 h-5" /><span className="font-medium">Back</span></button>
          <div className="flex items-center gap-2"><FileText className="w-4 h-4 text-primary" /><span className="font-semibold text-sm">Exam Mode</span></div>
          <div className="w-20" />
        </header>
        <main className="flex-1 flex flex-col items-center justify-center p-6 text-center max-w-sm mx-auto">
          <div className="w-16 h-16 rounded-2xl bg-primary/10 border border-primary/20 flex items-center justify-center mb-5 shadow-xl shadow-primary/10">
            <Lock className="w-8 h-8 text-primary" />
          </div>
          <h2 className="text-2xl font-bold mb-2">Premium Feature</h2>
          <p className="text-muted-foreground text-sm mb-6">Exam Mode is available for Premium users. Upgrade to unlock timed exams, full score breakdowns, and anti-cheat protection.</p>
          <div className="w-full p-4 bg-primary/5 border border-primary/20 rounded-xl mb-6 text-sm space-y-2 text-left">
            <p className="font-semibold text-primary mb-2">Premium includes:</p>
            <ul className="text-muted-foreground space-y-1 list-disc list-inside">
              <li>Unlimited messages &amp; quizzes</li>
              <li>Full Exam Mode access</li>
              <li>Extended voice input</li>
            </ul>
          </div>
          <Button className="w-full h-12 text-base" onClick={() => paymentModal.open()}>Upgrade to Premium</Button>
          <div className="mt-6 p-4 glass rounded-xl w-full text-left space-y-3">
            <p className="text-sm font-semibold">Have an exam link or code?</p>
            <p className="text-xs text-muted-foreground">Join a shared exam without a Premium account.</p>
            <div className="space-y-2">
              <Input placeholder="Exam code" value={joinCode} onChange={(e) => setJoinCode(e.target.value)} className="h-10 text-sm bg-white/5 border-white/10" />
              <Input placeholder="Access key" value={joinKey} onChange={(e) => setJoinKey(e.target.value)} className="h-10 text-sm bg-white/5 border-white/10" />
              <Button variant="outline" className="w-full border-white/10" disabled={isJoining || !joinCode.trim()} onClick={() => handleJoinExam(joinCode, joinKey)}>
                {isJoining ? "Joining…" : "Join Exam"}
              </Button>
            </div>
          </div>
          <button className="mt-4 text-sm text-muted-foreground hover:text-foreground transition-colors" onClick={() => setLocation("/quiz", { replace: true })}>Try Practice Quiz instead →</button>
        </main>
        <BottomNav />
        <PaymentModal />
      </div>
    );
  }

  return (
    <div className="min-h-[100dvh] bg-background text-foreground flex flex-col pb-14 md:pb-0">
      <header className="h-14 flex items-center justify-between px-4 border-b border-border sticky top-0 bg-background/95 backdrop-blur z-30">
        <button className="inline-flex items-center gap-2 text-muted-foreground hover:text-foreground" onClick={() => setLocation("/", { replace: true })}><ChevronLeft className="w-5 h-5" /><span className="font-medium">Back</span></button>
        <div className="flex items-center gap-2"><FileText className="w-4 h-4 text-primary" /><span className="font-semibold text-sm">Exam Mode</span></div>
        {state === "running" && enableTimer ? (
          <div className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg font-mono font-bold text-sm ${getTimerColor()}`}><Clock className="w-4 h-4" />{formatTime(timeLeft)}</div>
        ) : <div className="w-20" />}
      </header>

      <main className="flex-1 p-4 sm:p-6 max-w-2xl w-full mx-auto pb-32">
        {state === "form" && (
          <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
            <div>
              <h1 className="text-2xl font-bold mb-1 flex items-center gap-2"><span>📋</span> Exam Mode</h1>
              <p className="text-muted-foreground text-sm">A timed exam with one-shot submission. Results are saved to your history.</p>
            </div>

            <div className="p-4 bg-primary/5 border border-primary/20 rounded-xl text-sm space-y-1">
              <p className="font-semibold text-primary mb-2">How it works</p>
              <ul className="text-muted-foreground space-y-1 list-disc list-inside">
                <li>All questions load at once — scroll through them</li>
                <li>Answer as many as you can before time runs out</li>
                <li>Only one submission allowed</li>
                <li>Tab switching triggers anti-cheat warnings (3 violations = auto-submit)</li>
                <li>Full score breakdown shown at the end</li>
              </ul>
            </div>

            <div className="flex rounded-xl border border-white/10 overflow-hidden">
              <button className={`flex-1 py-2.5 text-sm font-medium transition-colors ${!joinMode ? "bg-primary text-primary-foreground" : "bg-white/5 text-muted-foreground hover:text-foreground"}`} onClick={() => setJoinMode(false)}>Create Exam</button>
              <button className={`flex-1 py-2.5 text-sm font-medium transition-colors ${joinMode ? "bg-primary text-primary-foreground" : "bg-white/5 text-muted-foreground hover:text-foreground"}`} onClick={() => setJoinMode(true)}>Join Exam</button>
            </div>

            {joinMode ? (
              <div className="space-y-4 p-6 glass rounded-xl shadow-sm">
                <div className="space-y-2">
                  <Label>Exam Code</Label>
                  <Input value={joinCode} onChange={(e) => setJoinCode(e.target.value)} placeholder="Paste the exam code" className="h-11 bg-white/5 border-white/10" />
                </div>
                <div className="space-y-2">
                  <Label>Access Key (if required)</Label>
                  <Input value={joinKey} onChange={(e) => setJoinKey(e.target.value)} placeholder="Paste the access key" className="h-11 bg-white/5 border-white/10" />
                </div>
                <Button className="w-full h-12" disabled={isJoining || !joinCode.trim()} onClick={() => handleJoinExam(joinCode, joinKey)}>
                  {isJoining ? "Joining…" : "Join Exam"}
                </Button>
              </div>
            ) : (
              <form onSubmit={handleGenerate} className="space-y-4 p-6 glass rounded-xl shadow-sm">
                <div className="space-y-2">
                  <Label>Subject / Topic</Label>
                  <Input value={subject} onChange={(e) => setSubject(e.target.value)} placeholder="e.g. WAEC Biology, Thermodynamics" required className="h-11 bg-white/5 border-white/10" />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Difficulty</Label>
                    <Select value={difficulty} onValueChange={(v) => setDifficulty(v as typeof difficulty)}>
                      <SelectTrigger className="h-11 bg-white/5 border-white/10"><SelectValue /></SelectTrigger>
                      <SelectContent><SelectItem value="easy">Easy</SelectItem><SelectItem value="medium">Medium</SelectItem><SelectItem value="hard">Hard</SelectItem></SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label>Question Type</Label>
                    <Select value={questionType} onValueChange={(v) => setQuestionType(v as typeof questionType)}>
                      <SelectTrigger className="h-11 bg-white/5 border-white/10"><SelectValue /></SelectTrigger>
                      <SelectContent><SelectItem value="objective">Multiple Choice</SelectItem><SelectItem value="theory">Theory</SelectItem><SelectItem value="fill">Fill in Blank</SelectItem></SelectContent>
                    </Select>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Questions (10–50)</Label>
                    <Input type="number" min="10" max="50" value={numQuestions} onChange={(e) => setNumQuestions(e.target.value)} required className="h-11 bg-white/5 border-white/10" />
                  </div>
                  <div className="space-y-2">
                    <Label>Time Limit (mins)</Label>
                    <Input type="number" min="5" max="180" value={timeLimitMins} onChange={(e) => setTimeLimitMins(e.target.value)} disabled={!enableTimer} className="h-11 bg-white/5 border-white/10" />
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <button type="button" onClick={() => setEnableTimer((v) => !v)} className={`w-10 h-5.5 rounded-full relative transition-colors ${enableTimer ? "bg-primary" : "bg-white/15"}`}>
                    <span className={`absolute top-0.5 w-4 h-4 bg-white rounded-full shadow-sm transition-transform ${enableTimer ? "translate-x-5" : "translate-x-0.5"}`} />
                  </button>
                  <Label className="text-sm cursor-pointer" onClick={() => setEnableTimer((v) => !v)}>Enable countdown timer</Label>
                </div>
                <div className="flex items-center gap-3">
                  <button type="button" onClick={() => setShowAnswers((v) => !v)} className={`w-10 h-5.5 rounded-full relative transition-colors ${showAnswers ? "bg-primary" : "bg-white/15"}`}>
                    <span className={`absolute top-0.5 w-4 h-4 bg-white rounded-full shadow-sm transition-transform ${showAnswers ? "translate-x-5" : "translate-x-0.5"}`} />
                  </button>
                  <Label className="text-sm cursor-pointer" onClick={() => setShowAnswers((v) => !v)}>Show correct answers after submission</Label>
                </div>
                <div className="space-y-2">
                  <Label>Special Instructions (Optional)</Label>
                  <Textarea value={examInstructions} onChange={(e) => setExamInstructions(e.target.value)} placeholder="e.g. Focus on African history…" rows={2} className="bg-white/5 border-white/10" />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Expires In (hours)</Label>
                    <Select value={expiresIn} onValueChange={setExpiresIn}>
                      <SelectTrigger className="h-11 bg-white/5 border-white/10"><SelectValue /></SelectTrigger>
                      <SelectContent><SelectItem value="1">1 hour</SelectItem><SelectItem value="6">6 hours</SelectItem><SelectItem value="24">24 hours</SelectItem><SelectItem value="48">48 hours</SelectItem><SelectItem value="168">7 days</SelectItem></SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label>Max Attempts (0 = unlimited)</Label>
                    <Input type="number" min="0" value={maxAttempts} onChange={(e) => setMaxAttempts(e.target.value)} className="h-11 bg-white/5 border-white/10" />
                  </div>
                </div>
                <Button type="submit" className="w-full h-12 text-base" disabled={isGenerating}>
                  {isGenerating ? "Generating exam…" : "Generate &amp; Share Exam"}
                </Button>
              </form>
            )}
          </div>
        )}

        {state === "share" && (
          <div className="space-y-6 animate-in zoom-in-95 duration-300">
            <div className="text-center p-8 glass rounded-2xl shadow-lg border border-primary/20">
              <div className="w-16 h-16 bg-primary/10 border border-primary/20 rounded-2xl flex items-center justify-center mx-auto mb-4 shadow-xl shadow-primary/10">
                <Share2 className="w-8 h-8 text-primary" />
              </div>
              <h2 className="text-2xl font-bold mb-2">Exam Ready to Share!</h2>
              <p className="text-muted-foreground text-sm mb-6">Share the code or link with your students. Start the exam yourself when ready.</p>
              <div className="space-y-3 text-left">
                <div className="p-4 bg-white/5 border border-white/10 rounded-xl">
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-xs text-muted-foreground uppercase tracking-wider font-semibold">Exam Code</span>
                    <button onClick={() => copyToClipboard(examShareCode, "Exam code")} className="text-xs text-primary hover:underline flex items-center gap-1"><Copy className="w-3 h-3" />Copy</button>
                  </div>
                  <p className="font-mono text-xl font-bold text-primary tracking-wider">{examShareCode}</p>
                </div>
                <div className="p-4 bg-white/5 border border-white/10 rounded-xl">
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-xs text-muted-foreground uppercase tracking-wider font-semibold">Share Link</span>
                    <button onClick={() => copyToClipboard(examShareLink, "Share link")} className="text-xs text-primary hover:underline flex items-center gap-1"><Link2 className="w-3 h-3" />Copy</button>
                  </div>
                  <p className="text-xs text-muted-foreground break-all">{examShareLink}</p>
                </div>
              </div>
              <Button className="w-full mt-6 h-12 text-base" onClick={() => { setState("running"); if (enableTimer && activeQuiz) startTimer(activeQuiz.timeMinutes * 60); }}>
                Start Exam Now
              </Button>
            </div>
          </div>
        )}

        {state === "running" && activeQuiz && (
          <div className="space-y-6 animate-in fade-in duration-300">
            {tabViolations > 0 && (
              <div className="flex items-center gap-2 p-3 bg-red-500/10 border border-red-500/30 rounded-xl text-sm text-red-400 font-medium">
                <span>⚠️ {tabViolations} violation{tabViolations > 1 ? "s" : ""} detected — {3 - tabViolations} remaining before auto-submit</span>
              </div>
            )}

            <div className="flex justify-between items-center glass p-4 rounded-xl shadow-sm">
              <div>
                <span className="text-sm font-semibold">{activeQuiz.subject}</span>
                <p className="text-xs text-muted-foreground mt-0.5">{answeredCount} of {totalQuestions} answered</p>
                <div className="w-32 h-1 bg-white/10 rounded-full mt-2 overflow-hidden">
                  <div className="h-full bg-primary rounded-full transition-all" style={{ width: `${totalQuestions > 0 ? (answeredCount / totalQuestions) * 100 : 0}%` }} />
                </div>
              </div>
              {enableTimer && (
                <div className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg font-mono font-bold text-sm ${getTimerColor()}`}>
                  <Clock className="w-4 h-4" />{formatTime(timeLeft)}
                </div>
              )}
            </div>

            <div className="space-y-6">
              {activeQuiz.questions.map((q: QuizQuestion, i: number) => (
                <div key={q.id} className="p-5 glass rounded-xl shadow-sm">
                  <div className="flex gap-3 items-start mb-4">
                    <span className="flex items-center justify-center w-7 h-7 rounded-full bg-primary/10 text-primary text-sm font-bold shrink-0">{i + 1}</span>
                    <h3 className="font-medium text-sm leading-relaxed">{q.prompt}</h3>
                  </div>
                  {q.type === "objective" && q.options ? (
                    <div className="space-y-2 pl-10">
                      {q.options.map((opt: string, j: number) => (
                        <button
                          key={j}
                          className={`w-full text-left p-3 rounded-xl border text-sm transition-all ${answers[q.id] === opt ? "bg-primary/10 border-primary/50 font-medium ring-1 ring-primary/30" : "bg-white/5 border-white/10 hover:border-primary/40"}`}
                          onClick={() => { const next = { ...answersRef.current, [q.id]: opt }; answersRef.current = next; setAnswers(next); }}
                        >
                          <span className="text-muted-foreground font-mono mr-2 text-xs">{String.fromCharCode(65 + j)}.</span>{opt}
                        </button>
                      ))}
                    </div>
                  ) : (
                    <Textarea
                      className="ml-10 min-h-[100px] text-sm bg-white/5 border-white/10"
                      placeholder="Your answer…"
                      value={answers[q.id] || ""}
                      onChange={(e) => { const next = { ...answersRef.current, [q.id]: e.target.value }; answersRef.current = next; setAnswers(next); }}
                    />
                  )}
                </div>
              ))}
            </div>

            {showSubmitConfirm ? (
              <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center p-4">
                <div className="w-full max-w-sm glass-strong rounded-2xl shadow-2xl p-6 text-center space-y-4">
                  <h2 className="text-xl font-bold">Submit Exam?</h2>
                  <p className="text-muted-foreground text-sm">{answeredCount} of {totalQuestions} answered. This cannot be undone.</p>
                  <div className="flex gap-3">
                    <Button variant="outline" className="flex-1 border-white/10" onClick={() => setShowSubmitConfirm(false)}>Cancel</Button>
                    <Button className="flex-1" disabled={isSubmitting} onClick={() => { setShowSubmitConfirm(false); doSubmit(); }}>
                      {isSubmitting ? "Submitting…" : "Submit Now"}
                    </Button>
                  </div>
                </div>
              </div>
            ) : null}

            <div className="fixed bottom-14 md:bottom-0 left-0 right-0 p-4 bg-background/95 backdrop-blur border-t border-border z-30">
              <div className="max-w-2xl mx-auto">
                <Button className="w-full h-12 text-base" onClick={() => setShowSubmitConfirm(true)} disabled={isSubmitting}>
                  Submit Exam ({answeredCount}/{totalQuestions} answered)
                </Button>
              </div>
            </div>
          </div>
        )}

        {state === "submitted" && (
          <div className="flex flex-col items-center justify-center min-h-[50vh] gap-6 text-center">
            <div className="w-16 h-16 rounded-full bg-primary/10 border border-primary/20 flex items-center justify-center animate-pulse">
              <Trophy className="w-8 h-8 text-primary" />
            </div>
            <h2 className="text-2xl font-bold">Grading your exam…</h2>
            <p className="text-muted-foreground text-sm">Please wait while we analyze your answers.</p>
          </div>
        )}

        {state === "results" && quizResult && (
          <div className="space-y-6 animate-in zoom-in-95 duration-500">
            <div className="text-center p-8 glass rounded-2xl border border-white/10 shadow-sm">
              <h2 className="text-2xl font-bold mb-2">Exam Complete</h2>
              <div className={`text-7xl font-black my-4 ${quizResult.percent >= 50 ? "text-primary" : "text-destructive"}`}>{Math.round(quizResult.percent)}%</div>
              <p className="text-muted-foreground">{quizResult.score} out of {quizResult.total} correct</p>
              {quizResult.streak && (
                <div className="flex items-center justify-center gap-4 mt-4 text-sm">
                  <span className="text-muted-foreground">Streak: <strong className="text-foreground">{quizResult.streak.currentStreak}</strong></span>
                  <span className="text-muted-foreground">Best: <strong className="text-foreground">{quizResult.streak.bestScore}%</strong></span>
                </div>
              )}
            </div>

            {showAnswers && (
              <div className="space-y-4">
                {quizResult.results.map((res, i) => (
                  <div key={i} className={`p-5 rounded-xl border shadow-sm ${res.isCorrect ? "bg-primary/5 border-primary/20" : "bg-destructive/5 border-destructive/20"}`}>
                    <div className="flex gap-2 items-start mb-3">
                      {res.isCorrect ? <CheckCircle className="w-5 h-5 text-primary shrink-0 mt-0.5" /> : <XCircle className="w-5 h-5 text-destructive shrink-0 mt-0.5" />}
                      <h4 className="font-medium text-sm">{res.prompt}</h4>
                    </div>
                    <div className="pl-7 space-y-3 text-sm">
                      <div>
                        <span className="text-muted-foreground block mb-0.5 text-xs uppercase tracking-wide">Your Answer</span>
                        <p className={res.isCorrect ? "text-primary font-medium" : "text-destructive font-medium"}>{res.userAnswer || "No answer provided"}</p>
                      </div>
                      {!res.isCorrect && (
                        <div>
                          <span className="text-muted-foreground block mb-0.5 text-xs uppercase tracking-wide">Correct Answer</span>
                          <p className="text-primary font-medium">{res.correctAnswer}</p>
                        </div>
                      )}
                      <div className="bg-white/5 p-3 rounded-lg border border-white/10">
                        <span className="text-muted-foreground block mb-1 text-xs uppercase tracking-wider font-semibold">Explanation</span>
                        <p>{res.explanation}</p>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}

            <Button className="w-full mt-6 h-12 text-base" onClick={() => { setState("form"); setActiveQuiz(null); setAnswers({}); answersRef.current = {}; setQuizResult(null); }}>
              Start New Exam
            </Button>
          </div>
        )}
      </main>

      <BottomNav />
      <PaymentModal />
    </div>
  );
}
