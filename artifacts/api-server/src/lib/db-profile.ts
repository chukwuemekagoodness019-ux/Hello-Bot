import { supabase } from "./supabase";

// ── Types ─────────────────────────────────────────────────────────────────────

export interface AcademicProfileData {
  institution: string | null;
  department: string | null;
  academicLevel: string | null;
  semester: string | null;
  studyGoals: string | null;
  examDates: string | null;
  weeklySchedule: string | null;
  personalNotes: string | null;
}

export interface CourseData {
  id: number;
  courseCode: string;
  courseTitle: string;
  description: string | null;
  createdAt: string;
}

// ── Cache (5-minute TTL — same pattern as weakness cache) ─────────────────────

interface ProfileCache {
  at: number;
  profile: AcademicProfileData | null;
  courses: Array<{ courseCode: string; courseTitle: string }>;
}

const CACHE_TTL_MS = 5 * 60 * 1000;
const profileCache = new Map<number, ProfileCache>();

export function clearProfileCache(userId: number): void {
  profileCache.delete(userId);
}

// ── Light read for AI context injection ───────────────────────────────────────

export async function getProfileForAI(
  userId: number,
): Promise<{ profile: AcademicProfileData | null; courses: Array<{ courseCode: string; courseTitle: string }> }> {
  const cached = profileCache.get(userId);
  if (cached && Date.now() - cached.at < CACHE_TTL_MS) {
    return { profile: cached.profile, courses: cached.courses };
  }
  try {
    const [profileRes, coursesRes] = await Promise.all([
      supabase
        .from("academic_profiles")
        .select("*")
        .eq("user_id", userId)
        .maybeSingle(),
      supabase
        .from("courses")
        .select("course_code, course_title")
        .eq("user_id", userId)
        .order("created_at", { ascending: true }),
    ]);

    const p = profileRes.data as Record<string, unknown> | null;
    const profile: AcademicProfileData | null = p
      ? {
          institution: (p.institution as string | null) ?? null,
          department: (p.department as string | null) ?? null,
          academicLevel: (p.academic_level as string | null) ?? null,
          semester: (p.semester as string | null) ?? null,
          studyGoals: (p.study_goals as string | null) ?? null,
          examDates: (p.exam_dates as string | null) ?? null,
          weeklySchedule: (p.weekly_schedule as string | null) ?? null,
          personalNotes: (p.personal_notes as string | null) ?? null,
        }
      : null;

    const courses = (coursesRes.data ?? []).map((r: Record<string, unknown>) => ({
      courseCode: r.course_code as string,
      courseTitle: r.course_title as string,
    }));

    profileCache.set(userId, { at: Date.now(), profile, courses });
    return { profile, courses };
  } catch {
    return { profile: cached?.profile ?? null, courses: cached?.courses ?? [] };
  }
}

// ── Full read for profile API route ───────────────────────────────────────────

export async function getFullProfile(
  userId: number,
): Promise<{ profile: AcademicProfileData | null; courses: CourseData[] }> {
  const [profileRes, coursesRes] = await Promise.all([
    supabase.from("academic_profiles").select("*").eq("user_id", userId).maybeSingle(),
    supabase
      .from("courses")
      .select("*")
      .eq("user_id", userId)
      .order("created_at", { ascending: true }),
  ]);

  const p = profileRes.data as Record<string, unknown> | null;
  const profile: AcademicProfileData | null = p
    ? {
        institution: (p.institution as string | null) ?? null,
        department: (p.department as string | null) ?? null,
        academicLevel: (p.academic_level as string | null) ?? null,
        semester: (p.semester as string | null) ?? null,
        studyGoals: (p.study_goals as string | null) ?? null,
        examDates: (p.exam_dates as string | null) ?? null,
        weeklySchedule: (p.weekly_schedule as string | null) ?? null,
        personalNotes: (p.personal_notes as string | null) ?? null,
      }
    : null;

  const courses: CourseData[] = (coursesRes.data ?? []).map((r: Record<string, unknown>) => ({
    id: r.id as number,
    courseCode: r.course_code as string,
    courseTitle: r.course_title as string,
    description: (r.description as string | null) ?? null,
    createdAt: r.created_at as string,
  }));

  return { profile, courses };
}
