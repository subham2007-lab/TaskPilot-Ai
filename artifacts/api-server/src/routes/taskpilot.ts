import { randomUUID } from "node:crypto";
import { and, asc, eq, gt, gte, lt } from "drizzle-orm";
import { Router, type IRouter } from "express";
import {
  db,
  userProfilesTable,
  projectsTable,
  tasksTable,
  calendarEventsTable,
  focusSessionsTable,
  notificationsTable,
  recommendationsTable,
} from "@workspace/db";
import {
  AcceptReplanBody,
  AcceptReplanResponse,
  CreateCalendarEventBody,
  CreateCalendarEventResponse,
  CreateFocusSessionBody,
  CreateFocusSessionResponse,
  CreateProjectBody,
  CreateProjectResponse,
  CreateTaskBody,
  CreateTaskResponse,
  DecomposeTaskBody,
  DecomposeTaskResponse,
  DeleteTaskParams,
  DeleteTaskResponse,
  GetDashboardResponse,
  GetNextActionBody,
  GetNextActionResponse,
  GetWorkspaceResponse,
  ParseTaskBody,
  ParseTaskResponse,
  PreviewReplanBody,
  PreviewReplanResponse,
  SendAssistantMessageBody,
  SendAssistantMessageResponse,
  UpdatePreferencesBody,
  UpdatePreferencesResponse,
  UpdateTaskBody,
  UpdateTaskParams,
  UpdateTaskResponse,
} from "@workspace/api-zod";
import {
  decomposeTask,
  parseNaturalTask,
  previewSchedule,
  recommendNextAction,
  toTask,
} from "../lib/taskpilot-engine";

const router: IRouter = Router();
const DEMO_USER_ID = "taskpilot-demo-user";
const DAY_MS = 24 * 60 * 60 * 1000;

function atMinutesFromNow(minutes: number): Date {
  return new Date(Date.now() + minutes * 60_000);
}

function atStartOfLocalDay(date: Date): Date {
  const start = new Date(date);
  start.setHours(0, 0, 0, 0);
  return start;
}

