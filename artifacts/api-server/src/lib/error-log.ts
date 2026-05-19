const MAX_ENTRIES = 100;

export interface ErrorEntry {
  ts: string;
  provider: string;
  stage: string;
  message: string;
}

const log: ErrorEntry[] = [];

export function pushError(entry: ErrorEntry): void {
  log.unshift(entry);
  if (log.length > MAX_ENTRIES) log.pop();
}

export function getErrorLog(): ErrorEntry[] {
  return [...log];
}

export function clearErrorLog(): void {
  log.length = 0;
}
