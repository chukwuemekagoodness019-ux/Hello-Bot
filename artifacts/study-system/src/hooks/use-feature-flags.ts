import { useQuery } from "@tanstack/react-query";

const BASE = import.meta.env.BASE_URL as string;

export type FeatureFlags = {
  exam: boolean;
  quiz: boolean;
  voice: boolean;
  pdf_upload: boolean;
  image_upload: boolean;
  payments: boolean;
};

const ALL_ENABLED: FeatureFlags = {
  exam: true,
  quiz: true,
  voice: true,
  pdf_upload: true,
  image_upload: true,
  payments: true,
};

async function fetchFlags(): Promise<FeatureFlags> {
  const res = await fetch(`${BASE}api/flags`);
  if (!res.ok) throw new Error("Failed to fetch flags");
  return res.json() as Promise<FeatureFlags>;
}

export function useFeatureFlags(): { flags: FeatureFlags; isLoaded: boolean } {
  const { data, isSuccess } = useQuery({
    queryKey: ["feature-flags"],
    queryFn: fetchFlags,
    staleTime: 30_000,
    retry: false,
  });

  return {
    flags: data ?? ALL_ENABLED,
    isLoaded: isSuccess,
  };
}