async function ensureDemoWorkspace(): Promise<void> {
  const [profile] = await db
    .select()
    .from(userProfilesTable)
    .where(eq(userProfilesTable.id, DEMO_USER_ID))
    .limit(1);
  if (!profile) {
    await db.insert(userProfilesTable).values({
      id: DEMO_USER_ID,
      displayName: "Alex",
      availableMinutesPerDay: 360,
      productivePeriod: "morning",
      theme: "light",
    });
  }

  const [existingTask] = await db
    .select({ id: tasksTable.id })
    .from(tasksTable)
    .where(eq(tasksTable.userId, DEMO_USER_ID))
    .limit(1);
  if (existingTask) return;

  const now = new Date();
  const dueSoon = new Date(now.getTime() + 2 * DAY_MS);
  const yesterday = new Date(now.getTime() - DAY_MS);
  const projectId = "demo-ai-resume-project";
  const taskRows = [
    {
      id: "demo-task-dataset",
      title: "Prepare the resume dataset",
      description: "Remove duplicates and standardize the sample resumes.",
      status: "completed",
      priority: "high",
      category: "project",
      estimateMinutes: 45,
      dueAt: dueSoon,
      scheduledAt: atMinutesFromNow(-105),
      completedAt: atMinutesFromNow(-60),
      dependencies: [],
      createdAt: atMinutesFromNow(-240),
    },
    {
      id: "demo-task-cleaning",
      title: "Clean and label sample resumes",
      description: "Finish the reviewed labels before model evaluation.",
      status: "completed",
      priority: "high",
      category: "project",
      estimateMinutes: 35,
      dueAt: dueSoon,
      scheduledAt: atMinutesFromNow(-55),
      completedAt: atMinutesFromNow(-20),
      dependencies: ["demo-task-dataset"],
      createdAt: atMinutesFromNow(-180),
    },
    {
      id: "demo-task-evaluation",
      title: "Evaluate the resume matching model",
      description: "Compare precision and recall, then record the strongest baseline.",
      status: "in_progress",
      priority: "critical",
      category: "project",
      estimateMinutes: 50,
      dueAt: dueSoon,
      scheduledAt: atMinutesFromNow(15),
      completedAt: null,
      dependencies: ["demo-task-cleaning"],
      createdAt: atMinutesFromNow(-150),
    },
    {
      id: "demo-task-api",
      title: "Finish the recommendation API",
      description: "Connect resume scores to the candidate summary response.",
      status: "not_started",
      priority: "high",
      category: "project",
      estimateMinutes: 65,
      dueAt: dueSoon,
      scheduledAt: atMinutesFromNow(85),
      completedAt: null,
      dependencies: ["demo-task-evaluation"],
      createdAt: atMinutesFromNow(-125),
    },
    {
      id: "demo-task-frontend",
      title: "Polish the candidate results screen",
      description: "Make the match score and evidence easy to scan.",
      status: "not_started",
      priority: "high",
      category: "project",
      estimateMinutes: 70,
      dueAt: dueSoon,
      scheduledAt: atMinutesFromNow(210),
      completedAt: null,
      dependencies: ["demo-task-api"],
      createdAt: atMinutesFromNow(-110),
    },
    {
      id: "demo-task-testing",
      title: "Run a full candidate flow test",
      description: "Check upload, parsing, matching, and the empty state.",
      status: "not_started",
      priority: "medium",
      category: "work",
      estimateMinutes: 40,
      dueAt: dueSoon,
      scheduledAt: atMinutesFromNow(300),
      completedAt: null,
      dependencies: ["demo-task-frontend"],
      createdAt: atMinutesFromNow(-90),
    },
    {
      id: "demo-task-docs",
      title: "Write the project handoff notes",
      description: "Capture setup steps, known limitations, and next milestones.",
      status: "not_started",
      priority: "medium",
      category: "work",
      estimateMinutes: 35,
      dueAt: new Date(now.getTime() + 3 * DAY_MS),
      scheduledAt: atMinutesFromNow(400),
      completedAt: null,
      dependencies: ["demo-task-testing"],
      createdAt: atMinutesFromNow(-70),
    },
    {
      id: "demo-task-overdue",
      title: "Review the kickoff feedback",
      description: "Pull the unresolved comments into the project notes.",
      status: "not_started",
      priority: "high",
      category: "work",
      estimateMinutes: 20,
      dueAt: yesterday,
      scheduledAt: atMinutesFromNow(-180),
      completedAt: null,
      dependencies: [],
      createdAt: new Date(now.getTime() - 2 * DAY_MS),
    },
    {
      id: "demo-task-presentation",
      title: "Prepare the product demo",
      description: "Create a short walkthrough for the project review.",
      status: "not_started",
      priority: "medium",
      category: "project",
      estimateMinutes: 40,
      dueAt: new Date(now.getTime() + 3 * DAY_MS),
      scheduledAt: atMinutesFromNow(500),
      completedAt: null,
      dependencies: ["demo-task-testing"],
      createdAt: atMinutesFromNow(-50),
    },
  ];

  await db.transaction(async (tx) => {
    await tx.insert(projectsTable).values({
      id: projectId,
      userId: DEMO_USER_ID,
      title: "AI Resume Analyzer",
      goal: "Build a thoughtful resume matching tool, from dataset to polished demo.",
      deadline: dueSoon,
    });
    await tx.insert(tasksTable).values(
      taskRows.map((task) => ({ ...task, userId: DEMO_USER_ID, projectId })),
    );
    await tx.insert(calendarEventsTable).values({
      id: "demo-calendar-design-review",
      userId: DEMO_USER_ID,
      title: "Design review",
      eventType: "meeting",
      startAt: atMinutesFromNow(145),
      endAt: atMinutesFromNow(190),
      description: "Review the candidate results flow.",
    });
    await tx.insert(focusSessionsTable).values([
      {
        id: "demo-session-today",
        userId: DEMO_USER_ID,
        taskId: "demo-task-dataset",
        startedAt: atMinutesFromNow(-105),
        endedAt: atMinutesFromNow(-60),
        plannedMinutes: 40,
        actualMinutes: 45,
        outcome: "longer",
        completed: true,
      },
      {
        id: "demo-session-history",
        userId: DEMO_USER_ID,
        taskId: "demo-task-cleaning",
        startedAt: new Date(now.getTime() - 2 * DAY_MS - 50 * 60_000),
        endedAt: new Date(now.getTime() - 2 * DAY_MS - 10 * 60_000),
        plannedMinutes: 35,
        actualMinutes: 40,
        outcome: "longer",
        completed: true,
      },
    ]);
    await tx.insert(notificationsTable).values([
      {
        id: "demo-notification-deadline",
        userId: DEMO_USER_ID,
        title: "Project deadline in two days",
        body: "Three open tasks still sit between the model and your demo.",
        kind: "deadline",
      },
      {
        id: "demo-notification-recommendation",
        userId: DEMO_USER_ID,
        title: "A useful next step is ready",
        body: "Model evaluation is blocking the recommendation API.",
        kind: "suggestion",
      },
    ]);
  });
}

