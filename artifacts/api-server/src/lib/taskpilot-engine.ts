import type {
  DecompositionStep,
  ReplanChange,
  ReplanInput,
  Task,
  TaskDraft,
  TaskPriority,
} from "@workspace/api-zod";
import type { tasksTable } from "@workspace/db";

type TaskRow = typeof tasksTable.$inferSelect;

export function toTask(row: TaskRow): Task {
  return {
    id: row.id,
    title: row.title,
    description: row.description,
    projectId: row.projectId,
    status: row.status as Task["status"],
    priority: row.priority as Task["priority"],
    category: row.category as Task["category"],
    estimateMinutes: row.estimateMinutes,
    dueAt: row.dueAt,
    scheduledAt: row.scheduledAt,
    completedAt: row.completedAt,
    dependencies: row.dependencies,
    parentTaskId: row.parentTaskId,
    recurring: row.recurring,
    createdAt: row.createdAt,
  };
}

function nextWeekday(now: Date, weekday: number): Date {
  const date = new Date(now);
  date.setHours(17, 0, 0, 0);
  let days = (weekday - date.getDay() + 7) % 7;
  if (days === 0 || date.getTime() <= now.getTime()) days += 7;
  date.setDate(date.getDate() + days);
  return date;
}

export function parseNaturalTask(text: string, now = new Date()): TaskDraft {
  const normalized = text.trim().replace(/\s+/g, " ");
  const lower = normalized.toLowerCase();
  let dueAt: Date | null = null;

  if (/\btomorrow\b/.test(lower)) {
    const date = new Date(now);
    date.setDate(date.getDate() + 1);
    date.setHours(17, 0, 0, 0);
    dueAt = date;
  } else if (/\btoday\b/.test(lower)) {
    const date = new Date(now);
    date.setHours(17, 0, 0, 0);
    if (date.getTime() < now.getTime()) date.setDate(date.getDate() + 1);
    dueAt = date;
  } else {
    const weekdays: Record<string, number> = {
      sunday: 0,
      monday: 1,
      tuesday: 2,
      wednesday: 3,
      thursday: 4,
      friday: 5,
      saturday: 6,
    };
    const weekday = Object.keys(weekdays).find((day) =>
      new RegExp(`\\b(?:by\\s+)?${day}\\b`, "i").test(lower),
    );
    if (weekday) dueAt = nextWeekday(now, weekdays[weekday]!);
    const inDays = lower.match(/\bin\s+(\d+)\s+days?\b/);
    if (inDays?.[1]) {
      const date = new Date(now);
      date.setDate(date.getDate() + Number(inDays[1]));
      date.setHours(17, 0, 0, 0);
      dueAt = date;
    }
  }

  const effort = lower.match(
    /\b(\d+(?:\.\d+)?)\s*(hours?|hrs?|h|minutes?|mins?|m)\b/,
  );
  const estimateMinutes = effort
    ? Math.max(
        5,
        Math.round(
          Number(effort[1]) *
            (effort[2]!.startsWith("h") ? 60 : 1),
        ),
      )
    : 30;

  const title = normalized
    .replace(/^(?:please\s+)?(?:remind me to|remember to|i need to|i have to|add a task to|add|task:)\s*/i, "")
    .replace(/\b(?:probably|about|around|roughly)\s+\d+(?:\.\d+)?\s*(?:hours?|hrs?|h|minutes?|mins?|m)\s*(?:of work)?/gi, "")
    .replace(/\b\d+(?:\.\d+)?\s*(?:hours?|hrs?|h|minutes?|mins?|m)\s*(?:of work)?\b/gi, "")
    .replace(/\b(?:by\s+)?(?:today|tomorrow|(?:this\s+)?(?:monday|tuesday|wednesday|thursday|friday|saturday|sunday)|in\s+\d+\s+days?)\b/gi, "")
    .replace(/\s+at\s+\d{1,2}(?::\d{2})?\s*(?:am|pm)?/gi, "")
    .replace(/[,.!?;:]+$/g, "")
    .trim();

  const priority: TaskPriority =
    /\b(critical|urgent|asap|immediately)\b/i.test(lower)
      ? "critical"
      : /\b(high priority|important|due soon)\b/i.test(lower) ||
          (dueAt !== null &&
            dueAt.getTime() - now.getTime() < 48 * 60 * 60 * 1000)
        ? "high"
        : /\b(low priority|whenever|someday)\b/i.test(lower)
          ? "low"
          : "medium";

  const category: TaskDraft["category"] =
    /\b(study|exam|assignment|homework|lecture|course)\b/i.test(lower)
      ? "study"
      : /\b(health|workout|exercise|doctor|run|walk)\b/i.test(lower)
        ? "health"
        : /\b(personal|home|family|shopping)\b/i.test(lower)
          ? "personal"
          : /\b(project|app|website|build|code|model|api)\b/i.test(lower)
            ? "project"
            : "work";

  return {
    title: title || normalized,
    description: "",
    priority,
    category,
    estimateMinutes,
    dueAt,
  };
}

