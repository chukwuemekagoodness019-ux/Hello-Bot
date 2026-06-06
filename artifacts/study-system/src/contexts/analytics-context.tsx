import { createContext, useContext, useCallback, type ReactNode } from "react";

export interface AnalyticsEvent {
  name: string;
  properties?: Record<string, string | number | boolean | null | undefined>;
  timestamp: string;
}

interface AnalyticsContextValue {
  trackEvent: (name: string, properties?: Record<string, string | number | boolean | null | undefined>) => void;
}

const AnalyticsContext = createContext<AnalyticsContextValue | null>(null);

function formatEvent(ev: AnalyticsEvent): string {
  const props = ev.properties
    ? " " + JSON.stringify(ev.properties)
    : "";
  return `[Analytics] ${ev.timestamp} — ${ev.name}${props}`;
}

export function AnalyticsProvider({ children }: { children: ReactNode }) {
  const trackEvent = useCallback(
    (name: string, properties?: Record<string, string | number | boolean | null | undefined>) => {
      const ev: AnalyticsEvent = {
        name,
        properties,
        timestamp: new Date().toISOString(),
      };

      try {
        console.log(formatEvent(ev));

        const stored = sessionStorage.getItem("_analytics_events");
        const queue: AnalyticsEvent[] = stored ? (JSON.parse(stored) as AnalyticsEvent[]) : [];
        queue.push(ev);
        if (queue.length > 100) queue.splice(0, queue.length - 100);
        sessionStorage.setItem("_analytics_events", JSON.stringify(queue));
      } catch {
      }
    },
    [],
  );

  return (
    <AnalyticsContext.Provider value={{ trackEvent }}>
      {children}
    </AnalyticsContext.Provider>
  );
}

export function useAnalytics(): AnalyticsContextValue {
  const ctx = useContext(AnalyticsContext);
  if (!ctx) throw new Error("useAnalytics must be used inside <AnalyticsProvider>");
  return ctx;
}