function projectResponse(
  project: typeof projectsTable.$inferSelect,
  tasks: ReturnType<typeof toTask>[],
) {
  const projectTasks = tasks.filter((task) => task.projectId === project.id);
  const completedCount = projectTasks.filter(
    (task) => task.status === "completed",
  ).length;
  return {
    id: project.id,
    title: project.title,
    goal: project.goal,
    deadline: project.deadline,
    progressPercent: projectTasks.length
      ? Math.round((completedCount / projectTasks.length) * 100)
      : 0,
    createdAt: project.createdAt.toISOString(),
  };
}

async function loadTasks(): Promise<ReturnType<typeof toTask>[]> {
  const rows = await db
    .select()
    .from(tasksTable)
    .where(eq(tasksTable.userId, DEMO_USER_ID))
    .orderBy(asc(tasksTable.createdAt));
  return rows.map(toTask);
}

router.get("/taskpilot/workspace", async (req, res): Promise<void> => {
  await ensureDemoWorkspace();
  const [profile, projectRows, tasks, eventRows, sessionRows, notificationRows] =
    await Promise.all([
      db
        .select()
        .from(userProfilesTable)
        .where(eq(userProfilesTable.id, DEMO_USER_ID))
        .limit(1),
      db
        .select()
        .from(projectsTable)
        .where(eq(projectsTable.userId, DEMO_USER_ID))
        .orderBy(asc(projectsTable.createdAt)),
      loadTasks(),
      db
        .select()
        .from(calendarEventsTable)
        .where(eq(calendarEventsTable.userId, DEMO_USER_ID))
        .orderBy(asc(calendarEventsTable.startAt)),
      db
        .select()
        .from(focusSessionsTable)
        .where(eq(focusSessionsTable.userId, DEMO_USER_ID))
        .orderBy(asc(focusSessionsTable.startedAt)),
      db
        .select()
        .from(notificationsTable)
        .where(eq(notificationsTable.userId, DEMO_USER_ID))
        .orderBy(asc(notificationsTable.createdAt)),
    ]);
  const user = profile[0];
  if (!user) {
    res.status(503).json({ error: "Your workspace could not be loaded." });
    return;
  }

  const result = {
    tasks,
    projects: projectRows.map((project) => projectResponse(project, tasks)),
    events: eventRows.map((event) => ({
      ...event,
      startAt: event.startAt,
      endAt: event.endAt,
      description: event.description,
      eventType: event.eventType as
        | "meeting"
        | "break"
        | "focus"
        | "deadline",
    })),
    sessions: sessionRows.map((session) => ({
      ...session,
      startedAt: session.startedAt,
      endedAt: session.endedAt,
      outcome: session.outcome as
        | "easier"
        | "as_expected"
        | "longer"
        | null,
    })),
    notifications: notificationRows.map((notification) => ({
      ...notification,
      createdAt: notification.createdAt,
      kind: notification.kind as
        | "deadline"
        | "overdue"
        | "schedule"
        | "risk"
        | "milestone"
        | "suggestion",
    })),
    preferences: {
      displayName: user.displayName,
      availableMinutesPerDay: user.availableMinutesPerDay,
      productivePeriod: user.productivePeriod as
        | "morning"
        | "afternoon"
        | "evening"
        | "flexible",
      theme: user.theme as "light" | "dark",
    },
  };
  req.log.info({ taskCount: tasks.length }, "Loaded TaskPilot workspace");
  res.json(GetWorkspaceResponse.parse(result));
});

