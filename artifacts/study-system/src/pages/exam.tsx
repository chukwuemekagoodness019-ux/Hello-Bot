import { useState, useEffect, useRef } from "react";
import { useLocation } from "wouter";
import {
  ChevronLeft, Clock, Trophy, CheckCircle, XCircle, FileText,
  MessageSquare, GraduationCap, Lock, Copy, Share2, Link2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { useGetMe } from "@workspace/api-client-react";
import { PaymentModal } from "@/components/payment-modal";
import { usePaymentModal } from "@/hooks/use-payment-modal";
import { useToast } from "@/hooks/use-toast";
import { useFeatureFlags } from "@/hooks/use-feature-flags";

const BASE = import.meta.env.BASE_URL as string;

type QuizQuestion = {
  id: string;
  prompt: string;
  type: "objective" | "theory" | "fill";
  options?: string[];
};

type QuizResult = {
  quizId: string;
  score: number;
  total: number;
  percent: number;
  results: Array<{
    questionId: string;
    prompt: string;
    userAnswer: string;
    correctAnswer: string;
    isCorrect: boolean;
    explanation: string;
  }>;
  streak?: { currentStreak: number; bestStreak: number; bestScore: number };
};

type Quiz = {
  quizId: string;
  examId?: string;
  accessKey?: string;
  subject: string;
  difficulty: "easy" | "medium" | "hard";
  questionType: "objective" | "theory" | "fill";
  timeMinutes: number;
  questions: QuizQuestion[];
};

type ExamState = "form" | "share" | "running" | "submitted" | "results";

const EXAM_RESULTS_KEY = "exam_history";

function saveExamResult(result: {
  subject: string; score: number; total: number; percent: number; date: string;
}) {
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

  useEffect(() => {
    if (state !== "running") return;
    const handleVisibilityChange = () => {
      if (document.hidden) {
        setTabViolations((v) => {
          const next = v + 1;
          if (next === 1) {
            toast({
              title: "⚠️ Warning: Tab switch detected",
              description: "One more and your exam will be auto-submitted.",
              variant: "destructive",
            });
          } else if (next >= 2) {
            toast({ title: "🚨 Exam auto-submitted due to cheating detection." });
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
    if (code) {
      handleJoinExam(code);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const startTimer = (totalSecs: number) => {
    timerWarningsRef.current.clear();
    setTimeLeft(totalSecs);
    timerRef.current = setInterval(() => {
      setTimeLeft((prev) => {
        if (prev === 120 && !timerWarningsRef.current.has(120)) {
          timerWarningsRef.current.add(120);
          toast({ title: "⏰ 2 minutes remaining!", variant: "destructive" });
        } else if (prev === 60 && !timerWarningsRef.current.has(60)) {
          timerWarningsRef.current.add(60);
          toast({ title: "⚠️ Last minute! Submit your exam now.", variant: "destructive" });
        }
        if (prev <= 1) {
          if (timerRef.current) clearInterval(timerRef.current);
          timerRef.current = null;
          handleAutoSubmit();
          return 0;
        }
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
    if (isNaN(n) || n < 10 || n > 50) {
      toast({ title: "Questions must be between 10 and 50", variant: "destructive" });
      return;
    }

    setIsGenerating(true);
    try {
      const res = await fetch(`${BASE}api/exam/generate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          subject,
          difficulty,
          questionType,
          numQuestions: n,
          timeMinutes: enableTimer ? parseInt(timeLimitMins, 10) : 999,
          instructions: `${examInstructions ? examInstructions + ". " : ""}This is a formal exam. Generate exactly ${n} questions.`,
          expiresInHours: parseInt(expiresIn, 10),
          maxAttempts: parseInt(maxAttempts, 10),
        }),
      });

      if (res.status === 402) {
        const data = await res.json().catch(() => ({})) as Record<string, unknown>;
        if (data.code === "PREMIUM_REQUIRED" || data.code === "LIMIT_REACHED") {
          paymentModal.open();
        } else {
          toast({ title: String(data.error ?? "Upgrade required."), variant: "destructive" });
        }
        return;
      }

      if (res.status === 503) {
        toast({ title: "Exam feature is temporarily unavailable. Please try again later.", variant: "destructive" });
        return;
      }

      if (!res.ok) {
        const data = await res.json().catch(() => ({})) as Record<string, unknown>;
        toast({ title: String(data.error ?? "Failed to generate exam. Try again."), variant: "destructive" });
        return;
      }

      const quiz = await res.json() as Quiz;
      if (!quiz.questions || !quiz.questions.length) {
        toast({ title: "Exam generation returned no questions. Try again.", variant: "destructive" });
        return;
      }

      setActiveQuiz(quiz);
      setAnswers({});
      answersRef.current = {};
      setHasSubmitted(false);
      setTabViolations(0);
      refetchMe();

      const shareCode = quiz.quizId;
      if (shareCode) {
        const origin = window.location.origin;
        const path = window.location.pathname.replace(/\/$/, "");
        const link = `${origin}${path}?code=${encodeURIComponent(shareCode)}`;
        setExamShareCode(shareCode);
        setExamShareLink(link);
        setState("share");
      } else {
        setState("running");
        if (enableTimer) startTimer(parseInt(timeLimitMins, 10) * 60);
      }
    } catch {
      toast({ title: "Network error. Please check your connection and try again.", variant: "destructive" });
    } finally {
      setIsGenerating(false);
    }
  };

  const handleJoinExam = async (code: string) => {
    if (!code.trim()) {
      toast({ title: "Exam code is required.", variant: "destructive" });
      return;
    }
    setIsJoining(true);
    try {
      const res = await fetch(`${BASE}api/exam/${encodeURIComponent(code.trim())}`);
      if (res.status === 404) {
        toast({ title: "Exam not found or has expired. Check the code and try again.", variant: "destructive" });
        setAutoJoining(false);
        return;
      }
      if (res.status === 403) {
        toast({ title: "Invalid access key for this exam.", variant: "destructive" });
        setAutoJoining(false);
        return;
      }
      if (!res.ok) {
        const data = await res.json().catch(() => ({})) as Record<string, unknown>;
        toast({ title: String(data.error ?? "Failed to load exam."), variant: "destructive" });
        setAutoJoining(false);
        return;
      }
      const quiz = await res.json() as Quiz;
      if (!quiz.questions?.length) {
        toast({ title: "Exam is empty. Please contact the creator.", variant: "destructive" });
        setAutoJoining(false);
        return;
      }
      setActiveQuiz(quiz);
      setAnswers({});
      answersRef.current = {};
      setHasSubmitted(false);
      setTabViolations(0);
      const hasTimer = quiz.timeMinutes != null && quiz.timeMinutes < 999;
      setEnableTimer(hasTimer);
      setState("running");
      setAutoJoining(false);
      if (hasTimer) {
        startTimer(quiz.timeMinutes * 60);
      }
    } catch {
      toast({ title: "Network error. Check your connection and try again.", variant: "destructive" });
      setAutoJoining(false);
    } finally {
      setIsJoining(false);
    }
  };

  const handleAutoSubmit = () => {
    toast({ title: "⏰ Time's up! Submitting your exam." });
    doSubmit();
  };

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
        body: JSON.stringify({
          quizId: quiz.quizId,
          subject: quiz.subject,
          difficulty: quiz.difficulty,
          questionType: quiz.questionType,
          questions: quiz.questions,
          answers: Object.entries(answersRef.current).map(([questionId, answer]) => ({ questionId, answer })),
        }),
      });

      if (res.status === 409) {
        const data = await res.json().catch(() => ({})) as Record<string, unknown>;
        toast({ title: String(data.error ?? "Submission blocked."), variant: "destructive" });
        setHasSubmitted(false);
        setState("running");
        return;
      }

      if (!res.ok) {
        toast({ title: "Failed to submit exam. Please try again.", variant: "destructive" });
        setHasSubmitted(false);
        setState("running");
        return;
      }

      const result = await res.json() as QuizResult;
      setQuizResult(result);
      setState("results");
      refetchMe();
      saveExamResult({
        subject: quiz.subject,
        score: result.score,
        total: result.total,
        percent: result.percent,
        date: new Date().toISOString(),
      });
    } catch {
      toast({ title: "Network error during submission. Please try again.", variant: "destructive" });
      setHasSubmitted(false);
      setState("running");
    } finally {
      setIsSubmitting(false);
    }
  };

  const copyToClipboard = (text: string, label: string) => {
    navigator.clipboard.writeText(text).then(() => {
      toast({ title: `${label} copied to clipboard` });
    }).catch(() => {
      toast({ title: "Copy failed — please copy manually.", variant: "destructive" });
    });
  };

  const answeredCount = Object.values(answers).filter((a) => a.trim() !== "").length;
  const totalQuestions = activeQuiz?.questions.length ?? 0;

  const getTimerColor = () =>
    !enableTimer || timeLeft > 300
      ? "text-primary bg-primary/10"
      : timeLeft > 60
      ? "text-yellow-500 bg-yellow-500/10"
      : "text-red-500 bg-red-500/10 animate-pulse";

  const isPremium = user?.isPremium;
  const userLoaded = user !== undefined;

  const BottomNav = () => (
    <nav className="fixed bottom-0 inset-x-0 z-20 glass border-t border-white/8 flex md:hidden h-14">
      <button className="flex-1 flex flex-col items-center justify-center gap-0.5 text-slate-400 hover:text-slate-100 transition-colors" onClick={() => setLocation("/", { replace: true })}>
        <MessageSquare className="w-5 h-5" /><span className="text-[10px] font-medium">Chat</span>
      </button>
      <button className="flex-1 flex flex-col items-center justify-center gap-0.5 text-slate-400 hover:text-slate-100 transition-colors" onClick={() => setLocation("/quiz", { replace: true })}>
        <GraduationCap className="w-5 h-5" /><span className="text-[10px] font-medium">Quiz</span>
      </button>
      <button className="flex-1 flex flex-col items-center justify-center gap-0.5 text-primary">
        <FileText className="w-5 h-5" /><span className="text-[10px] font-medium">Exam</span>
      </button>
    </nav>
  );

  if (autoJoining) {
    return (
      <div className="min-h-[100dvh] bg-slate-950 text-slate-100 flex flex-col items-center justify-center gap-4">
        <div className="w-14 h-14 bg-primary/10 rounded-2xl flex items-center justify-center">
          <FileText className="w-7 h-7 text-primary animate-pulse" />
        </div>
        <p className="text-base font-medium">Loading exam…</p>
        <p className="text-sm text-slate-400">Please wait</p>
      </div>
    );
  }

  if (!flags.exam) {
    return (
      <div className="min-h-[100dvh] bg-slate-950 text-slate-100 flex flex-col pb-14 md:pb-0">
        <header className="h-14 flex items-center justify-between px-4 border-b border-white/8 glass-subtle sticky top-0 z-30">
          <button className="inline-flex items-center gap-2 text-slate-400 hover:text-slate-100 transition-colors" onClick={() => setLocation("/", { replace: true })}>
            <ChevronLeft className="w-5 h-5" /><span className="font-medium">Back</span>
          </button>
          <div className="flex items-center gap-2">
            <FileText className="w-4 h-4 text-primary" />
            <span className="font-semibold text-sm">Exam Mode</span>
          </div>
          <div className="w-20" />
        </header>
        <main className="flex-1 flex flex-col items-center justify-center p-6 text-center max-w-sm mx-auto">
          <div className="w-14 h-14 bg-white/10 rounded-2xl flex items-center justify-center mb-4">
            <FileText className="w-7 h-7 text-slate-400" />
          </div>
          <h2 className="text-xl font-bold mb-2">Exam Unavailable</h2>
          <p className="text-slate-400 text-sm">This feature is temporarily unavailable. Please check back later.</p>
        </main>
        <BottomNav />
      </div>
    );
  }

  if (userLoaded && !isPremium && state === "form" && !autoJoining) {
    return (
      <div className="min-h-[100dvh] bg-slate-950 text-slate-100 flex flex-col pb-14 md:pb-0">
        <header className="h-14 flex items-center justify-between px-4 border-b border-white/8 glass-subtle sticky top-0 z-30">
          <button className="inline-flex items-center gap-2 text-slate-400 hover:text-slate-100 transition-colors" onClick={() => setLocation("/", { replace: true })}>
            <ChevronLeft className="w-5 h-5" /><span className="font-medium">Back</span>
          </button>
          <div className="flex items-center gap-2">
            <FileText className="w-4 h-4 text-primary" />
            <span className="font-semibold text-sm">Exam Mode</span>
          </div>
          <div className="w-20" />
        </header>

        <main className="flex-1 flex flex-col items-center justify-center p-6 text-center max-w-sm mx-auto">
          <div className="w-16 h-16 rounded-2xl bg-primary/10 flex items-center justify-center mb-5">
            <Lock className="w-8 h-8 text-primary" />
          </div>
          <h2 className="text-2xl font-bold mb-2">Premium Feature</h2>
          <p className="text-slate-400 text-sm mb-6">
            Exam Mode is available for Premium users. Upgrade to unlock timed exams, full score breakdowns, and anti-cheat protection.
          </p>
          <div className="w-full p-4 bg-primary/5 border border-primary/20 rounded-xl mb-6 text-sm space-y-2 text-left">
            <p className="font-semibold text-primary mb-2">Premium includes:</p>
            <ul className="text-slate-400 space-y-1 list-disc list-inside">
              <li>Unlimited messages &amp; quizzes</li>
              <li>Full Exam Mode access</li>
              <li>Extended voice input</li>
            </ul>
          </div>
          <Button className="w-full h-12 text-base" onClick={() => paymentModal.open()}>
            Upgrade to Premium
          </Button>
          <div className="mt-6 p-4 glass border border-white/10 rounded-xl w-full text-left space-y-3">
            <p className="text-sm font-semibold">Have an exam link or code?</p>
            <p className="text-xs text-slate-400">Join a shared exam without a Premium account.</p>
            <div className="space-y-2">
              <Input placeholder="Exam code" value={joinCode} onChange={(e) => setJoinCode(e.target.value)} className="h-10 text-sm" />
              <Button
                variant="outline"
                className="w-full"
                disabled={isJoining || !joinCode.trim()}
                onClick={() => handleJoinExam(joinCode)}
              >
                {isJoining ? "Joining…" : "Join Exam"}
              </Button>
            </div>
          </div>
          <button className="mt-4 text-sm text-slate-400 hover:text-slate-100 transition-colors" onClick={() => setLocation("/quiz", { replace: true })}>
            Try Practice Quiz instead →
          </button>
        </main>

        <BottomNav />
        <PaymentModal />
      </div>
    );
  }

  return (
    <div className="min-h-[100dvh] bg-slate-950 text-slate-100 flex flex-col pb-14 md:pb-0">
      <header className="h-14 flex items-center justify-between px-4 border-b border-white/8 glass-subtle sticky top-0 z-30">
        <button
          className="inline-flex items-center gap-2 text-slate-400 hover:text-slate-100 transition-colors"
          onClick={() => setLocation("/", { replace: true })}
        >
          <ChevronLeft className="w-5 h-5" /><span className="font-medium">Back</span>
        </button>
        <div className="flex items-center gap-2">
          <FileText className="w-4 h-4 text-primary" />
          <span className="font-semibold text-sm">Exam Mode</span>
        </div>
        {state === "running" && enableTimer ? (
          <div className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg font-mono font-bold text-sm ${getTimerColor()}`}>
            <Clock className="w-4 h-4" />{formatTime(timeLeft)}
          </div>
        ) : (
          <div className="w-20" />
        )}
      </header>

      <main className="flex-1 p-4 sm:p-6 max-w-2xl w-full mx-auto pb-32">
        {state === "form" && (
          <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
            <div>
              <h1 className="text-2xl font-bold mb-1 flex items-center gap-2"><span>📋</span> Exam Mode</h1>
              <p className="text-slate-400 text-sm">A timed exam with one-shot submission. Results are saved to your history.</p>
            </div>

            <div className="p-4 bg-primary/5 border border-primary/20 rounded-xl text-sm space-y-1">
              <p className="font-semibold text-primary mb-2">How it works</p>
              <ul className="text-slate-400 space-y-1 list-disc list-inside">
                <li>All questions load at once — scroll through them</li>
                <li>Answer as many as you can before time runs out</li>
                <li>Only one submission allowed</li>
                <li>Tab switching triggers anti-cheat warnings</li>
                <li>Full score breakdown shown at the end</li>
              </ul>
            </div>

            <div className="flex rounded-xl border border-white/10 overflow-hidden">
              <button
                className={`flex-1 py-2.5 text-sm font-medium transition-colors ${!joinMode ? "bg-primary text-primary-foreground" : "bg-slate-950 text-slate-400 hover:text-slate-100"}`}
                onClick={() => setJoinMode(false)}
              >
                Create Exam
              </button>
              <button
                className={`flex-1 py-2.5 text-sm font-medium transition-colors ${joinMode ? "bg-primary text-primary-foreground" : "bg-slate-950 text-slate-400 hover:text-slate-100"}`}
                onClick={() => setJoinMode(true)}
              >
                Join Exam
              </button>
            </div>

            {joinMode ? (
              <div className="p-6 glass rounded-xl border border-white/10 shadow-sm space-y-4">
                <div className="space-y-1">
                  <h2 className="font-semibold">Join a Shared Exam</h2>
                  <p className="text-sm text-slate-400">Enter the exam code provided by the exam creator.</p>
                </div>
                <div className="space-y-2">
                  <Label>Exam Code</Label>
                  <Input placeholder="e.g. a3f8c2b1d4e9..." value={joinCode} onChange={(e) => setJoinCode(e.target.value)} className="h-11 font-mono" />
                </div>
                <Button
                  className="w-full h-12 text-base"
                  disabled={isJoining || !joinCode.trim()}
                  onClick={() => handleJoinExam(joinCode)}
                >
                  {isJoining ? "Joining Exam…" : "Join Exam"}
                </Button>
                <p className="text-xs text-slate-400 text-center">
                  Or paste the full share link in your browser — it will load automatically.
                </p>
              </div>
            ) : (
              <form onSubmit={handleGenerate} className="space-y-4 p-6 glass rounded-xl border border-white/10 shadow-sm">
                <div className="space-y-2">
                  <Label>Subject / Topic</Label>
                  <Input value={subject} onChange={(e) => setSubject(e.target.value)} placeholder="e.g. WAEC Biology, JAMB Chemistry, A-Level Math" required className="h-11" />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Difficulty</Label>
                    <Select value={difficulty} onValueChange={(v: any) => setDifficulty(v)}>
                      <SelectTrigger className="h-11"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="easy">Easy</SelectItem>
                        <SelectItem value="medium">Medium</SelectItem>
                        <SelectItem value="hard">Hard</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label>Question Type</Label>
                    <Select value={questionType} onValueChange={(v: any) => setQuestionType(v)}>
                      <SelectTrigger className="h-11"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="objective">Multiple Choice</SelectItem>
                        <SelectItem value="theory">Theory / Essay</SelectItem>
                        <SelectItem value="fill">Fill in the Blank</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Questions (10–50)</Label>
                    <Input type="number" min="10" max="50" value={numQuestions} onChange={(e) => setNumQuestions(e.target.value)} required className="h-11" />
                  </div>
                  <div className="space-y-2">
                    <Label>Enable Timer</Label>
                    <Select value={enableTimer ? "yes" : "no"} onValueChange={(v) => setEnableTimer(v === "yes")}>
                      <SelectTrigger className="h-11"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="yes">Yes</SelectItem>
                        <SelectItem value="no">No</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                {enableTimer && (
                  <div className="space-y-2">
                    <Label>Time Limit (Minutes)</Label>
                    <Input type="number" min="5" max="180" value={timeLimitMins} onChange={(e) => setTimeLimitMins(e.target.value)} required={enableTimer} className="h-11" />
                  </div>
                )}
                <div className="space-y-2">
                  <Label>Show Answers After Submission</Label>
                  <Select value={showAnswers ? "yes" : "no"} onValueChange={(v) => setShowAnswers(v === "yes")}>
                    <SelectTrigger className="h-11"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="yes">Yes — show full breakdown</SelectItem>
                      <SelectItem value="no">No — score only</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Special Instructions (Optional)</Label>
                  <Textarea
                    value={examInstructions}
                    onChange={(e) => setExamInstructions(e.target.value)}
                    placeholder="e.g. Focus on calculations, use past WAEC questions..."
                    rows={2}
                    className="text-sm resize-none"
                  />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Link Expiry</Label>
                    <Select value={expiresIn} onValueChange={setExpiresIn}>
                      <SelectTrigger className="h-11"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="1">1 hour</SelectItem>
                        <SelectItem value="6">6 hours</SelectItem>
                        <SelectItem value="24">24 hours</SelectItem>
                        <SelectItem value="168">7 days</SelectItem>
                        <SelectItem value="0">Never</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label>Attempt Limit</Label>
                    <Select value={maxAttempts} onValueChange={setMaxAttempts}>
                      <SelectTrigger className="h-11"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="0">Unlimited</SelectItem>
                        <SelectItem value="1">1 attempt</SelectItem>
                        <SelectItem value="5">5 attempts</SelectItem>
                        <SelectItem value="10">10 attempts</SelectItem>
                        <SelectItem value="30">30 attempts</SelectItem>
                        <SelectItem value="50">50 attempts</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <Button type="submit" className="w-full h-12 text-base mt-2" size="lg" disabled={isGenerating}>
                  {isGenerating ? "Generating Exam…" : "Generate Exam"}
                </Button>
              </form>
            )}

            <button className="w-full text-sm text-slate-400 hover:text-slate-100 flex items-center justify-center gap-2 py-2 transition-colors" onClick={() => setLocation("/quiz", { replace: true })}>
              <GraduationCap className="w-4 h-4" />Want a shorter practice quiz instead?
            </button>
          </div>
        )}

        {state === "share" && activeQuiz && (
          <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
            <div className="text-center space-y-2 p-8 glass border border-white/10 rounded-2xl shadow-sm">
              <div className="w-16 h-16 bg-primary/20 rounded-full flex items-center justify-center mx-auto mb-4">
                <Share2 className="w-8 h-8 text-primary" />
              </div>
              <h2 className="text-2xl font-bold">Exam Ready!</h2>
              <p className="text-slate-400 text-sm">{activeQuiz.subject}</p>
              <div className="flex items-center justify-center gap-4 mt-3 text-sm text-slate-400">
                <span>{activeQuiz.questions.length} questions</span>
                <span>·</span>
                <span>{activeQuiz.difficulty}</span>
                {enableTimer && (
                  <>
                    <span>·</span>
                    <span>{timeLimitMins} min</span>
                  </>
                )}
              </div>
            </div>

            <div className="p-5 glass border border-white/10 rounded-xl shadow-sm space-y-4">
              <div className="flex items-center gap-2 mb-1">
                <Link2 className="w-4 h-4 text-primary" />
                <h3 className="font-semibold text-sm">Share this Exam</h3>
              </div>
              <p className="text-xs text-slate-400">Others can join your exam using the code below, or by opening the share link.</p>

              <div className="space-y-3">
                <div className="space-y-1.5">
                  <Label className="text-xs text-slate-400">Exam Code</Label>
                  <div className="flex items-center gap-2">
                    <code className="flex-1 bg-slate-950 border border-white/10 rounded-lg px-3 py-2 text-xs font-mono text-primary truncate">
                      {examShareCode}
                    </code>
                    <Button
                      variant="outline"
                      size="sm"
                      className="shrink-0 h-9 px-3"
                      onClick={() => copyToClipboard(examShareCode, "Exam code")}
                    >
                      <Copy className="w-3.5 h-3.5 mr-1.5" />Copy
                    </Button>
                  </div>
                </div>

                {examShareLink && (
                  <div className="space-y-1.5">
                    <Label className="text-xs text-slate-400">Share Link</Label>
                    <div className="flex items-center gap-2">
                      <code className="flex-1 bg-slate-950 border border-white/10 rounded-lg px-3 py-2 text-xs font-mono truncate text-slate-400">
                        {examShareLink}
                      </code>
                      <Button
                        variant="outline"
                        size="sm"
                        className="shrink-0 h-9 px-3"
                        onClick={() => copyToClipboard(examShareLink, "Share link")}
                      >
                        <Copy className="w-3.5 h-3.5 mr-1.5" />Copy
                      </Button>
                    </div>
                  </div>
                )}
              </div>

              <p className="text-xs text-slate-400 bg-yellow-500/10 border border-yellow-500/20 rounded-lg p-3">
                ⚠️ Keep the link private — anyone with it can take your exam. Share only with intended participants.
              </p>
            </div>

            <Button
              className="w-full h-12 text-base"
              onClick={() => {
                setState("running");
                if (enableTimer) startTimer(parseInt(timeLimitMins, 10) * 60);
              }}
            >
              Start Exam →
            </Button>
            <button
              className="w-full text-sm text-slate-400 hover:text-slate-100 text-center py-2 transition-colors"
              onClick={() => { setState("form"); setActiveQuiz(null); }}
            >
              ← Back to settings
            </button>
          </div>
        )}

        {state === "running" && activeQuiz && (
          <div className="space-y-4 animate-in fade-in duration-300">
            <div className="flex justify-between items-center p-4 glass rounded-xl border border-white/10 shadow-sm sticky top-16 z-20">
              <div>
                <p className="text-sm font-medium">{activeQuiz.subject}</p>
                <p className="text-xs text-slate-400 mt-0.5">{answeredCount} of {totalQuestions} answered</p>
              </div>
              <div className="flex gap-2 items-center">
                <div className="w-24 h-1.5 bg-white/10 rounded-full overflow-hidden">
                  <div className="bg-primary h-full rounded-full transition-all duration-300" style={{ width: `${(answeredCount / Math.max(totalQuestions, 1)) * 100}%` }} />
                </div>
                <span className="text-xs text-slate-400 tabular-nums">{Math.round((answeredCount / Math.max(totalQuestions, 1)) * 100)}%</span>
              </div>
            </div>

            {tabViolations === 1 && (
              <div className="p-3 bg-yellow-500/10 border border-yellow-500/30 rounded-xl text-sm text-yellow-600 font-medium text-center">
                ⚠️ Warning: Tab switch detected. One more will auto-submit your exam.
              </div>
            )}

            <div className="space-y-5">
              {activeQuiz.questions.map((q, i) => (
                <div key={q.id} className="p-5 glass rounded-xl border border-white/10 shadow-sm">
                  <div className="flex gap-3 mb-4">
                    <span className="flex items-center justify-center w-7 h-7 bg-primary/10 text-primary text-sm font-bold rounded-full shrink-0 mt-0.5">{i + 1}</span>
                    <h3 className="text-base font-medium leading-relaxed">{q.prompt}</h3>
                  </div>
                  {q.type === "objective" && q.options ? (
                    <div className="space-y-2 pl-10">
                      {q.options.map((opt, oi) => (
                        <button
                          key={oi}
                          className={`w-full text-left p-3 rounded-lg border text-sm transition-all ${answers[q.id] === opt ? "bg-primary/10 border-primary font-medium ring-1 ring-primary/30" : "bg-slate-950 border-white/10 hover:border-primary/40 hover:bg-white/5"}`}
                          onClick={() => { const next = { ...answersRef.current, [q.id]: opt }; answersRef.current = next; setAnswers(next); }}
                        >
                          <span className="text-slate-400 font-mono mr-2 text-xs">{String.fromCharCode(65 + oi)}.</span>{opt}
                        </button>
                      ))}
                    </div>
                  ) : (
                    <Textarea className="min-h-[90px] text-sm p-3 ml-10" placeholder="Type your answer here…" value={answers[q.id] || ""} onChange={(e) => { const next = { ...answersRef.current, [q.id]: e.target.value }; answersRef.current = next; setAnswers(next); }} />
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {state === "submitted" && (
          <div className="flex flex-col items-center justify-center min-h-[60vh] space-y-4 text-center animate-in fade-in duration-300">
            <div className="w-16 h-16 bg-primary/20 rounded-full flex items-center justify-center"><span className="text-3xl">⏳</span></div>
            <h2 className="text-xl font-bold">Marking your exam…</h2>
            <p className="text-slate-400 text-sm">Please wait while we process your results.</p>
          </div>
        )}

        {state === "results" && quizResult && (
          <div className="space-y-6 animate-in zoom-in-95 duration-500">
            <div className="text-center space-y-2 p-8 glass border border-white/10 rounded-2xl shadow-sm">
              <div className="flex items-center justify-center gap-2 mb-3 text-primary">
                <Trophy className="w-6 h-6" /><h2 className="text-2xl font-bold">Exam Complete</h2>
              </div>
              <div className={`text-7xl font-black my-4 ${quizResult.percent >= 50 ? "text-primary" : "text-destructive"}`}>
                {Math.round(quizResult.percent)}%
              </div>
              <p className="text-slate-400 text-lg">{quizResult.score} correct out of {quizResult.total}</p>
              {quizResult.percent < 50 && (
                <p className="text-sm text-slate-400 mt-2 italic">Don't be discouraged — every attempt teaches you something. Review the explanations and try again! 💪</p>
              )}
              {quizResult.percent >= 80 && (
                <p className="text-sm text-primary font-medium mt-2">Excellent work! You're mastering this topic! 🎉</p>
              )}
              <div className="flex justify-center gap-6 mt-4 text-sm">
                <div className="flex items-center gap-1.5 text-primary"><CheckCircle className="w-4 h-4" /><span className="font-semibold">{quizResult.score} Correct</span></div>
                <div className="flex items-center gap-1.5 text-destructive"><XCircle className="w-4 h-4" /><span className="font-semibold">{quizResult.total - quizResult.score} Wrong</span></div>
              </div>
            </div>

            {showAnswers && (
              <div className="space-y-4">
                <h3 className="font-semibold text-lg">Answer Breakdown</h3>
                {quizResult.results.map((res, i) => (
                  <div key={i} className={`p-4 rounded-xl border shadow-sm ${res.isCorrect ? "bg-primary/5 border-primary/20" : "bg-destructive/5 border-destructive/20"}`}>
                    <div className="flex gap-2 items-start mb-2">
                      <span className={`flex items-center justify-center w-6 h-6 rounded-full text-xs font-bold shrink-0 mt-0.5 ${res.isCorrect ? "bg-primary text-primary-foreground" : "bg-destructive text-destructive-foreground"}`}>{i + 1}</span>
                      <h4 className="font-medium text-sm leading-relaxed">{res.prompt}</h4>
                    </div>
                    <div className="pl-8 space-y-2 text-sm">
                      <div>
                        <span className="text-slate-400 text-xs uppercase tracking-wide">Your Answer: </span>
                        <span className={res.isCorrect ? "text-primary font-medium" : "text-destructive font-medium"}>{res.userAnswer || "No answer"}</span>
                      </div>
                      {!res.isCorrect && (
                        <div>
                          <span className="text-slate-400 text-xs uppercase tracking-wide">Correct Answer: </span>
                          <span className="text-primary font-medium">{res.correctAnswer}</span>
                        </div>
                      )}
                      <div className="bg-slate-950/60 p-3 rounded-lg border border-white/10">
                        <span className="text-slate-400 text-xs uppercase tracking-wider font-semibold block mb-1">Explanation</span>
                        <p className="leading-relaxed">{res.explanation}</p>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}

            <Button className="w-full h-12 text-base" onClick={() => { setState("form"); setQuizResult(null); setActiveQuiz(null); }}>
              Take Another Exam
            </Button>
          </div>
        )}
      </main>

      {state === "running" && (
        <div className="fixed bottom-14 md:bottom-0 left-0 right-0 p-4 glass-subtle border-t border-white/8 z-30">
          <div className="max-w-2xl mx-auto flex gap-3 items-center">
            <div className="flex-1 text-sm text-slate-400">
              {answeredCount < totalQuestions
                ? `${totalQuestions - answeredCount} question${totalQuestions - answeredCount !== 1 ? "s" : ""} remaining`
                : "All questions answered ✓"}
            </div>
            <Button size="lg" className="min-w-[140px]" onClick={() => setShowSubmitConfirm(true)} disabled={isSubmitting || hasSubmitted}>
              {isSubmitting ? "Submitting…" : "Submit Exam"}
            </Button>
          </div>
        </div>
      )}

      {showSubmitConfirm && (
        <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="glass border border-white/10 rounded-2xl p-6 max-w-sm w-full shadow-2xl text-center space-y-4">
            <div className="w-12 h-12 bg-primary/10 rounded-full flex items-center justify-center mx-auto">
              <FileText className="w-6 h-6 text-primary" />
            </div>
            <h3 className="text-xl font-bold">Submit Exam?</h3>
            <p className="text-sm text-slate-400">
              {answeredCount < totalQuestions
                ? `You have ${totalQuestions - answeredCount} unanswered question${totalQuestions - answeredCount !== 1 ? "s" : ""}. This cannot be undone.`
                : "You've answered all questions. This cannot be undone."}
            </p>
            <div className="flex gap-3">
              <Button variant="outline" className="flex-1 h-11" onClick={() => setShowSubmitConfirm(false)}>
                Cancel
              </Button>
              <Button
                className="flex-1 h-11"
                onClick={() => { setShowSubmitConfirm(false); doSubmit(); }}
              >
                Yes, Submit
              </Button>
            </div>
          </div>
        </div>
      )}

      <BottomNav />
      <PaymentModal />
    </div>
  );
}
