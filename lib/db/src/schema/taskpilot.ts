import {
  boolean,
  integer,
  pgTable,
  text,
  timestamp,
} from "drizzle-orm/pg-core";

export const userProfilesTable = pgTable("taskpilot_user_profiles", {
  id: text("id").primaryKey(),
  displayName: text("display_name").notNull().default("Alex"),
  availableMinutesPerDay: integer("available_minutes_per_day")
    .notNull()
    .default(360),
  productivePeriod: text("productive_period").notNull().default("morning"),
  theme: text("theme").notNull().default("light"),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const projectsTable = pgTable("taskpilot_projects", {
  id: text("id").primaryKey(),
  userId: text("user_id")
    .notNull()
    .references(() => userProfilesTable.id, { onDelete: "cascade" }),
  title: text("title").notNull(),
  goal: text("goal").notNull().default(""),
  deadline: timestamp("deadline", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const tasksTable = pgTable("taskpilot_tasks", {
  id: text("id").primaryKey(),
  userId: text("user_id")
    .notNull()
    .references(() => userProfilesTable.id, { onDelete: "cascade" }),
  title: text("title").notNull(),
  description: text("description"),
  projectId: text("project_id").references(() => projectsTable.id, {
    onDelete: "set null",
  }),
  status: text("status").notNull().default("not_started"),
  priority: text("priority").notNull().default("medium"),
  category: text("category").notNull().default("work"),
  estimateMinutes: integer("estimate_minutes").notNull().default(30),
  dueAt: timestamp("due_at", { withTimezone: true }),
  scheduledAt: timestamp("scheduled_at", { withTimezone: true }),
  completedAt: timestamp("completed_at", { withTimezone: true }),
  dependencies: text("dependencies").array().notNull().default([]),
  parentTaskId: text("parent_task_id"),
  recurring: boolean("recurring").notNull().default(false),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const calendarEventsTable = pgTable("taskpilot_calendar_events", {
  id: text("id").primaryKey(),
  userId: text("user_id")
    .notNull()
    .references(() => userProfilesTable.id, { onDelete: "cascade" }),
  title: text("title").notNull(),
  eventType: text("event_type").notNull(),
  startAt: timestamp("start_at", { withTimezone: true }).notNull(),
  endAt: timestamp("end_at", { withTimezone: true }).notNull(),
  description: text("description"),
});

export const focusSessionsTable = pgTable("taskpilot_focus_sessions", {
  id: text("id").primaryKey(),
  userId: text("user_id")
    .notNull()
    .references(() => userProfilesTable.id, { onDelete: "cascade" }),
  taskId: text("task_id")
    .notNull()
    .references(() => tasksTable.id, { onDelete: "cascade" }),
  startedAt: timestamp("started_at", { withTimezone: true }).notNull(),
  endedAt: timestamp("ended_at", { withTimezone: true }),
  plannedMinutes: integer("planned_minutes").notNull(),
  actualMinutes: integer("actual_minutes").notNull(),
  outcome: text("outcome"),
  completed: boolean("completed").notNull().default(false),
});

export const notificationsTable = pgTable("taskpilot_notifications", {
  id: text("id").primaryKey(),
  userId: text("user_id")
    .notNull()
    .references(() => userProfilesTable.id, { onDelete: "cascade" }),
  title: text("title").notNull(),
  body: text("body").notNull(),
  kind: text("kind").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  read: boolean("read").notNull().default(false),
});

export const recommendationsTable = pgTable("taskpilot_recommendations", {
  id: text("id").primaryKey(),
  userId: text("user_id")
    .notNull()
    .references(() => userProfilesTable.id, { onDelete: "cascade" }),
  taskId: text("task_id").references(() => tasksTable.id, {
    onDelete: "set null",
  }),
  reason: text("reason").notNull(),
  score: integer("score").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});