router.get("/taskpilot/dashboard", async (_req, res): Promise<void> => {
  await ensureDemoWorkspace();
  const [tasks, sessions] = await Promise.all([
    loadTasks(),
    db
      .select()
      .from(focusSessionsTable)
      .where(eq(focusSessionsTable.userId, DEMO_USER_ID)),
  ]);
  const now = new Date();
  const dayStart = atStartOfLocalDay(now);
  const tomorrow = new Date(dayStart.getTime() + DAY_MS);
  const todayTasks = tasks.filter((task) => {
    const scheduled = task.scheduledAt ? new Date(task.scheduledAt) : null;
    const completed = task.completedAt ? new Date(task.completedAt) : null;
    return (
      (scheduled && scheduled >= dayStart && scheduled < tomorrow) ||
      (completed && completed >= dayStart && completed < tomorrow)
    );
  });
  const todayCompleted = todayTasks.filter(
    (task) => task.status === "completed",
  ).length;
  const todaySessions = sessions.filter(
    (session) => session.startedAt >= dayStart && session.startedAt < tomorrow,
  );
  const completedSessions = sessions.filter((session) => session.completed);
  const weekStart = new Date(
    dayStart.getTime() - ((dayStart.getDay() + 6) % 7) * DAY_MS,
  );
  const weeklyFocusMinutes = Array.from({ length: 7 }, (_, index) => {
    const start = new Date(weekStart.getTime() + index * DAY_MS);
    const end = new Date(start.getTime() + DAY_MS);
    return sessions
      .filter(
        (session) =>
          session.startedAt >= start &&
          session.startedAt < end,
      )
      .reduce((total, session) => total + session.actualMinutes, 0);
  });
  const summary = {
    todayCompleted,
    todayTotal: todayTasks.length,
    focusMinutesToday: todaySessions.reduce(
      (total, session) => total + session.actualMinutes,
      0,
    ),
    overdueCount: tasks.filter(
      (task) =>
        task.status !== "completed" &&
        task.dueAt != null &&
        new Date(task.dueAt) < now,
    ).length,
    averageCompletionMinutes: completedSessions.length
      ? Math.round(
          completedSessions.reduce(
            (total, session) => total + session.actualMinutes,
            0,
          ) / completedSessions.length,
        )
      : 0,
    productivityPercent: todayTasks.length
      ? Math.round((todayCompleted / todayTasks.length) * 100)
      : 0,
    weeklyFocusMinutes,
  };
  res.json(GetDashboardResponse.parse(summary));
});

router.post("/taskpilot/tasks", async (req, res): Promise<void> => {
  await ensureDemoWorkspace();
  const parsed = CreateTaskBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const input = parsed.data;
  if (input.projectId) {
    const [project] = await db
      .select({ id: projectsTable.id })
      .from(projectsTable)
      .where(eq(projectsTable.id, input.projectId))
      .limit(1);
    if (!project) {
      res.status(400).json({ error: "Choose a project in this workspace." });
      return;
    }
  }
  if (input.dependencies?.includes(input.parentTaskId ?? "")) {
    res.status(400).json({ error: "A task cannot depend on itself." });
    return;
  }
  const [row] = await db
    .insert(tasksTable)
    .values({
      id: randomUUID(),
      userId: DEMO_USER_ID,
      title: input.title.trim(),
      description: input.description ?? null,
      projectId: input.projectId ?? null,
      status: "not_started",
      priority: input.priority,
      category: input.category,
      estimateMinutes: input.estimateMinutes,
      dueAt: input.dueAt ?? null,
      scheduledAt: input.scheduledAt ?? null,
      dependencies: input.dependencies ?? [],
      parentTaskId: input.parentTaskId ?? null,
      recurring: input.recurring ?? false,
    })
    .returning();
  res.status(201).json(CreateTaskResponse.parse(toTask(row!)));
});

