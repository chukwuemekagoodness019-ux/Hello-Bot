import { Router, type IRouter } from "express";
import { sessionMiddleware } from "../lib/session";
import { supabase } from "../lib/supabase";
import { getFullProfile, clearProfileCache } from "../lib/db-profile";
import type { AcademicProfileData, CourseData } from "../lib/db-profile";

const router: IRouter = Router();

function throwIfError(error: unknown, ctx: string): void {
  if (error) {
    const msg = (error as { message?: string }).message ?? String(error);
    throw new Error(`Supabase ${ctx}: ${msg}`);
  }
}

function serializeProfile(p: AcademicProfileData) {
  return {
    institution: p.institution,
    department: p.department,
    academicLevel: p.academicLevel,
    semester: p.semester,
    studyGoals: p.studyGoals,
    examDates: p.examDates,
    weeklySchedule: p.weeklySchedule,
    personalNotes: p.personalNotes,
  };
}

function serializeCourse(c: CourseData) {
  return {
    id: c.id,
    courseCode: c.courseCode,
    courseTitle: c.courseTitle,
    description: c.description,
    createdAt: c.createdAt,
  };
}

// ── GET /api/profile ───────────────────────────────────────────────────────────

router.get("/profile", sessionMiddleware, async (req, res, next) => {
  try {
    const { profile, courses } = await getFullProfile(Number(req.user!.id));
    res.json({ profile: profile ? serializeProfile(profile) : null, courses: courses.map(serializeCourse) });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    // Gracefully handle missing tables (migration not yet applied) — return empty profile
    if (msg.includes("does not exist") || msg.includes("PGRST")) {
      res.json({ profile: null, courses: [] });
      return;
    }
    next(err);
  }
});

// ── PUT /api/profile ───────────────────────────────────────────────────────────

router.put("/profile", sessionMiddleware, async (req, res, next) => {
  try {
    const userId = Number(req.user!.id);
    const body = req.body as Record<string, unknown>;

    const patch: Record<string, unknown> = {
      user_id: userId,
      updated_at: new Date().toISOString(),
    };

    const fields: Array<[string, string]> = [
      ["institution", "institution"],
      ["department", "department"],
      ["academicLevel", "academic_level"],
      ["semester", "semester"],
      ["studyGoals", "study_goals"],
      ["examDates", "exam_dates"],
      ["weeklySchedule", "weekly_schedule"],
      ["personalNotes", "personal_notes"],
    ];

    for (const [jsKey, dbKey] of fields) {
      if (jsKey in body) patch[dbKey] = body[jsKey] ?? null;
    }

    const { data, error } = await supabase
      .from("academic_profiles")
      .upsert(patch, { onConflict: "user_id" })
      .select()
      .single();

    throwIfError(error, "upsertProfile");
    clearProfileCache(userId);

    const r = data as Record<string, unknown>;
    res.json({
      institution: r.institution ?? null,
      department: r.department ?? null,
      academicLevel: r.academic_level ?? null,
      semester: r.semester ?? null,
      studyGoals: r.study_goals ?? null,
      examDates: r.exam_dates ?? null,
      weeklySchedule: r.weekly_schedule ?? null,
      personalNotes: r.personal_notes ?? null,
    });
  } catch (err) {
    next(err);
  }
});

// ── POST /api/profile/courses ──────────────────────────────────────────────────

router.post("/profile/courses", sessionMiddleware, async (req, res, next) => {
  try {
    const userId = Number(req.user!.id);
    const body = req.body as Record<string, unknown>;

    const courseCode = String(body.courseCode ?? "").trim().toUpperCase();
    const courseTitle = String(body.courseTitle ?? "").trim();
    const description = body.description ? String(body.description).trim() : null;

    if (!courseCode || !courseTitle) {
      res.status(400).json({ error: "courseCode and courseTitle are required" });
      return;
    }

    const { data, error } = await supabase
      .from("courses")
      .insert({ user_id: userId, course_code: courseCode, course_title: courseTitle, description })
      .select()
      .single();

    throwIfError(error, "insertCourse");
    clearProfileCache(userId);

    const r = data as Record<string, unknown>;
    res.status(201).json({
      id: r.id,
      courseCode: r.course_code,
      courseTitle: r.course_title,
      description: r.description ?? null,
      createdAt: r.created_at,
    });
  } catch (err) {
    next(err);
  }
});

// ── PUT /api/profile/courses/:id ───────────────────────────────────────────────

router.put("/profile/courses/:id", sessionMiddleware, async (req, res, next) => {
  try {
    const userId = Number(req.user!.id);
    const courseId = Number(req.params.id);
    const body = req.body as Record<string, unknown>;

    const patch: Record<string, unknown> = {};
    if (body.courseCode) patch.course_code = String(body.courseCode).trim().toUpperCase();
    if (body.courseTitle) patch.course_title = String(body.courseTitle).trim();
    if ("description" in body) patch.description = body.description ? String(body.description).trim() : null;

    if (Object.keys(patch).length === 0) {
      res.status(400).json({ error: "Nothing to update" });
      return;
    }

    const { data, error } = await supabase
      .from("courses")
      .update(patch)
      .eq("id", courseId)
      .eq("user_id", userId)
      .select()
      .single();

    throwIfError(error, "updateCourse");
    if (!data) {
      res.status(404).json({ error: "Course not found" });
      return;
    }
    clearProfileCache(userId);

    const r = data as Record<string, unknown>;
    res.json({
      id: r.id,
      courseCode: r.course_code,
      courseTitle: r.course_title,
      description: r.description ?? null,
      createdAt: r.created_at,
    });
  } catch (err) {
    next(err);
  }
});

// ── DELETE /api/profile/courses/:id ───────────────────────────────────────────

router.delete("/profile/courses/:id", sessionMiddleware, async (req, res, next) => {
  try {
    const userId = Number(req.user!.id);
    const courseId = Number(req.params.id);

    const { error } = await supabase
      .from("courses")
      .delete()
      .eq("id", courseId)
      .eq("user_id", userId);

    throwIfError(error, "deleteCourse");
    clearProfileCache(userId);

    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

export default router;
