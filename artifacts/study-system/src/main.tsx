import { createRoot } from "react-dom/client";
import App from "./App";
import "./index.css";

// Capture the PWA install prompt before React renders to eliminate the race
// window between DOMContentLoaded (when React mounts) and the browser firing
// beforeinstallprompt (which can arrive during or just after first render).
// The usePwaInstall hook reads this global on mount and consumes it.
if (typeof window !== "undefined") {
  window.addEventListener(
    "beforeinstallprompt",
    (e) => {
      e.preventDefault();
      (window as any).__pwaInstallPrompt = e;
    },
    { once: true },
  );
}

createRoot(document.getElementById("root")!).render(<App />);

// Register the service worker (production builds only — keeps dev HMR clean).
if ("serviceWorker" in navigator && import.meta.env.PROD) {
  window.addEventListener("load", () => {
    const swUrl = `${import.meta.env.BASE_URL}sw.js`;
    navigator.serviceWorker.register(swUrl, { scope: import.meta.env.BASE_URL }).catch(() => {
      // Silently ignore — SW is progressive enhancement, app works without it.
    });
  });
}