router.patch("/taskpilot/tasks/:taskId", async (req, res): Promise<void> => {
  await ensureDemoWorkspace();
  const params = UpdateTaskParams.safeParse(req.params);
  const parsed = UpdateTaskBody.safeParse(req.body);
  if (!params.success || !parsed.success) {
    const message = !params.success
      ? params.error.message
      : !parsed.success
        ? parsed.error.message
        : "Invalid request.";
    res.status(400).json({
      error: message,
    });
    return;
  }
  const body = parsed.data;
  const changes: Partial<typeof tasksTable.$inferInsert> = {};
  if (body.title !== undefined) changes.title = body.title.trim();
  if (body.description !== undefined) changes.description = body.description;
  if (body.projectId !== undefined) changes.projectId = body.projectId;
  if (body.status !== undefined) changes.status = body.status;
  if (body.priority !== undefined) changes.priority = body.priority;
  if (body.category !== undefined) changes.category = body.category;
  if (body.estimateMinutes !== undefined)
    changes.estimateMinutes = body.estimateMinutes;
  if (body.dueAt !== undefined) changes.dueAt = body.dueAt;
  if (body.scheduledAt !== undefined) changes.scheduledAt = body.scheduledAt;
  if (body.completedAt !== undefined)
    changes.completedAt = body.completedAt;
  if (body.dependencies !== undefined)
    changes.dependencies = body.dependencies;
  if (body.parentTaskId !== undefined)
    changes.parentTaskId = body.parentTaskId;
  if (body.recurring !== undefined) changes.recurring = body.recurring;
  if (
    body.status === "completed" &&
    body.completedAt === undefined
  ) {
    changes.completedAt = new Date();
  } else if (body.status && body.status !== "completed") {
    changes.completedAt = null;
  }
  const [row] = await db
    .update(tasksTable)
    .set(changes)
    .where(
      and(
        eq(tasksTable.id, params.data.taskId),
        eq(tasksTable.userId, DEMO_USER_ID),
      ),
    )
    .returning();
  if (!row) {
    res.status(404).json({ error: "That task could not be found." });
    return;
  }
  res.json(UpdateTaskResponse.parse(toTask(row)));
});

router.delete("/taskpilot/tasks/:taskId", async (req, res): Promise<void> => {
  const params = DeleteTaskParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const [row] = await db
    .delete(tasksTable)
    .where(
      and(
        eq(tasksTable.id, params.data.taskId),
        eq(tasksTable.userId, DEMO_USER_ID),
      ),
    )
    .returning({ id: tasksTable.id });
  if (!row) {
    res.status(404).json({ error: "That task could not be found." });
    return;
  }
  res.status(204).json(DeleteTaskResponse.parse(undefined));
});

router.post("/taskpilot/tasks/parse", async (req, res): Promise<void> => {
  const parsed = ParseTaskBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  res.json(ParseTaskResponse.parse(parseNaturalTask(parsed.data.text)));
});

router.post("/taskpilot/tasks/decompose", async (req, res): Promise<void> => {
  const parsed = DecomposeTaskBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  res.json(
    DecomposeTaskResponse.parse(decomposeTask(parsed.data.title.trim())),
  );
});

router.post("/taskpilot/projects", async (req, res): Promise<void> => {
  await ensureDemoWorkspace();
  const parsed = CreateProjectBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const [project] = await db
    .insert(projectsTable)
    .values({
      id: randomUUID(),
      userId: DEMO_USER_ID,
      title: parsed.data.title.trim(),
      goal: parsed.data.goal.trim(),
      deadline: parsed.data.deadline ?? null,
    })
    .returning();
  const response = projectResponse(project!, []);
  res.status(201).json(CreateProjectResponse.parse(response));
});

router.post("/taskpilot/calendar-events", async (req, res): Promise<void> => {
  await ensureDemoWorkspace();
  const parsed = CreateCalendarEventBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const input = parsed.data;
  const startAt = input.startAt;
  const endAt = input.endAt;
  if (
    !Number.isFinite(startAt.getTime()) ||
    !Number.isFinite(endAt.getTime()) ||
    endAt <= startAt
  ) {
    res.status(400).json({ error: "The event must end after it starts." });
    return;
  }
  const [conflict] = await db
    .select({ id: calendarEventsTable.id })
    .from(calendarEventsTable)
    .where(
      and(
        eq(calendarEventsTable.userId, DEMO_USER_ID),
        lt(calendarEventsTable.startAt, endAt),
        gt(calendarEventsTable.endAt, startAt),
      ),
    )
    .limit(1);
  if (conflict) {
    res.status(409).json({
      error: "This time overlaps another calendar event. Choose a different slot.",
    });
    return;
  }
  const [row] = await db
    .insert(calendarEventsTable)
    .values({
      id: randomUUID(),
      userId: DEMO_USER_ID,
      title: input.title.trim(),
      eventType: input.eventType,
      startAt,
      endAt,
      description: input.description ?? null,
    })
    .returning();
  const response = {
    ...row,
    startAt: row!.startAt,
    endAt: row!.endAt,
    eventType: row!.eventType as
      | "meeting"
      | "break"
      | "focus"
      | "deadline",
  };
  res.status(201).json(CreateCalendarEventResponse.parse(response));
});

