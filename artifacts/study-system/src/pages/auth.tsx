import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { GraduationCap, Eye, EyeOff } from "lucide-react";

const BASE = import.meta.env.BASE_URL as string;

type Tab = "login" | "register";

export default function AuthPage() {
  const [tab, setTab] = useState<Tab>("register");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const reset = () => {
    setEmail("");
    setPassword("");
    setDisplayName("");
    setError("");
    setShowPassword(false);
  };

  const switchTab = (t: Tab) => {
    setTab(t);
    reset();
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);

    const endpoint = tab === "register" ? "auth/register" : "auth/login";
    const body: Record<string, string> =
      tab === "register"
        ? { email, password, displayName }
        : { email, password };

    try {
      const res = await fetch(`${BASE}api/${endpoint}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(body),
      });

      const data = (await res.json().catch(() => ({}))) as Record<string, unknown>;

      if (!res.ok) {
        setError(String(data.error ?? "Something went wrong. Please try again."));
        return;
      }

      window.location.reload();
    } catch {
      setError("Network error. Please check your connection and try again.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-[100dvh] bg-background flex flex-col items-center justify-center px-4">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl glass border border-primary/30 shadow-xl shadow-indigo-900/20 mb-4">
            <GraduationCap className="w-7 h-7 text-primary" />
          </div>
          <h1 className="text-2xl font-bold tracking-tight text-white">Study AI</h1>
          <p className="text-sm text-slate-400 mt-1">Your AI-powered academic companion</p>
        </div>

        <div className="glass border border-white/8 rounded-2xl shadow-2xl shadow-black/40 overflow-hidden">
          <div className="flex border-b border-white/8">
            <button
              onClick={() => switchTab("register")}
              className={`flex-1 py-3 text-sm font-medium transition-all duration-150 ${
                tab === "register"
                  ? "text-white border-b-2 border-primary -mb-px"
                  : "text-slate-400 hover:text-slate-200"
              }`}
            >
              Create Account
            </button>
            <button
              onClick={() => switchTab("login")}
              className={`flex-1 py-3 text-sm font-medium transition-all duration-150 ${
                tab === "login"
                  ? "text-white border-b-2 border-primary -mb-px"
                  : "text-slate-400 hover:text-slate-200"
              }`}
            >
              Sign In
            </button>
          </div>

          <form onSubmit={handleSubmit} className="p-6 space-y-4">
            {tab === "register" && (
              <div className="space-y-1.5">
                <Label htmlFor="displayName" className="text-slate-300">Your Name</Label>
                <Input
                  id="displayName"
                  type="text"
                  placeholder="e.g. Amara Okonkwo"
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value)}
                  className="h-11 bg-white/5 border-white/10 text-slate-100 placeholder:text-slate-500 focus:border-primary/60"
                  autoComplete="name"
                />
              </div>
            )}

            <div className="space-y-1.5">
              <Label htmlFor="email" className="text-slate-300">Email Address</Label>
              <Input
                id="email"
                type="email"
                placeholder="you@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="h-11 bg-white/5 border-white/10 text-slate-100 placeholder:text-slate-500 focus:border-primary/60"
                required
                autoComplete={tab === "register" ? "email" : "username"}
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="password" className="text-slate-300">Password</Label>
              <div className="relative">
                <Input
                  id="password"
                  type={showPassword ? "text" : "password"}
                  placeholder={tab === "register" ? "At least 6 characters" : "Enter your password"}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="h-11 pr-10 bg-white/5 border-white/10 text-slate-100 placeholder:text-slate-500 focus:border-primary/60"
                  required
                  minLength={tab === "register" ? 6 : 1}
                  autoComplete={tab === "register" ? "new-password" : "current-password"}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((v) => !v)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300 transition-colors"
                  tabIndex={-1}
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            {error && (
              <p className="text-sm text-red-400 bg-red-500/10 border border-red-500/20 rounded-xl px-3 py-2">
                {error}
              </p>
            )}

            <Button
              type="submit"
              className="w-full h-11 text-sm font-semibold bg-primary hover:bg-indigo-500 text-white shadow-lg shadow-indigo-900/30 transition-all duration-150"
              disabled={loading}
            >
              {loading
                ? tab === "register"
                  ? "Creating account…"
                  : "Signing in…"
                : tab === "register"
                ? "Create Account"
                : "Sign In"}
            </Button>

            {tab === "register" && (
              <p className="text-xs text-slate-500 text-center leading-relaxed">
                By creating an account you agree to our terms of service. Your study data stays private.
              </p>
            )}
          </form>
        </div>

        <p className="text-center text-xs text-slate-500 mt-6">
          {tab === "register" ? (
            <>Already have an account?{" "}
              <button onClick={() => switchTab("login")} className="text-primary hover:text-indigo-400 transition-colors font-medium">Sign in</button>
            </>
          ) : (
            <>Don't have an account?{" "}
              <button onClick={() => switchTab("register")} className="text-primary hover:text-indigo-400 transition-colors font-medium">Create one</button>
            </>
          )}
        </p>
      </div>
    </div>
  );
}