export function decomposeTask(title: string): DecompositionStep[] {
  const normalized = title.toLowerCase();
  if (/\b(machine learning|ml|model|resume analyzer|ai project)\b/.test(normalized)) {
    return [
      { title: "Collect and review the dataset", estimateMinutes: 45 },
      { title: "Clean the data and resolve missing values", estimateMinutes: 40 },
      { title: "Prepare features for model training", estimateMinutes: 45 },
      { title: "Train the first model", estimateMinutes: 60 },
      { title: "Evaluate results and record findings", estimateMinutes: 40 },
      { title: "Build the user interface", estimateMinutes: 60 },
      { title: "Test the end-to-end experience", estimateMinutes: 35 },
      { title: "Write documentation and prepare a demo", estimateMinutes: 40 },
    ];
  }

  return [
    { title: `Define the outcome for “${title}”`, estimateMinutes: 15 },
    { title: "Gather the information and materials you need", estimateMinutes: 25 },
    { title: "Complete the main piece of work", estimateMinutes: 45 },
    { title: "Review, test, and make corrections", estimateMinutes: 25 },
    { title: "Share or close out the finished work", estimateMinutes: 15 },
  ];
}

const priorityWeight: Record<Task["priority"], number> = {
  low: 5,
  medium: 15,
  high: 28,
  critical: 40,
};

export function recommendNextAction(
  tasks: Task[],
  now: Date,
  availableMinutes: number,
): { task: Task; reason: string; score: number; alternatives: Task[] } | null {
  const parentTaskIds = new Set(
    tasks
      .map((task) => task.parentTaskId)
      .filter((id): id is string => id !== null && id !== undefined),
  );
  const completedIds = new Set(
    tasks.filter((task) => task.status === "completed").map((task) => task.id),
  );
  const open = tasks.filter(
    (task) =>
      task.status !== "completed" &&
      !parentTaskIds.has(task.id) &&
      task.dependencies.every((dependency) => completedIds.has(dependency)),
  );
  if (open.length === 0) return null;

  const scored = open
    .map((task) => {
      const due = task.dueAt ? new Date(task.dueAt).getTime() : null;
      const hoursUntilDue =
        due == null ? Number.POSITIVE_INFINITY : (due - now.getTime()) / 3_600_000;
      const overdue = hoursUntilDue < 0;
      const dependentCount = tasks.filter((candidate) =>
        candidate.dependencies.includes(task.id),
      ).length;
      const estimateFactor =
        task.estimateMinutes <= availableMinutes
          ? 14
          : Math.max(-15, 14 - (task.estimateMinutes - availableMinutes) / 10);
      const score =
        priorityWeight[task.priority] +
        (overdue ? 48 : hoursUntilDue < 24 ? 38 : hoursUntilDue < 72 ? 22 : 0) +
        (task.status === "in_progress" ? 18 : 0) +
        Math.min(24, dependentCount * 8) +
        estimateFactor;
      return { task, score, overdue, hoursUntilDue, dependentCount };
    })
    .sort((a, b) => b.score - a.score);

  const top = scored[0]!;
  const reason = top.overdue
    ? "This task is overdue, and clearing it will reduce the work competing for your attention."
    : top.hoursUntilDue < 24
      ? `Its deadline is approaching${top.dependentCount > 0 ? `, and it unblocks ${top.dependentCount} other task${top.dependentCount === 1 ? "" : "s"}` : ""}.`
      : top.dependentCount > 0
        ? `This is the next dependency in the chain and unblocks ${top.dependentCount} other task${top.dependentCount === 1 ? "" : "s"}.`
        : top.task.status === "in_progress"
          ? "You have already started this task. Finishing it now avoids losing context."
          : "It best balances your task priority, deadline, and the time you have available.";

  return {
    task: top.task,
    reason,
    score: Math.min(100, Math.round(top.score)),
    alternatives: scored.slice(1, 4).map(({ task }) => task),
  };
}