router.post("/taskpilot/recommendation", async (req, res): Promise<void> => {
  await ensureDemoWorkspace();
  const parsed = GetNextActionBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const tasks = await loadTasks();
  const recommendation = recommendNextAction(
    tasks,
    new Date(parsed.data.now),
    parsed.data.availableMinutes ?? 360,
  );
  if (!recommendation) {
    res.status(404).json({ error: "There are no ready tasks to recommend." });
    return;
  }
  await db.insert(recommendationsTable).values({
    id: randomUUID(),
    userId: DEMO_USER_ID,
    taskId: recommendation.task.id,
    reason: recommendation.reason,
    score: recommendation.score,
  });
  res.json(GetNextActionResponse.parse(recommendation));
});

router.post("/taskpilot/planner/replan", async (req, res): Promise<void> => {
  await ensureDemoWorkspace();
  const parsed = PreviewReplanBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const [tasks, events] = await Promise.all([
    loadTasks(),
    db
      .select()
      .from(calendarEventsTable)
      .where(eq(calendarEventsTable.userId, DEMO_USER_ID)),
  ]);
  const eventBlocks = events.map((event) => ({
    title: event.title,
    startAt: event.startAt,
    endAt: event.endAt,
  }));
  if (parsed.data.event) {
    eventBlocks.push({
      title: parsed.data.event.title,
      startAt: parsed.data.event.startAt,
      endAt: parsed.data.event.endAt,
    });
  }
  res.json(
    PreviewReplanResponse.parse(
      previewSchedule(tasks, eventBlocks, parsed.data),
    ),
  );
});

router.post(
  "/taskpilot/planner/replan/accept",
  async (req, res): Promise<void> => {
    await ensureDemoWorkspace();
    const parsed = AcceptReplanBody.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.message });
      return;
    }
    const updated: ReturnType<typeof toTask>[] = [];
    await db.transaction(async (tx) => {
      for (const update of parsed.data.updates) {
        const [row] = await tx
          .update(tasksTable)
          .set({
            scheduledAt: update.scheduledAt ?? null,
          })
          .where(
            and(
              eq(tasksTable.id, update.taskId),
              eq(tasksTable.userId, DEMO_USER_ID),
            ),
          )
          .returning();
        if (row) updated.push(toTask(row));
      }
    });
    res.json(AcceptReplanResponse.parse(updated));
  },
);

router.post("/taskpilot/focus-sessions", async (req, res): Promise<void> => {
  await ensureDemoWorkspace();
  const parsed = CreateFocusSessionBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const input = parsed.data;
  const [task] = await db
    .select({ id: tasksTable.id })
    .from(tasksTable)
    .where(
      and(
        eq(tasksTable.id, input.taskId),
        eq(tasksTable.userId, DEMO_USER_ID),
      ),
    )
    .limit(1);
  if (!task) {
    res.status(404).json({ error: "That task could not be found." });
    return;
  }
  const [session] = await db.transaction(async (tx) => {
    const [createdSession] = await tx
      .insert(focusSessionsTable)
      .values({
        id: randomUUID(),
        userId: DEMO_USER_ID,
        taskId: input.taskId,
        startedAt: input.startedAt,
        endedAt: input.endedAt ?? null,
        plannedMinutes: input.plannedMinutes,
        actualMinutes: input.actualMinutes,
        outcome: input.outcome ?? null,
        completed: input.completed,
      })
      .returning();
    if (task) {
      await tx
        .update(tasksTable)
        .set({ status: "in_progress" })
        .where(
          and(
            eq(tasksTable.id, input.taskId),
            eq(tasksTable.userId, DEMO_USER_ID),
            eq(tasksTable.status, "not_started"),
          ),
        );
    }
    return [createdSession];
  });
  const response = {
    ...session,
    startedAt: session!.startedAt,
    endedAt: session!.endedAt,
    outcome: session!.outcome as "easier" | "as_expected" | "longer" | null,
  };
  res.status(201).json(CreateFocusSessionResponse.parse(response));
});

