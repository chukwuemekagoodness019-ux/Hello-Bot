export type FeatureKey = "exam" | "quiz" | "voice" | "pdf_upload" | "image_upload" | "payments";

const FLAGS: Record<FeatureKey, boolean> = {
  exam: true,
  quiz: true,
  voice: true,
  pdf_upload: true,
  image_upload: true,
  payments: true,
};

export function getFlags(): Record<FeatureKey, boolean> {
  return { ...FLAGS };
}

export function setFlag(key: string, enabled: boolean): boolean {
  if (key in FLAGS) {
    (FLAGS as Record<string, boolean>)[key] = enabled;
    return true;
  }
  return false;
}

export function isFlagEnabled(key: FeatureKey): boolean {
  return FLAGS[key] !== false;
}
