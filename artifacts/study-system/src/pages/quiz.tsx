import { useState, useEffect, useRef } from "react";
import { useLocation } from "wouter";
import { ChevronLeft, AlertCircle, Loader2, Clock, MessageSquare, GraduationCap, FileText } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { useGenerateQuiz, useSubmitQuiz, useGetMe } from "@workspace/api-client-react";
import type { Quiz, QuizResult } from "@workspace/api-client-react";
import { PaymentModal } from "@/components/payment-modal";
import { usePaymentModal } from "@/hooks/use-payment-modal";
import { useToast } from "@/hooks/use-toast";
import { useFeatureFlags } from "@/hooks/use-feature-flags";

export default function QuizPage() {
  const [state, setState] = useState<"form" | "running" | "results">("form");
  const { toast } = useToast();
  const paymentModal = usePaymentModal();
  const { refetch: refetchMe } = useGetMe();
  const [, setLocation] = useLocation();
  const { flags } = useFeatureFlags();

  const [subject, setSubject] = useState("");
  const [difficulty, setDifficulty] = useState<"easy" | "medium" | "hard">("medium");
  const [questionType, setQuestionType] = useState<"objective" | "theory" | "fill">("objective");
  const [numQuestions, setNumQuestions] = useState("5");
  const [timeMinutes, setTimeMinutes] = useState("10");
  const [instructions, setInstructions] = useState("");

  const generateMutation = useGenerateQuiz();
  const submitMutation = useSubmitQuiz();

  const [activeQuiz, setActiveQuiz] = useState<Quiz | null>(null);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const answersRef = useRef<Record<string, string>>({});
  const [currentQuestionIdx, setCurrentQuestionIdx] = useState(0);
  const [timeLeft, setTimeLeft] = useState(0);
  const [quizResult, setQuizResult] = useState<QuizResult | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => () => { if (timerRef.current) clearInterval(timerRef.current); }, []);

  const handleGenerate = (e: React.FormEvent) => {
    e.preventDefault();
    if (!subject) { toast({ title: "Subject required" }); return; }

    generateMutation.mutate(
      {
        data: {
          subject,
          difficulty,
          questionType,
          numQuestions: parseInt(numQuestions),
          timeMinutes: parseInt(timeMinutes),
          instructions: instructions || undefined,
        },
      },
      {
        onSuccess: (quiz) => {
          setActiveQuiz(quiz);
          setAnswers({});
          answersRef.current = {};
          setCurrentQuestionIdx(0);
          setTimeLeft(quiz.timeMinutes * 60);
          setState("running");
          refetchMe();

          timerRef.current = setInterval(() => {
            setTimeLeft((prev) => {
              if (prev <= 1) {
                if (timerRef.current) clearInterval(timerRef.current);
                handleAutoSubmit(quiz);
                return 0;
              }
              return prev - 1;
            });
          }, 1000);
        },
        onError: (err: any) => {
          if (err.status === 402 || err.code === "LIMIT_REACHED") {
            paymentModal.open();
          } else {
            toast({ title: "Failed to generate quiz", variant: "destructive" });
          }
        },
      }
    );
  };

  const handleSubmit = (quizToSubmit: Quiz = activeQuiz!) => {
    if (!quizToSubmit) return;
    if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null; }

    submitMutation.mutate(
      {
        data: {
          quizId: quizToSubmit.quizId,
          subject: quizToSubmit.subject,
          difficulty: quizToSubmit.difficulty,
          questionType: quizToSubmit.questionType,
          questions: quizToSubmit.questions,
          answers: Object.entries(answersRef.current).map(([questionId, answer]) => ({ questionId, answer })),
        },
      },
      {
        onSuccess: (res) => {
          setQuizResult(res);
          setState("results");
          refetchMe();
        },
        onError: () => {
          toast({ title: "Failed to submit quiz", variant: "destructive" });
        },
      }
    );
  };

  const handleAutoSubmit = (quiz: Quiz) => {
    toast({ title: "Time's up! Submitting your answers." });
    handleSubmit(quiz);
  };

  const formatTime = (seconds: number) => {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m}:${s.toString().padStart(2, "0")}`;
  };

  const timerColor =
    timeLeft > 120 ? "text-primary bg-primary/10" : timeLeft > 30 ? "text-yellow-500 bg-yellow-500/10" : "text-red-500 bg-red-500/10 animate-pulse";

  if (!flags.quiz) {
    return (
      <div className="min-h-[100dvh] bg-background text-foreground flex flex-col pb-14 md:pb-0">
        <header className="h-14 flex items-center justify-between px-4 border-b border-border sticky top-0 bg-background/95 backdrop-blur z-30">
          <button className="inline-flex items-center gap-2 text-muted-foreground hover:text-foreground transition-colors" onClick={() => setLocation("/", { replace: true })}>
            <ChevronLeft className="w-5 h-5" /><span className="font-medium">Back</span>
          </button>
          <span className="font-semibold text-sm flex items-center gap-1.5">
            <GraduationCap className="w-4 h-4 text-primary" />Practice Quiz
          </span>
          <div className="w-24" />
        </header>
        <main className="flex-1 flex flex-col items-center justify-center p-6 text-center max-w-sm mx-auto">
          <div className="w-14 h-14 bg-muted rounded-2xl flex items-center justify-center mb-4">
            <GraduationCap className="w-7 h-7 text-muted-foreground" />
          </div>
          <h2 className="text-xl font-bold mb-2">Quiz Unavailable</h2>
          <p className="text-muted-foreground text-sm">This feature is temporarily unavailable. Please check back later.</p>
        </main>
        <nav className="fixed bottom-0 inset-x-0 z-20 bg-background/95 backdrop-blur border-t border-border flex md:hidden h-14">
          <button className="flex-1 flex flex-col items-center justify-center gap-0.5 text-muted-foreground hover:text-foreground transition-colors" onClick={() => setLocation("/", { replace: true })}>
            <MessageSquare className="w-5 h-5" /><span className="text-[10px] font-medium">Chat</span>
          </button>
          <button className="flex-1 flex flex-col items-center justify-center gap-0.5 text-primary">
            <GraduationCap className="w-5 h-5" /><span className="text-[10px] font-medium">Quiz</span>
          </button>
          <button className="flex-1 flex flex-col items-center justify-center gap-0.5 text-muted-foreground hover:text-foreground transition-colors" onClick={() => setLocation("/exam", { replace: true })}>
            <FileText className="w-5 h-5" /><span className="text-[10px] font-medium">Exam</span>
          </button>
        </nav>
      </div>
    );
  }

  return (
    <div className="min-h-[100dvh] bg-background text-foreground flex flex-col pb-14 md:pb-0">
      <header className="h-14 flex items-center justify-between px-4 border-b border-border sticky top-0 bg-background/95 backdrop-blur z-30">
        <button
          className="inline-flex items-center gap-2 text-muted-foreground hover:text-foreground transition-colors"
          onClick={() => setLocation("/", { replace: true })}
        >
          <ChevronLeft className="w-5 h-5" /><span className="font-medium">Back</span>
        </button>
        <span className="font-semibold text-sm flex items-center gap-1.5">
          <GraduationCap className="w-4 h-4 text-primary" />Practice Quiz
        </span>
        {state === "running" ? (
          <div className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-mono font-bold ${timerColor}`}>
            <Clock className="w-4 h-4" />{formatTime(timeLeft)}
          </div>
        ) : (
          <div className="w-24" />
        )}
      </header>

      <main className="flex-1 p-4 sm:p-6 max-w-2xl w-full mx-auto">
        {state === "form" && (
          <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
            <div>
              <h1 className="text-2xl font-bold mb-1">Practice Quiz</h1>
              <p className="text-muted-foreground text-sm">Set up a quick quiz to test your knowledge.</p>
            </div>

            <form onSubmit={handleGenerate} className="space-y-4 p-6 bg-card rounded-xl border border-border shadow-sm">
              <div className="space-y-2">
                <Label>Subject / Topic</Label>
                <Input value={subject} onChange={(e) => setSubject(e.target.value)} placeholder="e.g. Cell Biology, WAEC Math, Macroeconomics" required className="h-11" />
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
                  <Label>Questions</Label>
                  <Input type="number" min="1" max="30" value={numQuestions} onChange={(e) => setNumQuestions(e.target.value)} required className="h-11" />
                </div>
                <div className="space-y-2">
                  <Label>Time (Minutes)</Label>
                  <Input type="number" min="1" max="120" value={timeMinutes} onChange={(e) => setTimeMinutes(e.target.value)} required className="h-11" />
                </div>
              </div>

              <div className="space-y-2">
                <Label>Special Instructions (Optional)</Label>
                <Textarea value={instructions} onChange={(e) => setInstructions(e.target.value)} placeholder="e.g. Focus on calculations, use Nigerian examples..." rows={2} />
              </div>

              <Button type="submit" className="w-full h-12 text-base mt-2" disabled={generateMutation.isPending}>
                {generateMutation.isPending ? (
                  <span className="flex items-center gap-2"><Loader2 className="w-4 h-4 animate-spin" />Generating…</span>
                ) : "Start Quiz"}
              </Button>
            </form>

            <button className="w-full text-sm text-muted-foreground hover:text-foreground flex items-center justify-center gap-2 py-2 transition-colors" onClick={() => setLocation("/exam", { replace: true })}>
              <FileText className="w-4 h-4" />Want a full exam instead?
            </button>
          </div>
        )}

        {state === "running" && activeQuiz && (
          <div className="space-y-6 animate-in fade-in slide-in-from-right-8 duration-300">
            <div className="flex justify-between items-center bg-card p-4 rounded-xl border border-border shadow-sm">
              <div>
                <span className="text-sm font-medium text-muted-foreground block">
                  Question {currentQuestionIdx + 1} of {activeQuiz.questions.length}
                </span>
                <div className="flex gap-1 mt-2 flex-wrap">
                  {activeQuiz.questions.map((_: unknown, i: number) => (
                    <button
                      key={i}
                      className={`h-1.5 rounded-full transition-all ${i === currentQuestionIdx ? "bg-primary w-6" : i < currentQuestionIdx ? "bg-primary/40 w-4" : "bg-muted w-4"}`}
                      onClick={() => setCurrentQuestionIdx(i)}
                    />
                  ))}
                </div>
              </div>
              <div className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg font-mono font-bold text-sm ${timerColor}`}>
                <Clock className="w-4 h-4" />{formatTime(timeLeft)}
              </div>
            </div>

            <div className="p-6 bg-card rounded-xl border border-border shadow-sm min-h-[280px] flex flex-col">
              <h3 className="text-lg font-medium mb-6 leading-relaxed">
                {activeQuiz.questions[currentQuestionIdx]?.prompt}
              </h3>
              <div className="flex-1">
                {activeQuiz.questions[currentQuestionIdx]?.type === "objective" &&
                activeQuiz.questions[currentQuestionIdx]?.options ? (
                  <div className="space-y-3">
                    {activeQuiz.questions[currentQuestionIdx].options!.map((opt: string, i: number) => (
                      <button
                        key={i}
                        className={`w-full text-left p-4 rounded-xl border transition-all text-sm ${answers[activeQuiz.questions[currentQuestionIdx].id] === opt ? "bg-primary/10 border-primary font-medium ring-1 ring-primary/30" : "bg-background border-border hover:border-primary/40 hover:bg-accent/50"}`}
                        onClick={() => { const id = activeQuiz.questions[currentQuestionIdx].id; const next = { ...answersRef.current, [id]: opt }; answersRef.current = next; setAnswers(next); }}
                      >
                        <span className="text-muted-foreground font-mono mr-2 text-xs">{String.fromCharCode(65 + i)}.</span>{opt}
                      </button>
                    ))}
                  </div>
                ) : (
                  <Textarea
                    className="min-h-[150px] text-base p-4"
                    placeholder="Type your answer here..."
                    value={answers[activeQuiz.questions[currentQuestionIdx]?.id] || ""}
                    onChange={(e) => { const id = activeQuiz.questions[currentQuestionIdx].id; const next = { ...answersRef.current, [id]: e.target.value }; answersRef.current = next; setAnswers(next); }}
                  />
                )}
              </div>
            </div>

            <div className="flex justify-between gap-3">
              <Button variant="outline" className="flex-1" disabled={currentQuestionIdx === 0} onClick={() => setCurrentQuestionIdx((i) => i - 1)}>← Previous</Button>
              {currentQuestionIdx === activeQuiz.questions.length - 1 ? (
                <Button className="flex-1" onClick={() => handleSubmit()} disabled={submitMutation.isPending}>
                  {submitMutation.isPending ? "Submitting…" : "Submit Quiz ✓"}
                </Button>
              ) : (
                <Button className="flex-1" onClick={() => setCurrentQuestionIdx((i) => i + 1)}>Next →</Button>
              )}
            </div>
          </div>
        )}

        {state === "results" && quizResult && (
          <div className="space-y-6 animate-in zoom-in-95 duration-500">
            <div className="text-center space-y-2 mb-8 bg-card border border-border p-8 rounded-2xl shadow-sm">
              <h2 className="text-2xl font-bold">Quiz Complete</h2>
              <div className={`text-6xl font-black my-4 ${quizResult.percent >= 50 ? "text-primary" : "text-destructive"}`}>
                {Math.round(quizResult.percent)}%
              </div>
              <p className="text-muted-foreground">{quizResult.score} out of {quizResult.total} correct</p>
              {quizResult.percent < 50 && (
                <p className="text-sm text-muted-foreground italic mt-2">Don't give up! Review the explanations below and try again. 💪</p>
              )}
              {quizResult.percent >= 80 && (
                <p className="text-sm text-primary font-medium mt-2">Outstanding performance! Keep it up! 🎉</p>
              )}
            </div>

            <div className="space-y-4">
              {quizResult.results.map((res: QuizResult["results"][number], i: number) => (
                <div key={i} className={`p-5 rounded-xl border shadow-sm ${res.isCorrect ? "bg-primary/5 border-primary/20" : "bg-destructive/5 border-destructive/20"}`}>
                  <div className="flex gap-2 items-start mb-3">
                    <span className={`flex items-center justify-center w-6 h-6 rounded-full text-xs font-bold shrink-0 mt-0.5 ${res.isCorrect ? "bg-primary text-primary-foreground" : "bg-destructive text-destructive-foreground"}`}>{i + 1}</span>
                    <h4 className="font-medium text-sm">{res.prompt}</h4>
                  </div>
                  <div className="pl-8 space-y-3 text-sm">
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
                    <div className="bg-background/60 p-3 rounded-lg border border-border mt-2">
                      <span className="text-muted-foreground block mb-1 text-xs uppercase tracking-wider font-semibold">Explanation</span>
                      <p>{res.explanation}</p>
                    </div>
                  </div>
                </div>
              ))}
            </div>

            <Button className="w-full mt-6 h-12 text-base" onClick={() => setState("form")}>
              Start Another Quiz
            </Button>
          </div>
        )}
      </main>

      <nav className="fixed bottom-0 inset-x-0 z-20 bg-background/95 backdrop-blur border-t border-border flex md:hidden h-14">
        <button className="flex-1 flex flex-col items-center justify-center gap-0.5 text-muted-foreground hover:text-foreground transition-colors" onClick={() => setLocation("/", { replace: true })}>
          <MessageSquare className="w-5 h-5" /><span className="text-[10px] font-medium">Chat</span>
        </button>
        <button className="flex-1 flex flex-col items-center justify-center gap-0.5 text-primary">
          <GraduationCap className="w-5 h-5" /><span className="text-[10px] font-medium">Quiz</span>
        </button>
        <button className="flex-1 flex flex-col items-center justify-center gap-0.5 text-muted-foreground hover:text-foreground transition-colors" onClick={() => setLocation("/exam", { replace: true })}>
          <FileText className="w-5 h-5" /><span className="text-[10px] font-medium">Exam</span>
        </button>
      </nav>

      <PaymentModal />
    </div>
  );
}