router.patch("/taskpilot/preferences", async (req, res): Promise<void> => {
  await ensureDemoWorkspace();
  const parsed = UpdatePreferencesBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const changes: Partial<typeof userProfilesTable.$inferInsert> = {};
  if (parsed.data.displayName !== undefined)
    changes.displayName = parsed.data.displayName.trim();
  if (parsed.data.availableMinutesPerDay !== undefined)
    changes.availableMinutesPerDay = parsed.data.availableMinutesPerDay;
  if (parsed.data.productivePeriod !== undefined)
    changes.productivePeriod = parsed.data.productivePeriod;
  if (parsed.data.theme !== undefined) changes.theme = parsed.data.theme;
  const [profile] = await db
    .update(userProfilesTable)
    .set(changes)
    .where(eq(userProfilesTable.id, DEMO_USER_ID))
    .returning();
  const response = {
    displayName: profile!.displayName,
    availableMinutesPerDay: profile!.availableMinutesPerDay,
    productivePeriod: profile!.productivePeriod as
      | "morning"
      | "afternoon"
      | "evening"
      | "flexible",
    theme: profile!.theme as "light" | "dark",
  };
  res.json(UpdatePreferencesResponse.parse(response));
});

router.post(
  "/taskpilot/assistant/messages",
  async (req, res): Promise<void> => {
    await ensureDemoWorkspace();
    const parsed = SendAssistantMessageBody.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.message });
      return;
    }
    const message = parsed.data.message.trim().toLowerCase();
    const tasks = await loadTasks();
    const open = tasks.filter((task) => task.status !== "completed");
    const overdue = open.filter(
      (task) => task.dueAt != null && new Date(task.dueAt) < new Date(),
    );
    let answer = "";
    let action: "none" | "show_overdue" | "show_recommendation" | "start_replan" | "show_tasks" = "none";

    if (/\boverdue|late|past due\b/.test(message)) {
      action = "show_overdue";
      answer = overdue.length
        ? `You have ${overdue.length} overdue task${overdue.length === 1 ? "" : "s"}: ${overdue.map((task) => task.title).join(", ")}.`
        : "You have no overdue tasks right now.";
    } else if (/\bmove|reschedule|reorgan|replan|meeting\b/.test(message)) {
      action = "start_replan";
      answer =
        "I can rearrange your open work around a meeting or a task that ran long. Add the change to your schedule and I’ll show the exact updates before saving them.";
    } else if (/\bwhat should|next|recommend|do now\b/.test(message)) {
      action = "show_recommendation";
      const recommendation = recommendNextAction(
        tasks,
        new Date(),
        360,
      );
      answer = recommendation
        ? `Your strongest next step is “${recommendation.task.title}” (${recommendation.task.estimateMinutes} min). ${recommendation.reason}`
        : "You have no ready tasks. Add a task or clear a dependency to get a next action.";
    } else if (/\btrack|project|progress\b/.test(message)) {
      const [project] = await db
        .select()
        .from(projectsTable)
        .where(eq(projectsTable.userId, DEMO_USER_ID))
        .orderBy(asc(projectsTable.createdAt))
        .limit(1);
      const projectTasks = project
        ? tasks.filter((task) => task.projectId === project.id)
        : [];
      const done = projectTasks.filter(
        (task) => task.status === "completed",
      ).length;
      answer = project
        ? `${project.title} is ${projectTasks.length ? Math.round((done / projectTasks.length) * 100) : 0}% complete (${done} of ${projectTasks.length} tasks done). ${overdue.length ? `There are ${overdue.length} overdue tasks to recover.` : "No tasks are currently overdue."}`
        : "Create a project and I’ll keep its milestones and task progress together.";
    } else if (/\btoday|finish|workload|need to do\b/.test(message)) {
      const todayStart = atStartOfLocalDay(new Date());
      const tomorrow = new Date(todayStart.getTime() + DAY_MS);
      const today = open.filter((task) => {
        const date = task.scheduledAt ? new Date(task.scheduledAt) : null;
        return date && date >= todayStart && date < tomorrow;
      });
      action = "show_tasks";
      answer = today.length
        ? `You have ${today.length} open task${today.length === 1 ? "" : "s"} on today's plan: ${today.map((task) => task.title).join(", ")}.`
        : "There are no open tasks scheduled for today. Would you like me to recommend one from your backlog?";
    } else {
      action = "show_tasks";
      answer = `You have ${open.length} open tasks and ${overdue.length} overdue. Ask me about today's plan, overdue work, a project, or your next action and I'll use those saved details.`;
    }
    res.json(SendAssistantMessageResponse.parse({ answer, action }));
  },
);

export default router;