type PlannerEvent = {
  title: string;
  startAt: string | Date;
  endAt: string | Date;
};

export function previewSchedule(
  tasks: Task[],
  events: PlannerEvent[],
  request: ReplanInput,
): { summary: string; changes: ReplanChange[] } {
  const now = new Date(request.now);
  const parentTaskIds = new Set(
    tasks
      .map((task) => task.parentTaskId)
      .filter((id): id is string => id !== null && id !== undefined),
  );
  const remaining = tasks.filter(
    (task) => task.status !== "completed" && !parentTaskIds.has(task.id),
  );
  const allIds = new Set(tasks.map((task) => task.id));
  const completedIds = new Set(
    tasks.filter((task) => task.status === "completed").map((task) => task.id),
  );
  const plannedIds = new Set<string>();
  const openTasks: Task[] = [];
  const compareUrgency = (a: Task, b: Task): number => {
      if (a.id === request.taskId) return -1;
      if (b.id === request.taskId) return 1;
      const dueDiff =
        (a.dueAt ? new Date(a.dueAt).getTime() : Number.MAX_SAFE_INTEGER) -
        (b.dueAt ? new Date(b.dueAt).getTime() : Number.MAX_SAFE_INTEGER);
      if (dueDiff !== 0) return dueDiff;
      return priorityWeight[b.priority] - priorityWeight[a.priority];
  };
  while (remaining.length > 0) {
    const ready = remaining
      .filter((task) =>
        task.dependencies.every(
          (dependency) =>
            completedIds.has(dependency) ||
            plannedIds.has(dependency) ||
            !allIds.has(dependency),
        ),
      )
      .sort(compareUrgency);
    // Don't let malformed legacy dependency cycles prevent a usable replan.
    const next = ready[0] ?? remaining.sort(compareUrgency)[0]!;
    openTasks.push(next);
    plannedIds.add(next.id);
    remaining.splice(remaining.indexOf(next), 1);
  }
  const blocks = events
    .map((event) => ({
      start: new Date(event.startAt).getTime(),
      end: new Date(event.endAt).getTime(),
      title: event.title,
    }))
    .filter((event) => Number.isFinite(event.start) && Number.isFinite(event.end));
  const dailyLimit = Math.max(30, request.availableMinutes ?? 360);
  const changes: ReplanChange[] = [];
  let cursor = new Date(now.getTime() + 15 * 60_000);
  let minutesToday = 0;

  for (const task of openTasks) {
    if (minutesToday >= dailyLimit) {
      cursor.setDate(cursor.getDate() + 1);
      cursor.setHours(9, 0, 0, 0);
      minutesToday = 0;
    }
    let safety = 0;
    while (safety < 50) {
      const collision = blocks.find(
        (block) =>
          cursor.getTime() < block.end &&
          cursor.getTime() + task.estimateMinutes * 60_000 > block.start,
      );
      if (!collision) break;
      cursor = new Date(collision.end + 15 * 60_000);
      safety += 1;
    }
    const previous = task.scheduledAt ?? null;
    if (
      previous === null ||
      new Date(previous).getTime() !== cursor.getTime()
    ) {
      changes.push({
        taskId: task.id,
        title: task.title,
        from: previous,
        to: new Date(cursor),
      });
    }
    cursor = new Date(cursor.getTime() + task.estimateMinutes * 60_000 + 15 * 60_000);
    minutesToday += task.estimateMinutes;
  }

  const eventName = request.event?.title;
  const summary =
    request.reason === "meeting_added" && eventName
      ? `${eventName} is blocked on your calendar. The remaining work has been placed around it.`
      : request.reason === "not_completed"
        ? "Your unfinished work is first in the revised plan. Later tasks shift to protect their deadlines."
        : "Your open tasks have been reordered around your available time and calendar.";
  return { summary, changes };
}