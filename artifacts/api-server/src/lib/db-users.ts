import { supabase } from "./supabase";

// ── Types ─────────────────────────────────────────────────────────────────────
// Mirrors lib/db/src/schema/users.ts but uses camelCase to match Drizzle's
// inferred type, so all existing route code continues to work without changes.

export interface User {
  id: string | number;
  email: string | null;
  passwordHash: string | null;
  displayName: string | null;
  createdAt: Date;
  lastActiveAt: Date | null;
  isPremium: boolean;
  premiumUntil: Date | null;
  messagesUsedToday: number;
  quizzesUsedToday: number;
  voiceUsedToday: number;
  lastResetDate: string;
  currentStreak: number;
  bestStreak: number;
  bestScore: number;
  lastActiveDate: string | null;
}

export interface Payment {
  id: number;
  userId: string | number;
  plan: string;
  transactionId: string;
  screenshotName: string | null;
  /** Either a Supabase Storage public URL (new) or a base64-encoded string (legacy). */
  screenshotData: string | null;
  status: string;
  createdAt: Date;
}

export interface QuizAttempt {
  id: number;
  userId: string | number;
  subject: string;
  score: number;
  total: number;
  percent: number;
  createdAt: Date;
}

export interface Feedback {
  id: number;
  userId: string | number | null;
  category: string;
  message: string;
  status: string;
  createdAt: Date;
}

// ── Row → Domain mappers ───────────────────────────────────────────────────────

function toUser(row: Record<string, unknown>): User {
  return {
    id: row.id as string | number,
    email: (row.email as string | null) ?? null,
    passwordHash: (row.password_hash as string | null) ?? null,
    displayName: (row.display_name as string | null) ?? null,
    createdAt: new Date(row.created_at as string),
    lastActiveAt: row.last_active_at ? new Date(row.last_active_at as string) : null,
    isPremium: (row.is_premium as boolean) ?? false,
    premiumUntil: row.premium_until ? new Date(row.premium_until as string) : null,
    messagesUsedToday: (row.messages_used_today as number) ?? 0,
    quizzesUsedToday: (row.quizzes_used_today as number) ?? 0,
    voiceUsedToday: (row.voice_used_today as number) ?? 0,
    lastResetDate: (row.last_reset_date as string) ?? new Date().toISOString().slice(0, 10),
    currentStreak: (row.current_streak as number) ?? 0,
    bestStreak: (row.best_streak as number) ?? 0,
    bestScore: (row.best_score as number) ?? 0,
    lastActiveDate: (row.last_active_date as string | null) ?? null,
  };
}

function toPayment(row: Record<string, unknown>): Payment {
  return {
    id: row.id as number,
    userId: row.user_id as string | number,
    plan: row.plan as string,
    transactionId: row.transaction_id as string,
    screenshotName: (row.screenshot_name as string | null) ?? null,
    screenshotData: (row.screenshot_data as string | null) ?? null,
    status: row.status as string,
    createdAt: new Date(row.created_at as string),
  };
}

function toFeedback(row: Record<string, unknown>): Feedback {
  return {
    id: row.id as number,
    userId: (row.user_id as string | number | null) ?? null,
    category: row.category as string,
    message: row.message as string,
    status: row.status as string,
    createdAt: new Date(row.created_at as string),
  };
}

// ── Error helper ──────────────────────────────────────────────────────────────

function throwIfError(error: unknown, context: string): void {
  if (error) {
    const msg = (error as { message?: string }).message ?? String(error);
    throw new Error(`Supabase ${context}: ${msg}`);
  }
}

// ── User queries ──────────────────────────────────────────────────────────────

export async function getUserById(id: string | number): Promise<User | null> {
  const { data, error } = await supabase.from("users").select("*").eq("id", id).limit(1).maybeSingle();
  throwIfError(error, "getUserById");
  return data ? toUser(data as Record<string, unknown>) : null;
}

