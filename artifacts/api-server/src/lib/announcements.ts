export type AnnouncementType = "info" | "warning" | "error";

export interface Announcement {
  id: string;
  text: string;
  type: AnnouncementType;
}

let current: Announcement | null = null;

export function getAnnouncement(): Announcement | null {
  return current;
}

export function setAnnouncement(a: Announcement): void {
  current = a;
}

export function clearAnnouncement(): void {
  current = null;
}
