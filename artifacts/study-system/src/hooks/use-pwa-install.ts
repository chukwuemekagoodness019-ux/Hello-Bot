import { useEffect, useState, useCallback } from "react";

interface BeforeInstallPromptEvent extends Event {
  readonly platforms: string[];
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed"; platform: string }>;
}

const IOS_DISMISS_KEY = "pwa-ios-instructions-dismissed";

function detectIOS(): boolean {
  if (typeof window === "undefined") return false;
  const ua = window.navigator.userAgent;
  const isIPad =
    /iPad/.test(ua) ||
    (navigator.platform === "MacIntel" && (navigator as any).maxTouchPoints > 1);
  return /iPhone|iPod/.test(ua) || isIPad;
}

function detectStandalone(): boolean {
  if (typeof window === "undefined") return false;
  if (window.matchMedia?.("(display-mode: standalone)").matches) return true;
  if ((window.navigator as any).standalone === true) return true;
  return false;
}

export function usePwaInstall() {
  const [deferredPrompt, setDeferredPrompt] =
    useState<BeforeInstallPromptEvent | null>(null);
  const [isInstalled, setIsInstalled] = useState<boolean>(detectStandalone());
  const [showIOSGuide, setShowIOSGuide] = useState<boolean>(false);

  const isIOS = detectIOS();

  useEffect(() => {
    const handler = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e as BeforeInstallPromptEvent);
    };
    const installed = () => {
      setIsInstalled(true);
      setDeferredPrompt(null);
    };
    window.addEventListener("beforeinstallprompt", handler);
    window.addEventListener("appinstalled", installed);
    return () => {
      window.removeEventListener("beforeinstallprompt", handler);
      window.removeEventListener("appinstalled", installed);
    };
  }, []);

  // iOS Safari has no install event — show our own button unless the user has
  // dismissed the guide before, and unless the app is already installed.
  const iosDismissed =
    typeof window !== "undefined" &&
    window.localStorage.getItem(IOS_DISMISS_KEY) === "1";

  const canInstall =
    !isInstalled && (deferredPrompt !== null || (isIOS && !iosDismissed));

  const install = useCallback(async () => {
    if (deferredPrompt) {
      try {
        await deferredPrompt.prompt();
        const choice = await deferredPrompt.userChoice;
        if (choice.outcome === "accepted") {
          setIsInstalled(true);
        }
        setDeferredPrompt(null);
      } catch {
        // User cancelled or browser refused — silently ignore.
      }
      return;
    }
    if (isIOS) {
      setShowIOSGuide(true);
    }
  }, [deferredPrompt, isIOS]);

  const closeIOSGuide = useCallback((rememberDismiss: boolean) => {
    setShowIOSGuide(false);
    if (rememberDismiss && typeof window !== "undefined") {
      window.localStorage.setItem(IOS_DISMISS_KEY, "1");
    }
  }, []);

  return {
    canInstall,
    isInstalled,
    isIOS,
    install,
    showIOSGuide,
    closeIOSGuide,
  };
}