export async function getUserByEmail(email: string): Promise<User | null> {
  const { data, error } = await supabase.from("users").select("*").eq("email", email).limit(1).maybeSingle();
  throwIfError(error, "getUserByEmail");
  return data ? toUser(data as Record<string, unknown>) : null;
}

export async function userEmailExists(email: string): Promise<boolean> {
  const { data, error } = await supabase.from("users").select("id").eq("email", email).limit(1).maybeSingle();
  throwIfError(error, "userEmailExists");
  return data !== null;
}

export async function createUser(values: {
  email: string;
  passwordHash: string;
  displayName: string | null;
}): Promise<User> {
  const today = new Date().toISOString().slice(0, 10);
  const { data, error } = await supabase
    .from("users")
    .insert({
      email: values.email,
      password_hash: values.passwordHash,
      display_name: values.displayName,
      last_reset_date: today,
    })
    .select()
    .single();
  throwIfError(error, "createUser");
  return toUser(data as Record<string, unknown>);
}

export async function updateUser(
  id: string | number,
  values: Partial<{
    messagesUsedToday: number;
    quizzesUsedToday: number;
    voiceUsedToday: number;
    lastResetDate: string;
    isPremium: boolean;
    premiumUntil: Date | null;
    currentStreak: number;
    bestStreak: number;
    bestScore: number;
    lastActiveDate: string;
  }>,
): Promise<User> {
  const patch: Record<string, unknown> = {};
  if (values.messagesUsedToday !== undefined) patch.messages_used_today = values.messagesUsedToday;
  if (values.quizzesUsedToday !== undefined) patch.quizzes_used_today = values.quizzesUsedToday;
  if (values.voiceUsedToday !== undefined) patch.voice_used_today = values.voiceUsedToday;
  if (values.lastResetDate !== undefined) patch.last_reset_date = values.lastResetDate;
  if (values.isPremium !== undefined) patch.is_premium = values.isPremium;
  if ("premiumUntil" in values) patch.premium_until = values.premiumUntil ? values.premiumUntil.toISOString() : null;
  if (values.currentStreak !== undefined) patch.current_streak = values.currentStreak;
  if (values.bestStreak !== undefined) patch.best_streak = values.bestStreak;
  if (values.bestScore !== undefined) patch.best_score = values.bestScore;
  if (values.lastActiveDate !== undefined) patch.last_active_date = values.lastActiveDate;

  const { data, error } = await supabase.from("users").update(patch).eq("id", id).select().single();
  throwIfError(error, "updateUser");
  return toUser(data as Record<string, unknown>);
}

// ── Quiz attempts ─────────────────────────────────────────────────────────────

export async function insertQuizAttempt(values: {
  userId: string | number;
  subject: string;
  score: number;
  total: number;
  percent: number;
}): Promise<void> {
  const { error } = await supabase.from("quiz_attempts").insert({
    user_id: values.userId,
    subject: values.subject,
    score: values.score,
    total: values.total,
    percent: values.percent,
  });
  throwIfError(error, "insertQuizAttempt");
}

// ── Payments ──────────────────────────────────────────────────────────────────

export async function insertPayment(values: {
  userId: string | number;
  plan: string;
  transactionId: string;
  screenshotName: string | null;
  /** Public Supabase Storage URL (preferred) or base64 string (legacy fallback). */
  screenshotData: string | null;
  status: string;
}): Promise<Payment> {
  const { data, error } = await supabase
    .from("payments")
    .insert({
      user_id: values.userId,
      plan: values.plan,
      transaction_id: values.transactionId,
      screenshot_name: values.screenshotName,
      screenshot_data: values.screenshotData,
      status: values.status,
    })
    .select()
    .single();
  throwIfError(error, "insertPayment");
  return toPayment(data as Record<string, unknown>);
}

export async function getPaymentById(id: number): Promise<Payment | null> {
  const { data, error } = await supabase.from("payments").select("*").eq("id", id).limit(1).maybeSingle();
  throwIfError(error, "getPaymentById");
  return data ? toPayment(data as Record<string, unknown>) : null;
}

