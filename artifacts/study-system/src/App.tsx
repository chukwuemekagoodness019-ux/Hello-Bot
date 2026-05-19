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
    <>
      {!isAdmin && <AnnouncementBanner />}
      <Switch>
        <Route path="/" component={ChatPage} />
        <Route path="/quiz" component={QuizPage} />
        <Route path="/exam" component={ExamPage} />
        <Route path="/system-core" component={AdminPage} />
        <Route component={NotFound} />
      </Switch>
      {location !== "/" && !isAdmin && <FeedbackButton />}
    </>
  );
}

type AuthState = "loading" | "authed" | "unauthed";

function AuthGate({ children }: { children: React.ReactNode }) {
  const [auth, setAuth] = useState<AuthState>("loading");

  useEffect(() => {
    fetch(`${BASE}api/me`, { credentials: "include" })
      .then((res) => setAuth(res.ok ? "authed" : "unauthed"))
      .catch(() => setAuth("unauthed"));
  }, []);

  if (auth === "loading") {
    return (
      <div className="min-h-[100dvh] bg-background flex items-center justify-center">
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
            <OfflineBanner />
            <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, "")}>
              <AuthGate>
                <MotivationalSplash />
                <AppRoutes />
              </AuthGate>
            </WouterRouter>
            <Toaster />
          </ChatHistoryProvider>
        </TooltipProvider>
      </QueryClientProvider>
    </ErrorBoundary>
  );
}

export default App;
