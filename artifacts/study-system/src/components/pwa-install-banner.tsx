import { useState } from "react";
import { Download, X } from "lucide-react";
import { Button } from "@/components/ui/button";

const DISMISSED_KEY = "pwa-banner-dismissed";

interface PwaInstallBannerProps {
  canInstall: boolean;
  install: () => Promise<void>;
}

export function PwaInstallBanner({ canInstall, install }: PwaInstallBannerProps) {
  const [dismissed, setDismissed] = useState(
    () => typeof window !== "undefined" && localStorage.getItem(DISMISSED_KEY) === "1",
  );

  if (!canInstall || dismissed) return null;

  const handleDismiss = () => {
    setDismissed(true);
    localStorage.setItem(DISMISSED_KEY, "1");
  };

  return (
    <div className="mx-3 mt-2.5 flex items-center gap-2.5 glass border border-primary/25 rounded-xl px-3 py-2 shrink-0 animate-in slide-in-from-top-2 duration-200">
      <Download className="w-4 h-4 text-primary shrink-0" />
      <div className="flex-1 min-w-0">
        <p className="text-slate-200 font-medium text-[12px] leading-tight">Install AI Study Buddy</p>
        <p className="text-slate-500 text-[11px]">Add to home screen for fast, offline access</p>
      </div>
      <Button
        size="sm"
        className="h-7 px-3 text-[11px] font-semibold bg-primary hover:bg-indigo-500 text-white shrink-0 shadow-md shadow-indigo-900/30"
        onClick={install}
      >
        Install
      </Button>
      <button
        onClick={handleDismiss}
        className="text-slate-500 hover:text-slate-300 transition-colors shrink-0 p-0.5"
        aria-label="Dismiss install banner"
      >
        <X className="w-3.5 h-3.5" />
      </button>
    </div>
  );
}