export async function updatePaymentStatus(id: number, status: string): Promise<Payment> {
  const { data, error } = await supabase.from("payments").update({ status }).eq("id", id).select().single();
  throwIfError(error, "updatePaymentStatus");
  return toPayment(data as Record<string, unknown>);
}

export async function deletePaymentById(id: number): Promise<void> {
  const { error } = await supabase.from("payments").delete().eq("id", id);
  throwIfError(error, "deletePaymentById");
}

export async function getPaymentsByTransactionId(transactionId: string): Promise<Payment[]> {
  const { data, error } = await supabase
    .from("payments")
    .select("*")
    .eq("transaction_id", transactionId)
    .limit(5);
  throwIfError(error, "getPaymentsByTransactionId");
  return (data ?? []).map((r) => toPayment(r as Record<string, unknown>));
}

export async function getPendingPaymentsByUser(userId: string | number): Promise<Payment[]> {
  const { data, error } = await supabase
    .from("payments")
    .select("*")
    .eq("user_id", userId)
    .eq("status", "pending")
    .limit(5);
  throwIfError(error, "getPendingPaymentsByUser");
  return (data ?? []).map((r) => toPayment(r as Record<string, unknown>));
}

export async function getLatestPaymentByUser(userId: string | number): Promise<Payment | null> {
  const { data, error } = await supabase
    .from("payments")
    .select("*")
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  throwIfError(error, "getLatestPaymentByUser");
  return data ? toPayment(data as Record<string, unknown>) : null;
}

// ── Feedback ──────────────────────────────────────────────────────────────────

export async function insertFeedback(values: {
  userId: string | number | null;
  category: string;
  message: string;
  status: string;
}): Promise<void> {
  const { error } = await supabase.from("feedback").insert({
    user_id: values.userId,
    category: values.category,
    message: values.message,
    status: values.status,
  });
  throwIfError(error, "insertFeedback");
}

export async function getFeedbackAdmin(limit = 200): Promise<Feedback[]> {
  const { data, error } = await supabase
    .from("feedback")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(limit);
  throwIfError(error, "getFeedbackAdmin");
  return (data ?? []).map((r) => toFeedback(r as Record<string, unknown>));
}

export async function deleteFeedbackById(id: number): Promise<void> {
  const { error } = await supabase.from("feedback").delete().eq("id", id);
  throwIfError(error, "deleteFeedbackById");
}

export async function updateFeedbackStatus(id: number, status: string): Promise<Feedback | null> {
  const { data, error } = await supabase.from("feedback").update({ status }).eq("id", id).select().maybeSingle();
  throwIfError(error, "updateFeedbackStatus");
  return data ? toFeedback(data as Record<string, unknown>) : null;
}

// ── Admin queries ─────────────────────────────────────────────────────────────

export async function countUsers(): Promise<number> {
  const { count, error } = await supabase.from("users").select("*", { count: "exact", head: true });
  throwIfError(error, "countUsers");
  return count ?? 0;
}

export async function countPremiumUsers(): Promise<number> {
  const { count, error } = await supabase.from("users").select("*", { count: "exact", head: true }).eq("is_premium", true);
  throwIfError(error, "countPremiumUsers");
  return count ?? 0;
}

export async function countPaymentsByStatus(status: string): Promise<number> {
  const { count, error } = await supabase.from("payments").select("*", { count: "exact", head: true }).eq("status", status);
  throwIfError(error, "countPaymentsByStatus");
  return count ?? 0;
}

export async function listUsersAdmin(limit = 500): Promise<User[]> {
  const { data, error } = await supabase
    .from("users")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(limit);
  throwIfError(error, "listUsersAdmin");
  return (data ?? []).map((r) => toUser(r as Record<string, unknown>));
}

export async function listPaymentsAdmin(limit = 500): Promise<Payment[]> {
  const { data, error } = await supabase
    .from("payments")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(limit);
  throwIfError(error, "listPaymentsAdmin");
  return (data ?? []).map((r) => toPayment(r as Record<string, unknown>));
}
