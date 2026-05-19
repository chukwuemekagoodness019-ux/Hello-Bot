import { pgTable, serial, text, integer, timestamp, boolean, date } from "drizzle-orm/pg-core";

export const usersTable = pgTable("users", {
  id: serial("id").primaryKey(),
  email: text("email").unique(),
  passwordHash: text("password_hash"),
  displayName: text("display_name"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  lastActiveAt: timestamp("last_active_at", { withTimezone: true }).defaultNow(),
  isPremium: boolean("is_premium").default(false).notNull(),
  premiumUntil: timestamp("premium_until", { withTimezone: true }),
  messagesUsedToday: integer("messages_used_today").default(0).notNull(),
  quizzesUsedToday: integer("quizzes_used_today").default(0).notNull(),
  voiceUsedToday: integer("voice_used_today").default(0).notNull(),
  lastResetDate: date("last_reset_date").defaultNow().notNull(),
  currentStreak: integer("current_streak").default(0).notNull(),
  bestStreak: integer("best_streak").default(0).notNull(),
  bestScore: integer("best_score").default(0).notNull(),
  lastActiveDate: date("last_active_date"),
});

export type User = typeof usersTable.$inferSelect;
export type InsertUser = typeof usersTable.$inferInsert;

export const paymentsTable = pgTable("payments", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").references(() => usersTable.id, { onDelete: "cascade" }).notNull(),
  plan: text("plan").notNull(),
  transactionId: text("transaction_id").notNull(),
  screenshotName: text("screenshot_name"),
  screenshotData: text("screenshot_data"),
  status: text("status").default("pending").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

export type Payment = typeof paymentsTable.$inferSelect;
export type InsertPayment = typeof paymentsTable.$inferInsert;

export const quizAttemptsTable = pgTable("quiz_attempts", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").references(() => usersTable.id, { onDelete: "cascade" }).notNull(),
  subject: text("subject").notNull(),
  score: integer("score").notNull(),
  total: integer("total").notNull(),
  percent: integer("percent").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

export type QuizAttempt = typeof quizAttemptsTable.$inferSelect;
export type InsertQuizAttempt = typeof quizAttemptsTable.$inferInsert;

export const feedbackTable = pgTable("feedback", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").references(() => usersTable.id, { onDelete: "set null" }),
  category: text("category").notNull(),
  message: text("message").notNull(),
  status: text("status").default("unread").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

export type Feedback = typeof feedbackTable.$inferSelect;
export type InsertFeedback = typeof feedbackTable.$inferInsert;
