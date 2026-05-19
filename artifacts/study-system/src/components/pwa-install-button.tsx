import { Download, Share, Plus, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { usePwaInstall } from "@/hooks/use-pwa-install";

export function PwaInstallButton() {
  const { canInstall, isIOS, install, showIOSGuide, closeIOSGuide } =
    usePwaInstall();

  if (!canInstall && !showIOSGuide) return null;

  return (
    <>
      {canInstall && (
        <Button
          size="icon"
          variant="ghost"
          onClick={install}
          title="Install app"
          aria-label="Install app to home screen"
          className="w-9 h-9 rounded-full text-primary hover:bg-primary/10"
          data-testid="button-pwa-install"
        >
          <Download className="w-5 h-5" />
        </Button>
      )}

      {showIOSGuide && isIOS && (
        <div
          className="fixed inset-0 z-[60] flex items-end sm:items-center justify-center bg-background/80 backdrop-blur-sm p-4 animate-in fade-in"
          role="dialog"
          aria-modal="true"
          onClick={() => closeIOSGuide(false)}
        >
          <div
            className="w-full max-w-sm bg-card border border-border rounded-2xl shadow-2xl p-6 space-y-4 animate-in slide-in-from-bottom-4"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start justify-between">
              <div>
                <h2 className="text-lg font-semibold">Install AI Study</h2>
                <p className="text-sm text-muted-foreground mt-1">
                  Add this app to your Home Screen for one-tap access.
                </p>
              </div>
              <Button
                size="icon"
                variant="ghost"
                className="w-8 h-8 -mt-1 -mr-2 shrink-0"
                onClick={() => closeIOSGuide(false)}
                aria-label="Close"
              >
                <X className="w-4 h-4" />
              </Button>
            </div>

            <ol className="space-y-3 text-sm">
              <li className="flex gap-3 items-start">
                <span className="flex items-center justify-center w-6 h-6 rounded-full bg-primary/15 text-primary text-xs font-bold shrink-0 mt-0.5">
                  1
                </span>
                <span className="flex-1">
                  Tap the{" "}
                  <Share className="inline w-4 h-4 text-primary align-text-bottom" />{" "}
                  <strong>Share</strong> button at the bottom of Safari.
                </span>
              </li>
              <li className="flex gap-3 items-start">
                <span className="flex items-center justify-center w-6 h-6 rounded-full bg-primary/15 text-primary text-xs font-bold shrink-0 mt-0.5">
                  2
                </span>
                <span className="flex-1">
                  Scroll and tap{" "}
                  <Plus className="inline w-4 h-4 text-primary align-text-bottom" />{" "}
                  <strong>Add to Home Screen</strong>.
                </span>
              </li>
              <li className="flex gap-3 items-start">
                <span className="flex items-center justify-center w-6 h-6 rounded-full bg-primary/15 text-primary text-xs font-bold shrink-0 mt-0.5">
                  3
                </span>
                <span className="flex-1">
                  Tap <strong>Add</strong> in the top-right corner — done.
                </span>
              </li>
            </ol>

            <div className="flex gap-2 pt-2">
              <Button
                variant="outline"
                className="flex-1"
                onClick={() => closeIOSGuide(true)}
              >
                Don't show again
              </Button>
              <Button className="flex-1" onClick={() => closeIOSGuide(false)}>
                Got it
              </Button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
