import { useState, useEffect } from "react";
import { WifiOff } from "lucide-react";

export function OfflineBanner() {
  const [isOffline, setIsOffline] = useState(!navigator.onLine);

  useEffect(() => {
    const goOffline = () => setIsOffline(true);
    const goOnline = () => setIsOffline(false);
    window.addEventListener("offline", goOffline);
    window.addEventListener("online", goOnline);
    return () => {
      window.removeEventListener("offline", goOffline);
      window.removeEventListener("online", goOnline);
    };
  }, []);

  if (!isOffline) return null;

  return (
    <div className="w-full bg-yellow-500/15 border-b border-yellow-500/30 px-4 py-2.5 flex items-center justify-center gap-2 text-xs text-yellow-600 dark:text-yellow-400 z-50 relative">
      <WifiOff className="w-3.5 h-3.5 shrink-0" />
      <span>Offline mode — viewing saved chats only. AI features are unavailable.</span>
    </div>
  );
}

export function useIsOffline(): boolean {
  const [isOffline, setIsOffline] = useState(!navigator.onLine);
  useEffect(() => {
    const goOffline = () => setIsOffline(true);
    const goOnline = () => setIsOffline(false);
    window.addEventListener("offline", goOffline);
    window.addEventListener("online", goOnline);
    return () => {
      window.removeEventListener("offline", goOffline);
      window.removeEventListener("online", goOnline);
    };
  }, []);
  return isOffline;
}
