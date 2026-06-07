import { useState, useEffect, useCallback } from "react";
import { useLocation } from "wouter";
import {
  ArrowLeft, Plus, Pencil, Trash2, Save, User, BookOpen, Loader2, Check,
  Home, MessageSquare, GraduationCap, FileText,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";

const BASE = import.meta.env.BASE_URL as string;

// ── Types ──────────────────────────────────────────────────────────────────────

interface AcademicProfile {
  institution: string | null;
  department: string | null;
  academicLevel: string | null;
  semester: string | null;
  studyGoals: string | null;
  examDates: string | null;
  weeklySchedule: string | null;
  personalNotes: string | null;
}

interface Course {
  id: number;
  courseCode: string;
  courseTitle: string;
  description: string | null;
  createdAt: string;
}

const EMPTY_PROFILE: AcademicProfile = {
  institution: "",
  department: "",
  academicLevel: "",
  semester: "",
  studyGoals: "",
  examDates: "",
  weeklySchedule: "",
  personalNotes: "",
};

// ── Helpers ────────────────────────────────────────────────────────────────────

async function apiFetch<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    ...options,
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({})) as { error?: string };
    throw new Error(err.error ?? `Request failed: ${res.status}`);
  }
  return res.json() as Promise<T>;
}

// ── Component ──────────────────────────────────────────────────────────────────

