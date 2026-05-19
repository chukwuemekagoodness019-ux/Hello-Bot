import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { X } from "lucide-react";

const BASE = import.meta.env.BASE_URL as string;

interface Announcement {
  id: string;
  text: string;
  type: "info" | "warning" | "error";
}

const typeStyles: Record<string, string> = {
  info: "bg-blue-500/10 border-blue-500/30 text-blue-300",
  warning: "bg-yellow-500/10 border-yellow-500/30 text-yellow-300",
  error: "bg-red-500/10 border-red-500/30 text-red-300",
};

export function AnnouncementBanner() {
  const [dismissedId, setDismissedId] = useState<string | null>(null);

  const { data } = useQuery<Announcement | null>({
    queryKey: ["announcement"],
    queryFn: async () => {
      const res = await fetch(`${BASE}api/announcement`);
      if (!res.ok) return null;
      return res.json();
    },
    refetchInterval: 5 * 60_000,
    staleTime: 60_000,
  });

  if (!data || data.id === dismissedId) return null;

  return (
    <div
      className={`w-full px-4 py-2.5 border-b flex items-start justify-between gap-3 text-sm ${typeStyles[data.type] ?? typeStyles.info}`}
      role="alert"
    >
      <p className="flex-1 leading-snug">{data.text}</p>
      <button
        onClick={() => setDismissedId(data.id)}
        className="shrink-0 mt-0.5 opacity-60 hover:opacity-100 transition-opacity"
        aria-label="Dismiss announcement"
      >
        <X className="w-4 h-4" />
      </button>
    </div>
  );
}
