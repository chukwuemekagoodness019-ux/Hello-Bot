import { useState, useEffect } from "react";
import { Switch, Route, Router as WouterRouter, useLocation } from "wouter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { ChatHistoryProvider } from "@/hooks/use-chat-history";
import { MotivationalSplash } from "@/components/motivational-splash";
import { AnnouncementBanner } from "@/components/announcement-banner";
import { FeedbackButton } from "@/components/feedback-button";
import { OfflineBanner } from "@/components/offline-banner";
import { ErrorBoundary } from "@/components/error-boundary";
import NotFound from "@/pages/not-found";
import ChatPage from "@/pages/chat";
import QuizPage from "@/pages/quiz";
import ExamPage from "@/pages/exam";
import AdminPage from "@/pages/admin";
import AuthPage from "@/pages/auth";

const BASE = import.meta.env.BASE_URL as string;

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      staleTime: 30_000,
    },
  },
});

function AppRoutes() {
  const [location] = useLocation();
  const isAdmin = location === "/system-core";
  return (
    <div className="flex-1 min-h-0 flex flex-col overflow-hidden">
      {!isAdmin && <AnnouncementBanner />}
      <div className="flex-1 min-h-0 relative">
        <Switch>
          <Route path="/" component={ChatPage} />
          <Route path="/quiz" component={QuizPage} />
          <Route path="/exam" component={ExamPage} />
          <Route path="/system-core" component={AdminPage} />
          <Route component={NotFound} />
        </Switch>
      </div>
      {location !== "/" && !isAdmin && <FeedbackButton />}
    </div>
  );
}

type AuthState = "loading" | "authed" | "unauthed";

const AUTH_SESSION_KEY = "_auth_state";

function AuthGate({ children }: { children: React.ReactNode }) {
  // On repeat loads within the same session, read the cached auth state so the
  // spinner is skipped and the app appears instantly. The fetch below always
  // runs in the background to validate / refresh the state.
  const [auth, setAuth] = useState<AuthState>(() => {
    try {
      const cached = sessionStorage.getItem(AUTH_SESSION_KEY) as AuthState | null;
      if (cached === "authed" || cached === "unauthed") return cached;
    } catch {}
    return "loading";
  });

  useEffect(() => {
    fetch(`${BASE}api/me`, { credentials: "include" })
      .then((res) => {
        const next: AuthState = res.ok ? "authed" : "unauthed";
        setAuth(next);
        try { sessionStorage.setItem(AUTH_SESSION_KEY, next); } catch {}
      })
      .catch(() => {
        setAuth("unauthed");
        try { sessionStorage.removeItem(AUTH_SESSION_KEY); } catch {}
      });
  }, []);

  if (auth === "loading") {
    return (
      <div className="h-full bg-background flex items-center justify-center">
        <div className="w-7 h-7 rounded-full border-2 border-primary border-t-transparent animate-spin" />
      </div>
    );
  }

  if (auth === "unauthed") {
    return <AuthPage />;
  }

  return <>{children}</>;
}

function App() {
  return (
    <ErrorBoundary>
      <QueryClientProvider client={queryClient}>
        <TooltipProvider>
          <ChatHistoryProvider>
            <div className="h-[100dvh] overflow-hidden flex flex-col">
              <OfflineBanner />
              <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, "")}>
                <AuthGate>
                  <MotivationalSplash />
                  <AppRoutes />
                </AuthGate>
              </WouterRouter>
            </div>
            <Toaster />
          </ChatHistoryProvider>
        </TooltipProvider>
      </QueryClientProvider>
    </ErrorBoundary>
  );
}

export default App;