export default function ProfilePage() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  const [profile, setProfile] = useState<AcademicProfile>(EMPTY_PROFILE);
  const [courses, setCourses] = useState<Course[]>([]);

  const [newCode, setNewCode] = useState("");
  const [newTitle, setNewTitle] = useState("");
  const [newDesc, setNewDesc] = useState("");
  const [addingCourse, setAddingCourse] = useState(false);
  const [courseFormOpen, setCourseFormOpen] = useState(false);

  const [editingId, setEditingId] = useState<number | null>(null);
  const [editCode, setEditCode] = useState("");
  const [editTitle, setEditTitle] = useState("");
  const [editDesc, setEditDesc] = useState("");
  const [editSaving, setEditSaving] = useState(false);

  // ── Load data ────────────────────────────────────────────────────────────────

  const loadProfile = useCallback(async () => {
    try {
      const data = await apiFetch<{ profile: AcademicProfile | null; courses: Course[] }>("api/profile");
      setProfile(data.profile ? {
        institution: data.profile.institution ?? "",
        department: data.profile.department ?? "",
        academicLevel: data.profile.academicLevel ?? "",
        semester: data.profile.semester ?? "",
        studyGoals: data.profile.studyGoals ?? "",
        examDates: data.profile.examDates ?? "",
        weeklySchedule: data.profile.weeklySchedule ?? "",
        personalNotes: data.profile.personalNotes ?? "",
      } : EMPTY_PROFILE);
      setCourses(data.courses ?? []);
    } catch {
      toast({ title: "Could not load profile", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => { void loadProfile(); }, [loadProfile]);

  // ── Save profile ─────────────────────────────────────────────────────────────

  const handleSave = async () => {
    setSaving(true);
    try {
      await apiFetch("api/profile", {
        method: "PUT",
        body: JSON.stringify(profile),
      });
      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
      toast({ title: "Profile saved" });
    } catch (err) {
      toast({ title: (err as Error).message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const field = (key: keyof AcademicProfile) => ({
    value: profile[key] ?? "",
    onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
      setProfile((p) => ({ ...p, [key]: e.target.value })),
  });

  // ── Add course ───────────────────────────────────────────────────────────────

  const handleAddCourse = async () => {
    if (!newCode.trim() || !newTitle.trim()) {
      toast({ title: "Course code and title are required", variant: "destructive" });
      return;
    }
    setAddingCourse(true);
    try {
      const course = await apiFetch<Course>("api/profile/courses", {
        method: "POST",
        body: JSON.stringify({ courseCode: newCode, courseTitle: newTitle, description: newDesc || null }),
      });
      setCourses((prev) => [...prev, course]);
      setNewCode("");
      setNewTitle("");
      setNewDesc("");
      setCourseFormOpen(false);
      toast({ title: `${course.courseCode} added` });
    } catch (err) {
      toast({ title: (err as Error).message, variant: "destructive" });
    } finally {
      setAddingCourse(false);
    }
  };

  // ── Edit course ──────────────────────────────────────────────────────────────

  const startEdit = (c: Course) => {
    setEditingId(c.id);
    setEditCode(c.courseCode);
    setEditTitle(c.courseTitle);
    setEditDesc(c.description ?? "");
  };

  const handleSaveEdit = async () => {
    if (!editingId) return;
    setEditSaving(true);
    try {
      const updated = await apiFetch<Course>(`api/profile/courses/${editingId}`, {
        method: "PUT",
        body: JSON.stringify({ courseCode: editCode, courseTitle: editTitle, description: editDesc || null }),
      });
      setCourses((prev) => prev.map((c) => (c.id === editingId ? updated : c)));
      setEditingId(null);
      toast({ title: `${updated.courseCode} updated` });
    } catch (err) {
      toast({ title: (err as Error).message, variant: "destructive" });
    } finally {
      setEditSaving(false);
    }
  };

  // ── Delete course ────────────────────────────────────────────────────────────

  const handleDelete = async (id: number, code: string) => {
    try {
      await apiFetch(`api/profile/courses/${id}`, { method: "DELETE" });
      setCourses((prev) => prev.filter((c) => c.id !== id));
      toast({ title: `${code} removed` });
    } catch (err) {
      toast({ title: (err as Error).message, variant: "destructive" });
    }
  };

  // ── Render ───────────────────────────────────────────────────────────────────

  if (loading) {
    return (
      <div className="h-full flex items-center justify-center bg-background">
        <Loader2 className="w-6 h-6 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="h-full overflow-y-auto bg-background">
      <div className="max-w-2xl mx-auto px-4 py-6 pb-24">

        {/* Header */}
        <div className="flex items-center gap-3 mb-8">
          <Button variant="ghost" size="icon" className="w-9 h-9 shrink-0" onClick={() => setLocation("/")}>
            <ArrowLeft className="w-4 h-4" />
          </Button>
          <div>
            <h1 className="text-xl font-bold tracking-tight flex items-center gap-2">
              <User className="w-5 h-5 text-primary" />
              Academic Profile
            </h1>
            <p className="text-sm text-muted-foreground mt-0.5">
              Your profile is used by the AI to personalize coaching
            </p>
          </div>
        </div>

        {/* ── Section 1: Academic Profile ──────────────────────────────────── */}
        <section className="rounded-2xl border border-white/10 bg-white/[0.03] p-5 mb-6">
          <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide mb-4">
            Academic Details
          </h2>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label htmlFor="institution" className="text-sm">Institution</Label>
              <Input
                id="institution"
                placeholder="e.g. University of Lagos"
                className="bg-white/5 border-white/10"
                {...field("institution")}
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="department" className="text-sm">Department</Label>
              <Input
                id="department"
                placeholder="e.g. Computer Science"
                className="bg-white/5 border-white/10"
                {...field("department")}
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="level" className="text-sm">Academic Level</Label>
              <Input
                id="level"
                placeholder="e.g. 300 Level, Year 2, Postgraduate"
                className="bg-white/5 border-white/10"
                {...field("academicLevel")}
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="semester" className="text-sm">Current Semester</Label>
              <Input
                id="semester"
                placeholder="e.g. First Semester 2025/2026"
                className="bg-white/5 border-white/10"
                {...field("semester")}
              />
            </div>
          </div>

          <div className="mt-4 space-y-1.5">
            <Label htmlFor="goals" className="text-sm">Study Goals <span className="text-muted-foreground font-normal">(optional)</span></Label>
            <Textarea
              id="goals"
              placeholder="e.g. Pass all exams with distinction, master algorithms before finals"
              className="bg-white/5 border-white/10 resize-none"
              rows={2}
              {...field("studyGoals")}
            />
          </div>

          <div className="mt-4 space-y-1.5">
            <Label htmlFor="examDates" className="text-sm">Upcoming Exam Dates <span className="text-muted-foreground font-normal">(optional)</span></Label>
            <Input
              id="examDates"
              placeholder="e.g. COS 301 — Jan 15, STA 211 — Jan 17"
              className="bg-white/5 border-white/10"
              {...field("examDates")}
            />
          </div>

          <div className="mt-4 space-y-1.5">
            <Label htmlFor="schedule" className="text-sm">Weekly Study Schedule <span className="text-muted-foreground font-normal">(optional)</span></Label>
            <Input
              id="schedule"
              placeholder="e.g. Mon/Wed/Fri evenings 7–10pm"
              className="bg-white/5 border-white/10"
              {...field("weeklySchedule")}
            />
          </div>

          <div className="mt-4 space-y-1.5">
            <Label htmlFor="notes" className="text-sm">Personal Academic Notes <span className="text-muted-foreground font-normal">(optional)</span></Label>
            <Textarea
              id="notes"
              placeholder="Any notes for the AI about how you study best, topics to focus on, etc."
              className="bg-white/5 border-white/10 resize-none"
              rows={2}
              {...field("personalNotes")}
            />
          </div>

          <div className="mt-5 flex justify-end">
            <Button
              onClick={handleSave}
              disabled={saving}
              className="gap-2 min-w-[110px]"
            >
              {saving ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : saved ? (
                <Check className="w-4 h-4" />
              ) : (
                <Save className="w-4 h-4" />
              )}
              {saved ? "Saved!" : "Save Profile"}
            </Button>
          </div>
        </section>

        {/* ── Section 2: Course Registry ───────────────────────────────────── */}
        <section className="rounded-2xl border border-white/10 bg-white/[0.03] p-5">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide flex items-center gap-2">
              <BookOpen className="w-4 h-4" />
              Registered Courses
            </h2>
            <Button
              size="sm"
              variant="outline"
              className="gap-1.5 text-xs h-8"
              onClick={() => setCourseFormOpen((v) => !v)}
            >
              <Plus className="w-3.5 h-3.5" />
              Add Course
            </Button>
          </div>

          {/* Add course form */}
          {courseFormOpen && (
            <div className="mb-4 rounded-xl border border-primary/20 bg-primary/5 p-4 space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label className="text-xs">Course Code</Label>
                  <Input
                    placeholder="e.g. COS 301"
                    className="bg-white/5 border-white/10 h-9 text-sm"
                    value={newCode}
                    onChange={(e) => setNewCode(e.target.value)}
                    onKeyDown={(e) => { if (e.key === "Enter") void handleAddCourse(); }}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">Course Title</Label>
                  <Input
                    placeholder="e.g. Software Engineering"
                    className="bg-white/5 border-white/10 h-9 text-sm"
                    value={newTitle}
                    onChange={(e) => setNewTitle(e.target.value)}
                    onKeyDown={(e) => { if (e.key === "Enter") void handleAddCourse(); }}
                  />
                </div>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Description <span className="text-muted-foreground">(optional)</span></Label>
                <Input
                  placeholder="Brief description or focus area"
                  className="bg-white/5 border-white/10 h-9 text-sm"
                  value={newDesc}
                  onChange={(e) => setNewDesc(e.target.value)}
                />
              </div>
              <div className="flex gap-2 justify-end">
                <Button size="sm" variant="ghost" className="text-xs" onClick={() => { setCourseFormOpen(false); setNewCode(""); setNewTitle(""); setNewDesc(""); }}>
                  Cancel
                </Button>
                <Button size="sm" className="text-xs gap-1.5" onClick={handleAddCourse} disabled={addingCourse}>
                  {addingCourse ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Plus className="w-3.5 h-3.5" />}
                  Add
                </Button>
              </div>
            </div>
          )}

          {/* Course list */}
          {courses.length === 0 ? (
            <div className="text-center py-8 text-sm text-muted-foreground">
              <BookOpen className="w-8 h-8 mx-auto mb-2 opacity-30" />
              No courses registered yet.
              <br />
              Add your courses so the AI can personalize your coaching.
            </div>
          ) : (
            <div className="space-y-2">
              {courses.map((c) =>
                editingId === c.id ? (
                  // Edit inline
                  <div key={c.id} className="rounded-xl border border-primary/20 bg-primary/5 p-3 space-y-2">
                    <div className="grid grid-cols-2 gap-2">
                      <Input
                        className="bg-white/5 border-white/10 h-8 text-sm"
                        value={editCode}
                        onChange={(e) => setEditCode(e.target.value)}
                      />
                      <Input
                        className="bg-white/5 border-white/10 h-8 text-sm"
                        value={editTitle}
                        onChange={(e) => setEditTitle(e.target.value)}
                      />
                    </div>
                    <Input
                      className="bg-white/5 border-white/10 h-8 text-sm"
                      placeholder="Description (optional)"
                      value={editDesc}
                      onChange={(e) => setEditDesc(e.target.value)}
                    />
                    <div className="flex gap-2 justify-end">
                      <Button size="sm" variant="ghost" className="text-xs h-7" onClick={() => setEditingId(null)}>
                        Cancel
                      </Button>
                      <Button size="sm" className="text-xs h-7 gap-1" onClick={handleSaveEdit} disabled={editSaving}>
                        {editSaving ? <Loader2 className="w-3 h-3 animate-spin" /> : <Check className="w-3 h-3" />}
                        Save
                      </Button>
                    </div>
                  </div>
                ) : (
                  // Display row
                  <div
                    key={c.id}
                    className="flex items-center justify-between rounded-xl border border-white/8 bg-white/[0.02] px-4 py-3 group"
                  >
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-sm font-semibold text-primary">{c.courseCode}</span>
                        <span className="text-sm text-foreground truncate">{c.courseTitle}</span>
                      </div>
                      {c.description && (
                        <p className="text-xs text-muted-foreground mt-0.5 truncate">{c.description}</p>
                      )}
                    </div>
                    <div className="flex items-center gap-1 ml-2 opacity-0 group-hover:opacity-100 transition-opacity">
                      <Button
                        size="icon"
                        variant="ghost"
                        className="w-7 h-7 text-slate-400 hover:text-slate-200"
                        onClick={() => startEdit(c)}
                        title="Edit"
                      >
                        <Pencil className="w-3.5 h-3.5" />
                      </Button>
                      <Button
                        size="icon"
                        variant="ghost"
                        className="w-7 h-7 text-slate-400 hover:text-red-400"
                        onClick={() => void handleDelete(c.id, c.courseCode)}
                        title="Remove"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </Button>
                    </div>
                  </div>
                )
              )}
            </div>
          )}
        </section>
      </div>
      {/* Mobile bottom nav */}
      <nav className="fixed bottom-0 inset-x-0 z-20 border-t border-white/8 flex md:hidden nav-safe" style={{ background: "rgba(9,5,20,0.98)" }}>
        <button className="flex-1 flex flex-col items-center justify-center gap-0.5 text-slate-500 hover:text-slate-200 transition-colors" onClick={() => setLocation("/")}>
          <Home className="w-5 h-5" /><span className="text-[10px] font-medium">Home</span>
        </button>
        <button className="flex-1 flex flex-col items-center justify-center gap-0.5 text-slate-500 hover:text-slate-200 transition-colors" onClick={() => setLocation("/chat")}>
          <MessageSquare className="w-5 h-5" /><span className="text-[10px] font-medium">Chat</span>
        </button>
        <button className="flex-1 flex flex-col items-center justify-center gap-0.5 text-slate-500 hover:text-slate-200 transition-colors" onClick={() => setLocation("/quiz")}>
          <GraduationCap className="w-5 h-5" /><span className="text-[10px] font-medium">Quiz</span>
        </button>
        <button className="flex-1 flex flex-col items-center justify-center gap-0.5 text-slate-500 hover:text-slate-200 transition-colors" onClick={() => setLocation("/exam")}>
          <FileText className="w-5 h-5" /><span className="text-[10px] font-medium">Exam</span>
        </button>
        <button className="flex-1 flex flex-col items-center justify-center gap-0.5 text-primary">
          <User className="w-5 h-5" /><span className="text-[10px] font-medium">Profile</span>
        </button>
      </nav>
    </div>
  );
}
