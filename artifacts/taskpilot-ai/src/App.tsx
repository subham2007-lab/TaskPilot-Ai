import { type FormEvent, useEffect, useMemo, useRef, useState } from 'react';
import { QueryClient, QueryClientProvider, useQueryClient } from '@tanstack/react-query';
import {
  Activity, AlarmClock, ArrowDownRight, ArrowLeft, ArrowRight, ArrowUpRight,
  Bot, CalendarDays, Check, CheckCircle2, ChevronDown, ChevronLeft,
  ChevronRight, Circle, Clock3, Command, Compass, Flame, Focus, FolderKanban,
  LayoutDashboard, ListChecks, LoaderCircle, Menu, MessageSquareText, Moon,
  Mic, MoreHorizontal, Plus, Search, Send, Settings2, Sparkles, Sun, Target,
  TrendingUp, X, Zap,
} from 'lucide-react';
import {
  useAcceptReplan, useCreateCalendarEvent, useCreateFocusSession,
  useCreateProject, useCreateTask, useDeleteTask, useDecomposeTask,
  useGetDashboard, useGetNextAction, useGetWorkspace, useParseTask,
  usePreviewReplan, useSendAssistantMessage, useUpdatePreferences,
  useUpdateTask, getGetDashboardQueryKey, getGetWorkspaceQueryKey,
  type Task, type TaskDraft, type TaskInput, type TaskPriority, type TaskCategory,
  type CalendarEvent, type PreferencesUpdate, type Recommendation, type FocusSessionInputOutcome,
} from '@workspace/api-client-react';
import { Link, Route, Router as WouterRouter, Switch, useLocation } from 'wouter';
import { ErrorBoundary } from '@/components/error-boundary';
import { Toaster } from '@/components/ui/toaster';
import { TooltipProvider } from '@/components/ui/tooltip';

const queryClient = new QueryClient({
  defaultOptions: { queries: { staleTime: 20_000, retry: 1, refetchOnWindowFocus: false } },
});

const routes = [
  { href: '/', label: 'Today', icon: LayoutDashboard },
  { href: '/tasks', label: 'Tasks', icon: ListChecks },
  { href: '/planner', label: 'Planner', icon: Compass },
  { href: '/calendar', label: 'Calendar', icon: CalendarDays },
  { href: '/productivity', label: 'Insights', icon: Activity },
  { href: '/assistant', label: 'Ask Pilot', icon: MessageSquareText },
];

const cx = (...parts: Array<string | false | undefined>) => parts.filter(Boolean).join(' ');
const dateAt = (value?: string | null, options?: Intl.DateTimeFormatOptions) =>
  value ? new Date(value).toLocaleDateString('en-US', options ?? { month: 'short', day: 'numeric' }) : 'No date';
const timeAt = (value?: string | null) =>
  value ? new Date(value).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' }) : '';
const todayISO = () => new Date().toISOString().slice(0, 10);
const localDateTime = (value: string) => new Date(value).toISOString();
const initials = (name: string) => name.trim().split(/\s+/).slice(0, 2).map((part) => part[0]).join('').toUpperCase() || 'TP';
const friendlyError = (error: unknown) => error instanceof Error ? error.message : 'Something went wrong. Please try again.';

type SpeechRecognitionResultEvent = {
  results: ArrayLike<{ 0: { transcript: string }; isFinal: boolean }>;
};
type SpeechRecognitionLike = {
  lang: string;
  interimResults: boolean;
  onresult: ((event: SpeechRecognitionResultEvent) => void) | null;
  onerror: ((event: { error: string }) => void) | null;
  onend: (() => void) | null;
  start: () => void;
  stop: () => void;
};
type SpeechRecognitionConstructor = new () => SpeechRecognitionLike;

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, '')}>
          <RoutedShell />
        </WouterRouter>
        <Toaster />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

function RoutedShell() {
  const [location] = useLocation();
  return (
    <ErrorBoundary resetKey={location}>
      <Shell>
        <Switch>
          <Route path="/" component={DashboardPage} />
          <Route path="/tasks" component={TasksPage} />
          <Route path="/planner" component={PlannerPage} />
          <Route path="/calendar" component={CalendarPage} />
          <Route path="/productivity" component={ProductivityPage} />
          <Route path="/assistant" component={AssistantPage} />
          <Route path="/settings" component={SettingsPage} />
          <Route component={NotFound} />
        </Switch>
      </Shell>
    </ErrorBoundary>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  const [location, setLocation] = useLocation();
  const [menuOpen, setMenuOpen] = useState(false);
  const workspace = useGetWorkspace();
  const prefs = workspace.data?.preferences;
  useEffect(() => {
    if (prefs) document.documentElement.classList.toggle('dark', prefs.theme === 'dark');
  }, [prefs?.theme]);
  const displayName = prefs?.displayName || 'there';
  const active = routes.find((item) => item.href === location);
  const alerts = workspace.data?.notifications?.filter((item) => !item.read).length ?? 0;
  return (
    <div className="app-shell">
      <aside className={cx('sidebar', menuOpen && 'sidebar-open')}>
        <Link href="/" className="brand-lockup" onClick={() => setMenuOpen(false)}>
          <span className="brand-mark"><Command size={19} strokeWidth={2.4} /></span>
          <span className="brand-name">taskpilot<span>AI</span></span>
        </Link>
        <div className="workspace-switch">
          <div className="workspace-icon">W</div><div className="workspace-copy"><b>My workspace</b><small>Personal</small></div>
          <ChevronDown size={15} />
        </div>
        <p className="side-label">WORKSPACE</p>
        <nav className="side-nav" aria-label="Main navigation">
          {routes.map(({ href, label, icon: Icon }) => (
            <Link key={href} href={href} onClick={() => setMenuOpen(false)}
              className={cx('nav-link', location === href && 'nav-active')} data-testid={`link-nav-${label.toLowerCase().replaceAll(' ', '-')}`}>
              <Icon size={18} strokeWidth={1.8} /><span>{label}</span>
              {label === 'Today' && alerts > 0 && <i className="nav-dot" />}
            </Link>
          ))}
        </nav>
        <p className="side-label side-label-lower">PERSONAL</p>
        <Link href="/settings" className={cx('nav-link', location === '/settings' && 'nav-active')} onClick={() => setMenuOpen(false)}>
          <Settings2 size={18} strokeWidth={1.8} /><span>Preferences</span>
        </Link>
        <div className="sidebar-bottom">
          <div className="sidebar-nudge"><div className="nudge-top"><span className="nudge-icon"><Sparkles size={14} /></span><span>YOUR DAILY RHYTHM</span></div>
            <p>Small, focused steps add up to meaningful progress.</p>
            <Link href="/productivity">See your week <ArrowRight size={13} /></Link></div>
          <div className="profile-row">
            <div className="avatar">{initials(prefs?.displayName || 'Task Pilot')}</div>
            <div className="profile-copy"><b>{prefs?.displayName || 'Your workspace'}</b><small>Free plan</small></div>
            <button className="icon-button profile-more" aria-label="Open settings" onClick={() => setLocation('/settings')}><MoreHorizontal size={18} /></button>
          </div>
        </div>
      </aside>
      {menuOpen && <button className="mobile-scrim" onClick={() => setMenuOpen(false)} aria-label="Close navigation" />}
      <div className="main-column">
        <header className="topbar">
          <button className="icon-button mobile-menu" aria-label="Open navigation" onClick={() => setMenuOpen(true)}><Menu size={20} /></button>
          <div className="breadcrumb"><span>Workspace</span><ChevronRight size={14} /><b>{active?.label || (location === '/settings' ? 'Preferences' : 'Overview')}</b></div>
          <div className="topbar-actions">
            <span className="date-stamp">{new Date().toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}</span>
            <Link href="/assistant" className="top-assist"><Sparkles size={15} /> Ask Pilot</Link>
          </div>
        </header>
        <main className="page-content">{children}</main>
        <footer className="mobile-footer">
          {routes.slice(0, 5).map(({ href, label, icon: Icon }) => <Link key={href} href={href} className={cx('mobile-nav-item', location === href && 'mobile-nav-active')}><Icon size={19} /><span>{label}</span></Link>)}
        </footer>
      </div>
    </div>
  );
}

function PageHeading({ eyebrow, title, description, action }: { eyebrow: string; title: string; description?: string; action?: React.ReactNode }) {
  return <div className="page-heading"><div><div className="eyebrow">{eyebrow}</div><h1>{title}</h1>{description && <p>{description}</p>}</div>{action && <div className="heading-action">{action}</div>}</div>;
}

function LoadingState() {
  return <div className="loading-layout" aria-label="Loading workspace"><div className="skeleton skeleton-title" /><div className="skeleton-grid"><div className="skeleton skeleton-card" /><div className="skeleton skeleton-card" /><div className="skeleton skeleton-card" /></div><div className="skeleton skeleton-panel" /></div>;
}

function QueryError({ onRetry }: { onRetry: () => void }) {
  return <div className="state-card error-state"><div className="state-icon error-icon"><ArrowDownRight size={19} /></div><h3>We couldn’t load this view</h3><p>Your work is safe. Try reconnecting in a moment.</p><button className="button button-outline" onClick={onRetry}>Try again</button></div>;
}

function EmptyState({ title, body, action }: { title: string; body: string; action?: React.ReactNode }) {
  return <div className="empty-state"><div className="empty-mark"><Sparkles size={19} /></div><h3>{title}</h3><p>{body}</p>{action}</div>;
}

function useRefreshWorkspace() {
  const client = useQueryClient();
  return () => {
    void client.invalidateQueries({ queryKey: getGetWorkspaceQueryKey() });
    void client.invalidateQueries({ queryKey: getGetDashboardQueryKey() });
  };
}

function DashboardPage() {
  const workspace = useGetWorkspace();
  const metrics = useGetDashboard();
  const refresh = useRefreshWorkspace();
  const [focusTask, setFocusTask] = useState<Task | null>(null);
  const [toast, setToast] = useState('');
  const [recommendation, setRecommendation] = useState<Recommendation | null>(null);
  const nextAction = useGetNextAction();
  const updateTask = useUpdateTask();
  const focusMutation = useCreateFocusSession();
  if (workspace.isLoading || metrics.isLoading) return <LoadingState />;
  if (workspace.isError || metrics.isError) return <QueryError onRetry={() => { void workspace.refetch(); void metrics.refetch(); }} />;
  const data = workspace.data!;
  const summary = metrics.data!;
  const tasks = data.tasks.filter((task) => task.status !== 'completed');
  const todayTasks = tasks.filter((task) => task.scheduledAt && new Date(task.scheduledAt).toDateString() === new Date().toDateString());
  const next = [...todayTasks, ...tasks].filter((task, index, all) => all.findIndex((other) => other.id === task.id) === index).slice(0, 4);
  const completedPercent = summary.todayTotal ? Math.round((summary.todayCompleted / summary.todayTotal) * 100) : 0;
  const requestNextAction = () => {
    setRecommendation(null);
    nextAction.mutate({
      data: { now: new Date().toISOString(), availableMinutes: data.preferences.availableMinutesPerDay },
    }, { onSuccess: setRecommendation });
  };
  const complete = (task: Task) => updateTask.mutate({ taskId: task.id, data: { status: 'completed', completedAt: new Date().toISOString() } }, {
    onSuccess: () => { refresh(); setToast('A good step forward. Task completed.'); window.setTimeout(() => setToast(''), 2600); },
  });
  const startFocus = (task: Task) => setFocusTask(task);
  const finishFocus = (task: Task, actualMinutes: number, outcome: FocusSessionInputOutcome) => {
    const end = new Date();
    focusMutation.mutate({ data: { taskId: task.id, startedAt: new Date(end.getTime() - actualMinutes * 60_000).toISOString(), endedAt: end.toISOString(), plannedMinutes: 25, actualMinutes, outcome, completed: true } }, {
      onSuccess: () => { refresh(); setFocusTask(null); setToast('Focus session saved. Nice work.'); window.setTimeout(() => setToast(''), 2600); },
    });
  };
  const weekly = summary.weeklyFocusMinutes ?? [];
  const maxMinutes = Math.max(1, ...weekly);
  return (
    <div className="page-stack">
      <PageHeading eyebrow={new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' }).toUpperCase()} title={`Good ${getDaypart()}, ${data.preferences.displayName.split(' ')[0] || 'there'}.`} description="A little clarity goes a long way. Here’s your day, at a glance."
        action={<Link href="/tasks" className="button button-primary"><Plus size={17} /> Add a task</Link>} />
      {toast && <div className="toast-inline"><CheckCircle2 size={17} />{toast}</div>}
      <section className="hero-grid">
        <div className="today-focus-card">
          <div className="focus-card-top"><span className="pill pill-light"><span className="live-pulse" /> WHAT SHOULD I DO NOW?</span><span className="focus-date">{new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</span></div>
          {recommendation ? <>
            <div className="focus-copy"><span className="focus-kicker">{recommendation.task.priority} priority · {recommendation.task.estimateMinutes} min · Due {recommendation.task.dueAt ? dateAt(recommendation.task.dueAt) : 'No deadline'}</span><h2>{recommendation.task.title}</h2><p>{recommendation.reason}</p></div>
            <div className="focus-card-bottom"><button className="button button-cream" onClick={() => startFocus(recommendation.task)}><Focus size={16} /> Start focus</button><button className="text-link light-link" onClick={requestNextAction} disabled={nextAction.isPending}>{nextAction.isPending ? 'Finding another…' : 'Another suggestion'} <ArrowRight size={14} /></button></div>
          </> : nextAction.isError ? <div className="focus-copy"><span className="focus-kicker">YOUR PLAN IS STILL HERE</span><h2>Couldn’t find your next step.</h2><p>{friendlyError(nextAction.error)}</p><button className="button button-cream" onClick={requestNextAction} disabled={nextAction.isPending}><Sparkles size={15} /> Try again</button></div>
            : tasks.length === 0 ? <div className="focus-copy"><span className="focus-kicker">A CLEAR RUNWAY</span><h2>Room to breathe.</h2><p>Add a task and Pilot will help you choose a meaningful next step.</p><Link href="/tasks" className="button button-cream"><Plus size={16} /> Add a task</Link></div>
              : <div className="focus-copy"><span className="focus-kicker">A CALMER WAY TO CHOOSE</span><h2>{nextAction.isPending ? 'Looking across your day…' : 'Let Pilot find your next step.'}</h2><p>{nextAction.isPending ? 'Checking your deadlines, priorities, and available time.' : 'Get one thoughtful recommendation based on your current work and time.'}</p><button className="button button-cream" onClick={requestNextAction} disabled={nextAction.isPending}>{nextAction.isPending ? <LoaderCircle className="spin" size={15} /> : <Sparkles size={15} />}{nextAction.isPending ? 'Finding your next step' : 'What should I do now?'}</button></div>}
          <div className="focus-orbit orbit-one" /><div className="focus-orbit orbit-two" /><div className="focus-orbit orbit-three" />
        </div>
        <div className="progress-card">
          <div className="card-heading"><div><span className="eyebrow">TODAY’S MOMENTUM</span><h3>A steady pace</h3></div><div className="progress-icon"><Target size={18} /></div></div>
          <div className="progress-ring-wrap"><div className="progress-ring" style={{ '--progress': `${completedPercent * 3.6}deg` } as React.CSSProperties}><div className="ring-center"><b>{completedPercent}<small>%</small></b><span>complete</span></div></div></div>
          <div className="progress-stats"><div><b>{summary.todayCompleted}<span> / {summary.todayTotal}</span></b><small>tasks done</small></div><div><b>{formatMinutes(summary.focusMinutesToday)}</b><small>in focus</small></div></div>
          <div className="progress-note"><span className="note-dot" />{summary.overdueCount ? `${summary.overdueCount} item${summary.overdueCount === 1 ? '' : 's'} need a new plan` : 'You’re right where you need to be'}</div>
        </div>
      </section>
      <section className="dashboard-lower">
        <div className="panel agenda-panel">
          <div className="section-heading"><div><span className="eyebrow">YOUR PLAN</span><h2>Today’s focus</h2></div><Link href="/tasks" className="text-link">All tasks <ArrowRight size={15} /></Link></div>
          {next.length ? <div className="task-agenda">{next.map((task, index) => <TaskRow key={task.id} task={task} index={index} onComplete={() => complete(task)} onFocus={() => startFocus(task)} busy={updateTask.isPending} />)}</div> : <EmptyState title="A clean slate" body="Add a task to give your day a gentle direction." action={<Link href="/tasks" className="button button-outline">Create your first task</Link>} />}
        </div>
        <div className="right-rail">
          <div className="panel week-panel"><div className="section-heading compact-heading"><div><span className="eyebrow">YOUR WEEK</span><h2>Focus time</h2></div><Link href="/productivity" className="icon-button"><ArrowUpRight size={17} /></Link></div>
            <div className="week-chart">{weekly.length ? weekly.map((mins, index) => <div className="week-bar-column" key={`${index}-${mins}`}><span className="week-bar-value">{mins ? Math.round(mins / 60 * 10) / 10 : ''}</span><div className="week-bar-track"><div className={cx('week-bar', index === weekly.length - 1 && 'week-bar-current')} style={{ height: `${Math.max(4, mins / maxMinutes * 100)}%` }} /></div><span className="week-day">{['M', 'T', 'W', 'T', 'F', 'S', 'S'][index % 7]}</span></div>) : <div className="chart-empty">Your week will take shape here.</div>}</div>
            <div className="week-total"><span>Weekly focus</span><b>{formatMinutes(weekly.reduce((sum, value) => sum + value, 0))}</b></div>
          </div>
          <div className="project-panel"><div className="project-topline"><span className="eyebrow">IN MOTION</span><FolderKanban size={18} /></div>
            {data.projects[0] ? <><h3>{data.projects[0].title}</h3><p>{data.projects[0].goal}</p><div className="project-progress"><span style={{ width: `${data.projects[0].progressPercent}%` }} /></div><div className="project-meta"><span>{data.projects[0].progressPercent}% complete</span><span>{dateAt(data.projects[0].deadline)}</span></div></> : <><h3>Nothing on the board yet</h3><p>Make a project for work that deserves its own space.</p><Link href="/tasks" className="text-link">Create a project <ArrowRight size={14} /></Link></>}
          </div>
        </div>
      </section>
      {focusTask && <FocusDialog task={focusTask} saving={focusMutation.isPending} onClose={() => setFocusTask(null)} onFinish={(actualMinutes, outcome) => finishFocus(focusTask, actualMinutes, outcome)} />}
    </div>
  );
}

function getDaypart() {
  const hour = new Date().getHours();
  return hour < 12 ? 'morning' : hour < 17 ? 'afternoon' : 'evening';
}
function formatMinutes(minutes: number) {
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  const remainder = minutes % 60;
  return remainder ? `${hours}h ${remainder}m` : `${hours}h`;
}

function TaskRow({ task, index, onComplete, onFocus, busy, onDelete }: { task: Task; index: number; onComplete: () => void; onFocus?: () => void; busy?: boolean; onDelete?: () => void }) {
  return <div className="task-row" data-testid={`task-row-${task.id}`}>
    <button className="task-check" aria-label={`Complete ${task.title}`} onClick={onComplete} disabled={busy}><Circle size={20} strokeWidth={1.7} /></button>
    <div className="task-row-index">{String(index + 1).padStart(2, '0')}</div>
    <div className="task-row-main"><b>{task.title}</b><div className="task-meta-line"><span className={cx('priority-dot', `priority-${task.priority}`)} />{task.priority}<span className="meta-separator">·</span>{task.category}<span className="meta-separator">·</span><Clock3 size={12} />{task.estimateMinutes} min</div></div>
    <span className="task-due">{task.dueAt ? dateAt(task.dueAt) : 'Flexible'}</span>
    {onFocus && <button className="row-focus" onClick={onFocus} aria-label={`Focus on ${task.title}`}><Focus size={15} /></button>}
    {onDelete && <button className="row-focus row-delete" onClick={onDelete} aria-label={`Delete ${task.title}`}><X size={15} /></button>}
  </div>;
}

function FocusDialog({ task, saving, onClose, onFinish }: { task: Task; saving: boolean; onClose: () => void; onFinish: (actualMinutes: number, outcome: FocusSessionInputOutcome) => void }) {
  const [seconds, setSeconds] = useState(25 * 60);
  const [running, setRunning] = useState(false);
  const [started, setStarted] = useState(false);
  const [reviewing, setReviewing] = useState(false);
  const [outcome, setOutcome] = useState<FocusSessionInputOutcome>('as_expected');
  useEffect(() => {
    if (!running) return undefined;
    const id = window.setInterval(() => setSeconds((value) => Math.max(0, value - 1)), 1000);
    return () => window.clearInterval(id);
  }, [running]);
  return <div className="modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}><div className="focus-dialog modal-card" role="dialog" aria-modal="true" aria-labelledby="focus-title">
    <button className="modal-close" onClick={onClose} aria-label="Close"><X size={19} /></button><div className="focus-dialog-mark"><Focus size={20} /></div><span className="eyebrow">A MOMENT FOR ONE THING</span><h2 id="focus-title">{task.title}</h2><p>Settle in. The rest can wait.</p>
    <div className="timer-display">{String(Math.floor(seconds / 60)).padStart(2, '0')}<span>:</span>{String(seconds % 60).padStart(2, '0')}</div>
    {!reviewing ? <div className="focus-dialog-actions"><button className="button button-outline" onClick={() => { setStarted(true); setRunning((value) => !value); }}>{running ? 'Pause timer' : started ? 'Resume timer' : 'Start timer'}</button><button className="button button-primary" onClick={() => { setRunning(false); setReviewing(true); }} disabled={!started}>{<Check size={16} />} End focus session</button></div>
      : <div className="focus-review"><b>How did that feel?</b><span>Choose what best reflects the time you spent.</span><div className="outcome-options">{([{ value: 'easier', label: 'Easier than expected' }, { value: 'as_expected', label: 'As expected' }, { value: 'longer', label: 'Took longer' }] as const).map((item) => <button type="button" key={item.value} aria-pressed={outcome === item.value} className={cx('outcome-option', outcome === item.value && 'outcome-selected')} onClick={() => setOutcome(item.value)}>{item.label}</button>)}</div><div className="focus-dialog-actions"><button className="button button-outline" onClick={() => setReviewing(false)}>Back to timer</button><button className="button button-primary" onClick={() => onFinish(Math.max(1, Math.ceil((25 * 60 - seconds) / 60)), outcome)} disabled={saving}>{saving ? <LoaderCircle className="spin" size={16} /> : <Check size={16} />} Save focus session</button></div></div>}
  </div></div>;
}

function TasksPage() {
  const workspace = useGetWorkspace();
  const refresh = useRefreshWorkspace();
  const [showCreate, setShowCreate] = useState(false);
  const [showProject, setShowProject] = useState(false);
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState('all');
  const [toast, setToast] = useState('');
  const createTask = useCreateTask();
  const updateTask = useUpdateTask();
  const deleteTask = useDeleteTask();
  const shownTasks = useMemo(() => {
    const tasks = workspace.data?.tasks ?? [];
    return tasks.filter((task) => (filter === 'all' || task.status === filter) && `${task.title} ${task.description ?? ''}`.toLowerCase().includes(search.toLowerCase())).sort((a, b) => (a.status === 'completed' ? 1 : 0) - (b.status === 'completed' ? 1 : 0));
  }, [workspace.data?.tasks, filter, search]);
  if (workspace.isLoading) return <LoadingState />;
  if (workspace.isError) return <QueryError onRetry={() => void workspace.refetch()} />;
  const create = (payload: TaskInput) => createTask.mutateAsync({ data: payload });
  const finishTaskCreation = (message: string) => {
    refresh();
    setShowCreate(false);
    setToast(message);
    window.setTimeout(() => setToast(''), 3000);
  };
  const markComplete = (task: Task) => updateTask.mutate({ taskId: task.id, data: { status: task.status === 'completed' ? 'not_started' : 'completed', completedAt: task.status === 'completed' ? null : new Date().toISOString() } }, { onSuccess: refresh });
  const remove = (task: Task) => { if (window.confirm(`Delete “${task.title}”? This can’t be undone.`)) deleteTask.mutate({ taskId: task.id }, { onSuccess: refresh }); };
  return <div className="page-stack">
    <PageHeading eyebrow="MAKE SPACE FOR WHAT MATTERS" title="Your tasks" description={`${workspace.data!.tasks.filter((item) => item.status !== 'completed').length} open items, one clear next step at a time.`} action={<button className="button button-primary" onClick={() => setShowCreate(true)}><Plus size={17} /> New task</button>} />
    {toast && <div className="toast-inline"><CheckCircle2 size={17} />{toast}</div>}
    <div className="task-toolbar"><div className="search-field"><Search size={16} /><input aria-label="Search tasks" placeholder="Find a task..." value={search} onChange={(event) => setSearch(event.target.value)} data-testid="input-search-tasks" /></div>
      <div className="filter-pills">{[['all', 'All'], ['not_started', 'To do'], ['in_progress', 'In progress'], ['completed', 'Done']].map(([value, label]) => <button key={value} className={cx('filter-pill', filter === value && 'filter-selected')} onClick={() => setFilter(value)}>{label}</button>)}</div>
      <button className="button button-quiet project-add" onClick={() => setShowProject(true)}><FolderKanban size={15} /> New project</button></div>
    <div className="tasks-layout">
      <section className="panel task-list-panel"><div className="section-heading"><div><span className="eyebrow">TASK LIST</span><h2>{filter === 'all' ? 'Everything in play' : filter === 'completed' ? 'Completed work' : filter === 'in_progress' ? 'In progress' : 'Up next'}</h2></div><span className="count-chip">{shownTasks.length} items</span></div>
        {shownTasks.length ? <div className="full-task-list">{shownTasks.map((task, index) => <div key={task.id} className={cx('full-task-item', task.status === 'completed' && 'task-completed')}><button className="task-check" aria-label={task.status === 'completed' ? 'Reopen task' : 'Complete task'} onClick={() => markComplete(task)} disabled={updateTask.isPending}>{task.status === 'completed' ? <CheckCircle2 size={20} /> : <Circle size={20} />}</button><div className="full-task-body"><b>{task.title}</b>{task.description && <p>{task.description}</p>}<div className="task-meta-line"><span className={cx('priority-dot', `priority-${task.priority}`)} />{task.priority}<span className="meta-separator">·</span>{task.category}<span className="meta-separator">·</span><Clock3 size={12} />{task.estimateMinutes} min{task.dueAt && <><span className="meta-separator">·</span><CalendarDays size={12} />Due {dateAt(task.dueAt)}</>}</div></div><span className={cx('status-chip', `status-${task.status}`)}>{task.status.replace('_', ' ')}</span><button className="icon-button delete-task" aria-label={`Delete ${task.title}`} onClick={() => remove(task)}><X size={16} /></button></div>)}</div> : <EmptyState title={search ? 'No tasks match that search' : 'Your list is yours to shape'} body={search ? 'Try another phrase or clear the search.' : 'Capture a task, then let Pilot help make it actionable.'} action={!search && <button className="button button-primary" onClick={() => setShowCreate(true)}><Plus size={16} /> Add your first task</button>} />}
      </section>
      <aside className="task-side-rail">
        <div className="ai-tip-card"><div className="ai-tip-symbol"><Sparkles size={18} /></div><span className="eyebrow">A BETTER START</span><h3>Get it out of your head.</h3><p>Write the task as you’d say it. Pilot can turn a quick thought into a useful first draft.</p><button className="text-link" onClick={() => setShowCreate(true)}>Try natural language <ArrowRight size={14} /></button></div>
        <div className="mini-project-list"><div className="section-heading compact-heading"><div><span className="eyebrow">PROJECTS</span><h3>In progress</h3></div><button className="icon-button" aria-label="Create project" onClick={() => setShowProject(true)}><Plus size={17} /></button></div>
          {workspace.data!.projects.length ? workspace.data!.projects.map((project) => <div className="mini-project" key={project.id}><div className="mini-project-dot" /><div><b>{project.title}</b><small>{project.progressPercent}% complete</small></div><ArrowRight size={14} /></div>) : <p className="soft-empty">A project gives the big picture a home.</p>}
        </div>
      </aside>
    </div>
    {showCreate && <TaskDialog projects={workspace.data!.projects} onClose={() => setShowCreate(false)} onCreate={create} onCreated={finishTaskCreation} pending={createTask.isPending} error={createTask.isError ? friendlyError(createTask.error) : ''} />}
    {showProject && <ProjectDialog onClose={() => setShowProject(false)} onCreated={() => { refresh(); setShowProject(false); }} />}
  </div>;
}

function TaskDialog({ projects, onClose, onCreate, onCreated, pending, error }: {
  projects: { id: string; title: string }[];
  onClose: () => void;
  onCreate: (data: TaskInput) => Promise<Task>;
  onCreated: (message: string) => void;
  pending: boolean;
  error: string;
}) {
  const parseTask = useParseTask();
  const decomposeTask = useDecomposeTask();
  const createChildTask = useCreateTask();
  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);
  const [natural, setNatural] = useState('');
  const [draft, setDraft] = useState<TaskDraft | null>(null);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [projectId, setProjectId] = useState('');
  const [priority, setPriority] = useState<TaskPriority>('medium');
  const [category, setCategory] = useState<TaskCategory>('work');
  const [estimate, setEstimate] = useState(30);
  const [due, setDue] = useState('');
  const [localError, setLocalError] = useState('');
  const [steps, setSteps] = useState<{ title: string; estimateMinutes: number }[]>([]);
  const [savingSteps, setSavingSteps] = useState(false);
  const [listening, setListening] = useState(false);
  const [speechMessage, setSpeechMessage] = useState('');
  const speechWindow = typeof window === 'undefined' ? null : window as Window & {
    SpeechRecognition?: SpeechRecognitionConstructor;
    webkitSpeechRecognition?: SpeechRecognitionConstructor;
  };
  const SpeechRecognition = speechWindow?.SpeechRecognition ?? speechWindow?.webkitSpeechRecognition;

  useEffect(() => () => recognitionRef.current?.stop(), []);

  const makeTaskInput = (): TaskInput => ({
    title: title.trim(),
    description,
    projectId: projectId || null,
    priority,
    category,
    estimateMinutes: Number(estimate),
    dueAt: due ? new Date(`${due}T17:00:00`).toISOString() : null,
  });
  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!title.trim()) { setLocalError('Give this task a name first.'); return; }
    setLocalError('');
    try {
      await onCreate(makeTaskInput());
      onCreated('Task added to your list.');
    } catch (cause) {
      setLocalError(friendlyError(cause));
    }
  };
  const acceptSteps = async () => {
    if (!title.trim()) { setLocalError('Name the main task before saving its steps.'); return; }
    if (!steps.length || steps.some((step) => !step.title.trim())) { setLocalError('Add a name to every suggested step before saving.'); return; }
    setSavingSteps(true);
    setLocalError('');
    try {
      const parent = await onCreate(makeTaskInput());
      let previousStepId: string | null = null;
      let savedCount = 0;
      for (const step of steps) {
        try {
          const child = await createChildTask.mutateAsync({
            data: {
              title: step.title.trim(),
              description: '',
              projectId: projectId || null,
              priority,
              category,
              estimateMinutes: Math.max(1, Number(step.estimateMinutes) || 1),
              dueAt: due ? new Date(`${due}T17:00:00`).toISOString() : null,
              parentTaskId: parent.id,
              dependencies: previousStepId ? [previousStepId] : [],
            },
          });
          previousStepId = child.id;
          savedCount += 1;
        } catch {
          break;
        }
      }
      const failedCount = steps.length - savedCount;
      onCreated(failedCount
        ? `Main task saved with ${savedCount} of ${steps.length} steps. You can add the remaining steps from your task list.`
        : `Main task and ${savedCount} steps saved to your task list.`);
    } catch (cause) {
      setLocalError(friendlyError(cause));
    } finally {
      setSavingSteps(false);
    }
  };
  const parse = () => {
    if (natural.trim().length < 3) { setLocalError('Add a little more detail so Pilot can understand it.'); return; }
    setLocalError('');
    parseTask.mutate({ data: { text: natural } }, { onSuccess: (value) => { setDraft(value); setTitle(value.title); setDescription(value.description); setPriority(value.priority); setCategory(value.category); setEstimate(value.estimateMinutes); setDue(value.dueAt ? value.dueAt.slice(0, 10) : ''); } });
  };
  const toggleVoiceEntry = () => {
    if (!SpeechRecognition) {
      setSpeechMessage('Voice entry is not supported in this browser. You can still type your task here.');
      return;
    }
    if (listening) {
      recognitionRef.current?.stop();
      setListening(false);
      return;
    }
    const recognition = new SpeechRecognition();
    recognition.lang = navigator.language || 'en-US';
    recognition.interimResults = false;
    recognition.onresult = (event) => {
      const transcript = Array.from(event.results).map((result) => result[0]?.transcript ?? '').join(' ').trim();
      if (transcript) setNatural((current) => `${current.trim()} ${transcript}`.trim());
      setSpeechMessage('');
    };
    recognition.onerror = (event) => {
      setListening(false);
      setSpeechMessage(event.error === 'not-allowed'
        ? 'Microphone access is off. Allow it in your browser settings, or keep typing.'
        : 'Voice entry stopped. Your text is still here; you can keep typing.');
    };
    recognition.onend = () => {
      setListening(false);
      recognitionRef.current = null;
    };
    recognitionRef.current = recognition;
    setSpeechMessage('Listening… speak your task, then pause.');
    setListening(true);
    try {
      recognition.start();
    } catch {
      setListening(false);
      setSpeechMessage('Voice entry could not start. You can still type your task.');
    }
  };

  return <Modal title="New task" eyebrow="CAPTURE A THOUGHT" onClose={onClose} wide>
    <div className="natural-entry">
      <div className="natural-entry-title"><span className="ai-tip-symbol"><Sparkles size={17} /></span><div><b>Say it naturally</b><small>Pilot will suggest a useful task draft.</small></div></div>
      <div className="natural-input-row">
        <input placeholder="e.g. Send the project brief to Maya by Friday" value={natural} onChange={(event) => setNatural(event.target.value)} />
        <button type="button" className={cx('voice-button', listening && 'voice-listening')} onClick={toggleVoiceEntry} aria-label={listening ? 'Stop voice entry' : 'Use voice entry'} title={SpeechRecognition ? 'Use voice entry' : 'Voice entry is not supported in this browser'}><Mic size={16} /></button>
        <button type="button" className="button button-dark" onClick={parse} disabled={parseTask.isPending}>{parseTask.isPending ? <LoaderCircle className="spin" size={15} /> : <Sparkles size={15} />} Draft it</button>
      </div>
      {!SpeechRecognition && <p className="voice-fallback">Voice entry is not available here. Text entry is ready whenever you are.</p>}
      {speechMessage && <p className={cx('voice-fallback', listening && 'voice-active')}>{speechMessage}</p>}
      {parseTask.isError && <p className="form-error">{friendlyError(parseTask.error)}</p>}
      {draft && <div className="draft-notice"><CheckCircle2 size={15} /> Draft ready — review the details below before saving.</div>}
    </div>
    <form onSubmit={submit} className="form-stack"><div className="form-two"><Field label="Task name"><input autoFocus maxLength={180} value={title} onChange={(event) => setTitle(event.target.value)} placeholder="What needs doing?" /></Field><Field label="Project"><select value={projectId} onChange={(event) => setProjectId(event.target.value)}><option value="">No project</option>{projects.map((project) => <option key={project.id} value={project.id}>{project.title}</option>)}</select></Field></div>
      <Field label="Details"><textarea maxLength={2000} rows={3} value={description} onChange={(event) => setDescription(event.target.value)} placeholder="A little context helps you pick this up later." /></Field>
      {title.trim().length > 1 && <div className="decompose-row"><button type="button" className="text-link" onClick={() => decomposeTask.mutate({ data: { title, description } }, { onSuccess: setSteps })} disabled={decomposeTask.isPending}>{decomposeTask.isPending ? <LoaderCircle className="spin" size={14} /> : <Sparkles size={14} />} Break this into steps</button>{decomposeTask.isError && <span className="form-error">{friendlyError(decomposeTask.error)}</span>}</div>}
      {steps.length > 0 && <div className="decomposition-list"><div className="decomposition-heading"><span className="eyebrow">SUGGESTED STEPS</span><button type="button" className="text-link" onClick={() => setSteps((current) => [...current, { title: '', estimateMinutes: 15 }])}><Plus size={13} /> Add a step</button></div>
        {steps.map((step, index) => <div className="decomposition-step" key={`suggested-step-${index}`}><span className="decomposition-number">{String(index + 1).padStart(2, '0')}</span><input aria-label={`Step ${index + 1} title`} value={step.title} placeholder="Name this step" onChange={(event) => setSteps((current) => current.map((item, itemIndex) => itemIndex === index ? { ...item, title: event.target.value } : item))} /><input className="step-estimate" type="number" min="1" max="1440" aria-label={`Step ${index + 1} estimate in minutes`} value={step.estimateMinutes} onChange={(event) => setSteps((current) => current.map((item, itemIndex) => itemIndex === index ? { ...item, estimateMinutes: Number(event.target.value) } : item))} /><span className="step-minutes-label">min</span><button type="button" className="remove-step" aria-label={`Remove step ${index + 1}`} onClick={() => setSteps((current) => current.filter((_, itemIndex) => itemIndex !== index))}><X size={15} /></button></div>)}
        <button type="button" className="button button-outline accept-steps-button" onClick={acceptSteps} disabled={savingSteps || pending || !steps.length || steps.some((step) => !step.title.trim())}>{savingSteps ? <LoaderCircle className="spin" size={15} /> : <Check size={15} />}{savingSteps ? 'Saving task and steps…' : `Save main task + ${steps.length} steps`}</button>
      </div>}
      <div className="form-three"><Field label="Priority"><select value={priority} onChange={(event) => setPriority(event.target.value as TaskPriority)}>{['low', 'medium', 'high', 'critical'].map((item) => <option key={item} value={item}>{capitalize(item)}</option>)}</select></Field><Field label="Category"><select value={category} onChange={(event) => setCategory(event.target.value as TaskCategory)}>{['work', 'study', 'personal', 'project', 'health', 'other'].map((item) => <option key={item} value={item}>{capitalize(item)}</option>)}</select></Field><Field label="Estimate (min)"><input type="number" min="1" max="1440" value={estimate} onChange={(event) => setEstimate(Number(event.target.value))} /></Field></div>
      <Field label="Due date"><input type="date" value={due} onChange={(event) => setDue(event.target.value)} /></Field>
      {(error || localError) && <p className="form-error">{localError || error}</p>}<div className="modal-actions"><button type="button" className="button button-outline" onClick={onClose}>Cancel</button><button type="submit" className="button button-primary" disabled={pending || savingSteps || createChildTask.isPending}>{pending ? <LoaderCircle className="spin" size={16} /> : <Plus size={16} />} Create task</button></div>
    </form>
  </Modal>;
}

function ProjectDialog({ onClose, onCreated }: { onClose: () => void; onCreated: () => void }) {
  const createProject = useCreateProject();
  const [title, setTitle] = useState('');
  const [goal, setGoal] = useState('');
  const [deadline, setDeadline] = useState('');
  return <Modal title="Create a project" eyebrow="THE BIGGER PICTURE" onClose={onClose}>
    <form className="form-stack" onSubmit={(event) => { event.preventDefault(); createProject.mutate({ data: { title, goal, deadline: deadline ? new Date(`${deadline}T17:00:00`).toISOString() : null } }, { onSuccess: onCreated }); }}>
      <Field label="Project name"><input autoFocus required maxLength={180} value={title} onChange={(event) => setTitle(event.target.value)} placeholder="What are you working toward?" /></Field>
      <Field label="Goal"><textarea required maxLength={2000} rows={3} value={goal} onChange={(event) => setGoal(event.target.value)} placeholder="Describe what done looks like." /></Field>
      <Field label="Target date"><input type="date" value={deadline} onChange={(event) => setDeadline(event.target.value)} /></Field>
      {createProject.isError && <p className="form-error">{friendlyError(createProject.error)}</p>}<div className="modal-actions"><button type="button" className="button button-outline" onClick={onClose}>Cancel</button><button className="button button-primary" disabled={createProject.isPending}>{createProject.isPending ? 'Creating…' : 'Create project'}</button></div>
    </form>
  </Modal>;
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <label className="field"><span>{label}</span>{children}</label>;
}
function Modal({ title, eyebrow, onClose, children, wide }: { title: string; eyebrow: string; onClose: () => void; children: React.ReactNode; wide?: boolean }) {
  return <div className="modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}><div className={cx('modal-card', wide && 'modal-wide')} role="dialog" aria-modal="true" aria-label={title}><button className="modal-close" onClick={onClose} aria-label="Close"><X size={18} /></button><div className="eyebrow">{eyebrow}</div><h2 className="modal-title">{title}</h2>{children}</div></div>;
}

function PlannerPage() {
  const [, setLocation] = useLocation();
  const workspace = useGetWorkspace();
  const refresh = useRefreshWorkspace();
  const nextAction = useGetNextAction();
  const previewReplan = usePreviewReplan();
  const acceptReplan = useAcceptReplan();
  const [rec, setRec] = useState<ReturnType<typeof useGetNextAction>['data']>(undefined);
  const [preview, setPreview] = useState<ReturnType<typeof usePreviewReplan>['data']>(undefined);
  const [reason, setReason] = useState<'not_completed' | 'meeting_added' | 'time_changed'>('not_completed');
  const [minutes, setMinutes] = useState(240);
  const [taskId, setTaskId] = useState('');
  const [message, setMessage] = useState('');
  if (workspace.isLoading) return <LoadingState />;
  if (workspace.isError) return <QueryError onRetry={() => void workspace.refetch()} />;
  const getRecommendation = () => nextAction.mutate({ data: { now: new Date().toISOString(), availableMinutes: minutes } }, { onSuccess: setRec });
  const requestPreview = () => previewReplan.mutate({ data: { reason, taskId: reason === 'not_completed' ? taskId || null : null, availableMinutes: minutes, now: new Date().toISOString() } }, { onSuccess: (value) => { setPreview(value); setMessage(''); } });
  const accept = () => acceptReplan.mutate({ data: { updates: (preview?.changes ?? []).map((change) => ({ taskId: change.taskId, scheduledAt: change.to })) } }, { onSuccess: () => { refresh(); setMessage('Your day has been replanned.'); setPreview(undefined); } });
  return <div className="page-stack">
    <PageHeading eyebrow="A CLEARER WAY THROUGH" title="Make a plan that fits." description="A good plan makes room for the work and the person doing it." action={<Link href="/calendar" className="button button-outline"><CalendarDays size={16} /> Open calendar</Link>} />
    {message && <div className="toast-inline"><CheckCircle2 size={17} />{message}</div>}
    <div className="planner-layout">
      <section className="planner-main">
        <div className="recommendation-card"><div className="rec-header"><div className="rec-icon"><Sparkles size={19} /></div><div><span className="eyebrow">PILOT’S RECOMMENDATION</span><h2>What’s the best next move?</h2></div><span className="powered-label"><span />WORKSPACE-AWARE</span></div>
          {rec ? <div className="recommendation-result"><div className="rec-score"><span>FIT SCORE</span><b>{Math.round(rec.score)}<small>/100</small></b></div><div className="rec-task"><span className={cx('priority-dot', `priority-${rec.task.priority}`)} />{rec.task.priority} priority · {rec.task.estimateMinutes} min<h3>{rec.task.title}</h3><p>{rec.reason}</p><button className="button button-primary" onClick={() => setLocation('/')}>Make this my focus <ArrowRight size={15} /></button></div></div> :
            <div className="rec-prompt"><div className="rec-illustration"><Compass size={32} strokeWidth={1.2} /></div><div><h3>Less weighing. More doing.</h3><p>Pilot looks at your deadlines, available time, and current work to recommend one meaningful next step.</p></div><button className="button button-primary" onClick={getRecommendation} disabled={nextAction.isPending}>{nextAction.isPending ? <LoaderCircle className="spin" size={16} /> : <Sparkles size={16} />} Find my next step</button></div>}
          {nextAction.isError && <p className="form-error">{friendlyError(nextAction.error)}</p>}
          {rec?.alternatives?.length ? <div className="alternatives"><span className="eyebrow">OTHER GOOD OPTIONS</span>{rec.alternatives.slice(0, 2).map((task) => <div key={task.id}><Circle size={15} />{task.title}<span>{task.estimateMinutes} min</span></div>)}</div> : null}
        </div>
        <div className="planner-explainer"><div><span className="eyebrow">A PLAN THAT FLEXES</span><h2>Life happens. Your plan can move with it.</h2><p>When a meeting runs long or a priority shifts, Pilot can help you find a new shape for the day without losing sight of what matters.</p></div><div className="replan-step-list"><div><span>01</span><b>Tell Pilot what changed</b></div><div><span>02</span><b>Review the proposed shifts</b></div><div><span>03</span><b>Keep the plan that feels right</b></div></div></div>
      </section>
      <aside className="panel replan-panel"><div className="replan-heading"><div className="replan-icon"><AlarmClock size={18} /></div><div><span className="eyebrow">REPLAN YOUR DAY</span><h2>Plans changed?</h2></div></div><p className="replan-intro">A small change doesn’t have to derail the whole day.</p>
        <Field label="What shifted?"><select value={reason} onChange={(event) => setReason(event.target.value as typeof reason)}><option value="not_completed">I didn’t finish a task</option><option value="meeting_added">A meeting was added</option><option value="time_changed">My available time changed</option></select></Field>
        <Field label="Time left to work"><div className="minutes-input"><input type="number" min="15" max="960" step="15" value={minutes} onChange={(event) => setMinutes(Number(event.target.value))} /><span>minutes</span></div></Field>
        {reason === 'not_completed' && <Field label="Task to move"><select id="replan-task" value={taskId} onChange={(event) => setTaskId(event.target.value)}><option value="">Choose a task (optional)</option>{workspace.data!.tasks.filter((task) => task.status !== 'completed').map((task) => <option key={task.id} value={task.id}>{task.title}</option>)}</select></Field>}
        <button className="button button-primary button-full" onClick={requestPreview} disabled={previewReplan.isPending}>{previewReplan.isPending ? <LoaderCircle className="spin" size={16} /> : <Zap size={16} />} Preview a new plan</button>
        {previewReplan.isError && <p className="form-error">{friendlyError(previewReplan.error)}</p>}
        {preview && <div className="replan-preview"><div className="preview-summary"><CheckCircle2 size={16} /><b>Proposed changes</b></div><p>{preview.summary}</p><div className="change-list">{preview.changes.map((change) => <div className="change-row" key={change.taskId}><span>{change.title}</span><small>{change.from ? timeAt(change.from) : 'Unscheduled'} <ArrowRight size={12} /> {change.to ? timeAt(change.to) : 'Unscheduled'}</small></div>)}</div><button className="button button-primary button-full" onClick={accept} disabled={acceptReplan.isPending}>{acceptReplan.isPending ? 'Saving plan…' : 'Accept this plan'}</button><button className="button button-quiet button-full" onClick={() => setPreview(undefined)}>Keep my current plan</button></div>}
        <div className="privacy-note"><Bot size={15} /> Grounded in your workspace, not generic advice.</div>
      </aside>
    </div>
  </div>;
}

function CalendarPage() {
  const workspace = useGetWorkspace();
  const refresh = useRefreshWorkspace();
  const [view, setView] = useState<'day' | 'week' | 'month'>('week');
  const [weekOffset, setWeekOffset] = useState(0);
  const [monthOffset, setMonthOffset] = useState(0);
  const [showEvent, setShowEvent] = useState(false);
  const [selectedDate, setSelectedDate] = useState(todayISO());
  if (workspace.isLoading) return <LoadingState />;
  if (workspace.isError) return <QueryError onRetry={() => void workspace.refetch()} />;
  const events = workspace.data!.events;
  const tasks = workspace.data!.tasks.filter((task) => task.status !== 'completed');
  const weekStart = new Date(); weekStart.setDate(weekStart.getDate() - ((weekStart.getDay() + 6) % 7) + weekOffset * 7); weekStart.setHours(0, 0, 0, 0);
  const monthDate = new Date(); monthDate.setDate(1); monthDate.setMonth(monthDate.getMonth() + monthOffset);
  const monthStart = new Date(monthDate); monthStart.setDate(1 - ((monthDate.getDay() + 6) % 7)); monthStart.setHours(0, 0, 0, 0);
  const days = view === 'day' ? [new Date(selectedDate + 'T12:00:00')] : Array.from({ length: view === 'week' ? 7 : 42 }, (_, index) => { const date = new Date(view === 'month' ? monthStart : weekStart); date.setDate(date.getDate() + index); return date; });
  const visibleEvents = (date: Date) => events.filter((event) => new Date(event.startAt).toDateString() === date.toDateString());
  const visibleTasks = (date: Date) => tasks.filter((task) => task.scheduledAt && new Date(task.scheduledAt).toDateString() === date.toDateString());
  const periodLabel = view === 'day' ? new Date(selectedDate + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' }) : view === 'month' ? monthDate.toLocaleDateString('en-US', { month: 'long', year: 'numeric' }) : `${weekStart.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} – ${new Date(weekStart.getTime() + 6 * 86400000).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`;
  return <div className="page-stack">
    <PageHeading eyebrow="GIVE YOUR TIME A SHAPE" title="Calendar" description="See the spaces you’ve made for focused work and everything around it." action={<button className="button button-primary" onClick={() => setShowEvent(true)}><Plus size={17} /> Add event</button>} />
    <section className="panel calendar-panel">
      <div className="calendar-toolbar"><div className="calendar-period-nav"><button className="icon-button" aria-label="Previous period" onClick={() => view === 'day' ? setSelectedDate(shiftDate(selectedDate, -1)) : view === 'month' ? setMonthOffset((value) => value - 1) : setWeekOffset((value) => value - 1)}><ChevronLeft size={18} /></button><button className="icon-button" aria-label="Next period" onClick={() => view === 'day' ? setSelectedDate(shiftDate(selectedDate, 1)) : view === 'month' ? setMonthOffset((value) => value + 1) : setWeekOffset((value) => value + 1)}><ChevronRight size={18} /></button><h2>{periodLabel}</h2></div><div className="calendar-tools"><button className="button button-quiet today-button" onClick={() => { setWeekOffset(0); setMonthOffset(0); setSelectedDate(todayISO()); }}>Today</button><div className="segmented-control">{(['day', 'week', 'month'] as const).map((item) => <button key={item} className={view === item ? 'segment-active' : ''} onClick={() => setView(item)}>{capitalize(item)}</button>)}</div></div></div>
      <div className={cx('calendar-grid', `calendar-${view}`)}>
        {view !== 'day' && <div className="calendar-day-names">{['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map((day) => <span key={day}>{day}</span>)}</div>}
        <div className="calendar-days-grid">{days.map((date, index) => {
          const evts = visibleEvents(date); const dayTasks = visibleTasks(date);
          const inMonth = view !== 'month' || date.getMonth() === monthDate.getMonth();
          const isToday = date.toDateString() === new Date().toDateString();
          return <button className={cx('calendar-day-cell', !inMonth && 'outside-month', isToday && 'calendar-today', view === 'day' && 'calendar-day-expanded')} key={date.toISOString()} onClick={() => { setSelectedDate(date.toISOString().slice(0, 10)); if (view === 'month') setView('day'); }}>
            <span className="calendar-date">{view === 'day' ? date.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' }) : <>{view === 'week' && <small>{['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'][index]}</small>}<b>{date.getDate()}</b></>}</span>
            <div className="calendar-cell-items">{evts.slice(0, view === 'month' ? 2 : 3).map((event) => <CalendarChip key={event.id} event={event} />)}{dayTasks.slice(0, view === 'month' ? 1 : 2).map((task) => <div className="calendar-task-chip" key={task.id}><span />{task.title}</div>)}{evts.length + dayTasks.length > 3 && <small className="more-events">+{evts.length + dayTasks.length - 3} more</small>}</div>
            {view === 'day' && !evts.length && !dayTasks.length && <div className="day-empty-copy">No events yet. Add a little structure to the day.</div>}
          </button>;
        })}</div>
      </div>
      <div className="calendar-legend"><span><i className="legend-event" />Events</span><span><i className="legend-focus" />Focus blocks</span><span><i className="legend-deadline" />Deadlines</span></div>
    </section>
    {showEvent && <EventDialog date={selectedDate} onClose={() => setShowEvent(false)} onCreated={() => { refresh(); setShowEvent(false); }} />}
  </div>;
}
function shiftDate(date: string, offset: number) { const value = new Date(date + 'T12:00:00'); value.setDate(value.getDate() + offset); return value.toISOString().slice(0, 10); }
function CalendarChip({ event }: { event: CalendarEvent }) {
  return <div className={cx('calendar-event-chip', `event-${event.eventType}`)}><span>{timeAt(event.startAt)}</span>{event.title}</div>;
}
function EventDialog({ date, onClose, onCreated }: { date: string; onClose: () => void; onCreated: () => void }) {
  const createEvent = useCreateCalendarEvent();
  const [title, setTitle] = useState('');
  const [type, setType] = useState<'meeting' | 'break' | 'focus' | 'deadline'>('meeting');
  const [startDate, setStartDate] = useState(date);
  const [startTime, setStartTime] = useState('09:00');
  const [endTime, setEndTime] = useState('10:00');
  const [description, setDescription] = useState('');
  const submit = (event: FormEvent) => {
    event.preventDefault();
    createEvent.mutate({ data: { title, eventType: type, startAt: localDateTime(`${startDate}T${startTime}:00`), endAt: localDateTime(`${startDate}T${endTime}:00`), description } }, { onSuccess: onCreated });
  };
  return <Modal title="Add to your calendar" eyebrow="MAKE ROOM FOR IT" onClose={onClose}><form className="form-stack" onSubmit={submit}>
    <Field label="Event name"><input autoFocus required maxLength={180} value={title} onChange={(event) => setTitle(event.target.value)} placeholder="What’s happening?" /></Field>
    <Field label="Type"><select value={type} onChange={(event) => setType(event.target.value as typeof type)}>{['meeting', 'break', 'focus', 'deadline'].map((item) => <option key={item} value={item}>{capitalize(item)}</option>)}</select></Field>
    <Field label="Date"><input type="date" required value={startDate} onChange={(event) => setStartDate(event.target.value)} /></Field>
    <div className="form-two"><Field label="Starts"><input type="time" value={startTime} onChange={(event) => setStartTime(event.target.value)} /></Field><Field label="Ends"><input type="time" value={endTime} onChange={(event) => setEndTime(event.target.value)} /></Field></div>
    <Field label="Notes"><textarea rows={2} value={description} onChange={(event) => setDescription(event.target.value)} placeholder="Optional context" /></Field>
    {createEvent.isError && <p className="form-error">{friendlyError(createEvent.error)}</p>}<div className="modal-actions"><button type="button" className="button button-outline" onClick={onClose}>Cancel</button><button className="button button-primary" disabled={createEvent.isPending}>{createEvent.isPending ? 'Adding…' : 'Add event'}</button></div>
  </form></Modal>;
}

function ProductivityPage() {
  const workspace = useGetWorkspace();
  const metrics = useGetDashboard();
  if (workspace.isLoading || metrics.isLoading) return <LoadingState />;
  if (workspace.isError || metrics.isError) return <QueryError onRetry={() => { void workspace.refetch(); void metrics.refetch(); }} />;
  const summary = metrics.data!;
  const sessions = workspace.data!.sessions;
  const completedTasks = workspace.data!.tasks.filter((task) => task.status === 'completed');
  const recordedSessions = sessions.filter((session) => session.completed && session.actualMinutes > 0);
  const hasHistory = completedTasks.length > 0 || recordedSessions.length > 0;
  const observation = getProductivityObservation(completedTasks, recordedSessions, workspace.data!.tasks);
  const average = summary.averageCompletionMinutes;
  const total = summary.weeklyFocusMinutes.reduce((sum, item) => sum + item, 0);
  const max = Math.max(1, ...summary.weeklyFocusMinutes);
  return <div className="page-stack">
    <PageHeading eyebrow="NOTICE THE PROGRESS" title="Your work, in perspective." description="A few signals to help you understand the rhythm you’re building." action={<span className="period-chip"><TrendingUp size={15} /> This week</span>} />
    <div className="metric-grid"><MetricCard label="FOCUS THIS WEEK" value={formatMinutes(total)} detail={`${sessions.length} sessions recorded`} icon={<Focus size={18} />} trend="A little attention, often." /><MetricCard label="TODAY’S COMPLETION" value={`${summary.productivityPercent}%`} detail={`${summary.todayCompleted} of ${summary.todayTotal} tasks`} icon={<CheckCircle2 size={18} />} trend="Progress over perfection." /><MetricCard label="AVERAGE TASK TIME" value={average ? formatMinutes(average) : '—'} detail="Across completed tasks" icon={<Clock3 size={18} />} trend="Use this to plan with care." /><MetricCard label="OVERDUE ITEMS" value={String(summary.overdueCount)} detail={summary.overdueCount ? 'Worth a fresh look' : 'Nothing waiting behind you'} icon={<AlarmClock size={18} />} trend={summary.overdueCount ? 'Replan, don’t reprimand.' : 'Your list has room.'} alert={summary.overdueCount > 0} /></div>
    <div className="analytics-layout">
      <section className="panel analytics-chart-panel"><div className="section-heading"><div><span className="eyebrow">FOCUS RHYTHM</span><h2>Minutes with your attention</h2></div><span className="chart-key"><i />Focused minutes</span></div>
        {recordedSessions.length ? <>
          <div className="analytics-chart"><div className="chart-y-axis"><span>4h</span><span>3h</span><span>2h</span><span>1h</span><span>0</span></div><div className="chart-plot"><div className="chart-guides"><i /><i /><i /><i /><i /></div><div className="analytics-bars">{summary.weeklyFocusMinutes.map((value, index) => <div className="analytics-bar-column" key={`${index}-${value}`}><div className="analytics-value">{value ? formatMinutes(value) : ''}</div><div className={cx('analytics-bar', index === new Date().getDay() - 1 && 'analytics-bar-today')} style={{ height: `${Math.max(3, value / Math.max(240, max) * 100)}%` }} /><span>{['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'][index]}</span></div>)}</div></div></div>
        </> : <div className="analytics-empty"><div className="empty-mark"><Focus size={18} /></div><b>No focus history yet</b><span>Completed focus sessions will bring your weekly rhythm into view.</span></div>}
        {hasHistory && <div className="chart-insight"><div className="insight-mark"><Sparkles size={16} /></div><p><b>{observation.title}</b> {observation.detail}</p></div>}
      </section>
      <section className="panel session-panel"><div className="section-heading"><div><span className="eyebrow">RECENT SESSIONS</span><h2>Time well spent</h2></div><span className="count-chip">{sessions.length}</span></div>
        {sessions.length ? <div className="session-list">{[...sessions].sort((a, b) => b.startedAt.localeCompare(a.startedAt)).slice(0, 6).map((session) => {
          const task = workspace.data!.tasks.find((item) => item.id === session.taskId);
          return <div className="session-row" key={session.id}><div className="session-check"><Check size={14} /></div><div className="session-copy"><b>{task?.title || 'Focus session'}</b><small>{dateAt(session.startedAt, { month: 'short', day: 'numeric' })} · {timeAt(session.startedAt)}</small></div><span>{formatMinutes(session.actualMinutes)}</span></div>;
        })}</div> : <EmptyState title="Your first session is waiting" body="Start a focus session from any task. This space will help you notice your rhythm." />}
      </section>
    </div>
    <div className="insight-footer"><Flame size={18} /><div><b>{hasHistory ? observation.title : 'A fresh start is a real start.'}</b><span>{hasHistory ? observation.detail : 'Complete a task or save a focus session to begin building a picture of your work.'}</span></div><Link href="/" className="text-link">Back to today <ArrowRight size={14} /></Link></div>
  </div>;
}
function getProductivityObservation(
  completedTasks: Task[],
  sessions: { taskId: string; actualMinutes: number; startedAt: string }[],
  tasks: Task[],
) {
  const latest = [...sessions].sort((a, b) => b.startedAt.localeCompare(a.startedAt))[0];
  if (latest) {
    const taskTitle = tasks.find((task) => task.id === latest.taskId)?.title;
    const previous = sessions.filter((session) => session !== latest);
    if (previous.length) {
      const previousAverage = previous.reduce((sum, session) => sum + session.actualMinutes, 0) / previous.length;
      const difference = Math.round(latest.actualMinutes - previousAverage);
      if (Math.abs(difference) >= 2) {
        return {
          title: `Your latest session${taskTitle ? ` on “${taskTitle}”` : ''} was ${latest.actualMinutes} minutes.`,
          detail: `${Math.abs(difference)} minutes ${difference > 0 ? 'longer' : 'shorter'} than your average across ${previous.length} earlier session${previous.length === 1 ? '' : 's'}.`,
        };
      }
    }
    return {
      title: `Your latest saved session${taskTitle ? ` was for “${taskTitle}”` : ''}.`,
      detail: `You spent ${latest.actualMinutes} focused minutes on ${new Date(latest.startedAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}.`,
    };
  }
  if (completedTasks.length) {
    const categoryCounts = completedTasks.reduce<Record<string, number>>((counts, task) => {
      counts[task.category] = (counts[task.category] ?? 0) + 1;
      return counts;
    }, {});
    const leadingCategory = Object.entries(categoryCounts).sort((a, b) => b[1] - a[1])[0];
    return {
      title: `You’ve completed ${completedTasks.length} task${completedTasks.length === 1 ? '' : 's'}.`,
      detail: leadingCategory ? `${capitalize(leadingCategory[0])} is the most represented category, with ${leadingCategory[1]} completed.` : 'Your completed work is beginning to add up.',
    };
  }
  return { title: '', detail: '' };
}
function MetricCard({ label, value, detail, icon, trend, alert }: { label: string; value: string; detail: string; icon: React.ReactNode; trend: string; alert?: boolean }) {
  return <div className={cx('metric-card', alert && 'metric-alert')}><div className="metric-card-top"><span className="eyebrow">{label}</span><div className="metric-icon">{icon}</div></div><b className="metric-value">{value}</b><span className="metric-detail">{detail}</span><div className="metric-trend">{trend}</div></div>;
}

type ChatItem = { role: 'assistant' | 'user'; content: string; action?: string };
function AssistantPage() {
  const workspace = useGetWorkspace();
  const sendMessage = useSendAssistantMessage();
  const [input, setInput] = useState('');
  const [messages, setMessages] = useState<ChatItem[]>([]);
  const starterPrompts = ['What should I focus on today?', 'What’s coming up this week?', 'Help me make room for deep work'];
  const send = (text = input) => {
    if (!text.trim() || sendMessage.isPending) return;
    const prompt = text.trim(); setInput('');
    setMessages((previous) => [...previous, { role: 'user', content: prompt }]);
    sendMessage.mutate({ data: { message: prompt } }, { onSuccess: (answer) => setMessages((previous) => [...previous, { role: 'assistant', content: answer.answer, action: answer.action }]) });
  };
  return <div className="page-stack assistant-page">
    <PageHeading eyebrow="YOUR WORKSPACE, WITH A VOICE" title="Ask Pilot." description="A grounded thinking partner for the work already on your plate." />
    <div className="assistant-layout">
      <section className="chat-panel">
        <div className="chat-header"><div className="pilot-avatar"><Sparkles size={19} /></div><div><b>Pilot</b><small><span className="online-dot" />Here with your workspace context</small></div><span className="context-pill"><FolderKanban size={13} /> {workspace.data?.tasks.length ?? 0} tasks in view</span></div>
        <div className="chat-messages">
          {messages.length === 0 ? <div className="chat-welcome"><div className="welcome-orb"><div className="orb-core"><Sparkles size={22} /></div><span className="orb-ring ring-a" /><span className="orb-ring ring-b" /></div><span className="eyebrow">A THOUGHTFUL PLACE TO START</span><h2>What’s on your mind?</h2><p>Ask about your tasks, your time, or what deserves your attention next.</p><div className="prompt-suggestions">{starterPrompts.map((prompt) => <button key={prompt} onClick={() => send(prompt)}>{prompt}<ArrowUpRight size={14} /></button>)}</div></div> :
            messages.map((message, index) => <div className={cx('chat-message', message.role === 'user' ? 'chat-user' : 'chat-assistant')} key={`${index}-${message.role}`}><div className="message-avatar">{message.role === 'assistant' ? <Sparkles size={14} /> : initials(workspace.data?.preferences.displayName || 'You')}</div><div className="message-bubble"><span className="message-role">{message.role === 'assistant' ? 'PILOT' : 'YOU'}</span><p>{message.content}</p>{message.role === 'assistant' && message.action && message.action !== 'none' && <Link href={message.action === 'show_recommendation' ? '/planner' : message.action === 'show_tasks' || message.action === 'show_overdue' ? '/tasks' : '/planner'} className="text-link">Open this view <ArrowRight size={13} /></Link>}</div></div>)}
          {sendMessage.isPending && <div className="chat-message chat-assistant"><div className="message-avatar"><Sparkles size={14} /></div><div className="message-bubble thinking-bubble"><span className="eyebrow">THINKING IT THROUGH</span><div className="thinking-dots"><i /><i /><i /></div></div></div>}
          {sendMessage.isError && <div className="chat-error">{friendlyError(sendMessage.error)} <button onClick={() => send(sendMessage.variables?.data.message ?? '')}>Try again</button></div>}
        </div>
        <form className="chat-composer" onSubmit={(event) => { event.preventDefault(); send(); }}><textarea aria-label="Message Pilot" placeholder="Ask anything about your work…" rows={1} value={input} onChange={(event) => setInput(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter' && !event.shiftKey) { event.preventDefault(); send(); } }} /><button className="send-button" type="submit" disabled={!input.trim() || sendMessage.isPending} aria-label="Send message"><Send size={17} /></button><small>Enter to send · Shift + Enter for a new line</small></form>
      </section>
      <aside className="assistant-rail"><div className="assistant-context-card"><div className="context-card-top"><span className="eyebrow">PILOT CAN SEE</span><div className="context-live"><span />LIVE</div></div><h3>Your work, in context.</h3><p>Pilot’s suggestions reflect what’s in your workspace right now.</p><div className="context-list">{[{ label: 'Open tasks', value: workspace.data?.tasks.filter((item) => item.status !== 'completed').length ?? 0, icon: <ListChecks size={15} /> }, { label: 'Projects', value: workspace.data?.projects.length ?? 0, icon: <FolderKanban size={15} /> }, { label: 'Calendar events', value: workspace.data?.events.length ?? 0, icon: <CalendarDays size={15} /> }].map((item) => <div key={item.label}><span>{item.icon}{item.label}</span><b>{item.value}</b></div>)}</div></div>
        <div className="assistant-guidance"><Sparkles size={17} /><b>Good questions are specific.</b><p>Try “Which of my tasks has the nearest deadline?” or “Can I fit a 45-minute focus block in today?”</p></div>
      </aside>
    </div>
  </div>;
}

function SettingsPage() {
  const workspace = useGetWorkspace();
  const updatePreferences = useUpdatePreferences();
  const refresh = useRefreshWorkspace();
  const [name, setName] = useState('');
  const [minutes, setMinutes] = useState(360);
  const [period, setPeriod] = useState<'morning' | 'afternoon' | 'evening' | 'flexible'>('morning');
  const [theme, setTheme] = useState<'light' | 'dark'>('light');
  const [initialized, setInitialized] = useState(false);
  const [notice, setNotice] = useState('');
  if (workspace.isLoading) return <LoadingState />;
  if (workspace.isError) return <QueryError onRetry={() => void workspace.refetch()} />;
  const prefs = workspace.data!.preferences;
  if (!initialized) { setName(prefs.displayName); setMinutes(prefs.availableMinutesPerDay); setPeriod(prefs.productivePeriod); setTheme(prefs.theme); setInitialized(true); }
  const save = (data: PreferencesUpdate) => updatePreferences.mutate({ data }, { onSuccess: (value) => { refresh(); setName(value.displayName); setMinutes(value.availableMinutesPerDay); setPeriod(value.productivePeriod); setTheme(value.theme); document.documentElement.classList.toggle('dark', value.theme === 'dark'); setNotice('Preferences saved.'); window.setTimeout(() => setNotice(''), 2800); } });
  const saveAll = () => save({ displayName: name, availableMinutesPerDay: Number(minutes), productivePeriod: period, theme });
  return <div className="page-stack">
    <PageHeading eyebrow="MAKE PILOT YOURS" title="Preferences" description="Set the defaults that help your plans feel like your own." />
    {notice && <div className="toast-inline"><CheckCircle2 size={17} />{notice}</div>}
    <div className="settings-layout"><section className="panel settings-panel">
      <div className="settings-section"><div className="settings-section-heading"><div className="settings-icon"><Command size={18} /></div><div><h2>Your profile</h2><p>A name makes this workspace feel like yours.</p></div></div><Field label="Display name"><input maxLength={80} value={name} onChange={(event) => setName(event.target.value)} placeholder="Your name" /></Field></div>
      <div className="settings-section"><div className="settings-section-heading"><div className="settings-icon"><Clock3 size={18} /></div><div><h2>Working rhythm</h2><p>Help Pilot make plans that fit the time you actually have.</p></div></div><div className="settings-two-fields"><Field label="Available time each day"><div className="minutes-input"><input type="number" min="30" max="960" step="15" value={minutes} onChange={(event) => setMinutes(Number(event.target.value))} /><span>minutes</span></div></Field><Field label="Most focused during"><select value={period} onChange={(event) => setPeriod(event.target.value as typeof period)}><option value="morning">Morning</option><option value="afternoon">Afternoon</option><option value="evening">Evening</option><option value="flexible">It varies</option></select></Field></div></div>
      <div className="settings-section settings-theme-section"><div className="settings-section-heading"><div className="settings-icon"><Sun size={18} /></div><div><h2>Appearance</h2><p>Choose the atmosphere you work best in.</p></div></div><div className="theme-choices"><button className={cx('theme-choice', theme === 'light' && 'theme-selected')} onClick={() => { setTheme('light'); document.documentElement.classList.remove('dark'); }}><span className="theme-preview theme-preview-light"><i /><i /><i /></span><span><Sun size={15} /> Light</span>{theme === 'light' && <CheckCircle2 size={16} />}</button><button className={cx('theme-choice', theme === 'dark' && 'theme-selected')} onClick={() => { setTheme('dark'); document.documentElement.classList.add('dark'); }}><span className="theme-preview theme-preview-dark"><i /><i /><i /></span><span><Moon size={15} /> Dark</span>{theme === 'dark' && <CheckCircle2 size={16} />}</button></div></div>
      <div className="settings-footer"><span>{updatePreferences.isError ? friendlyError(updatePreferences.error) : 'Your preferences are saved to this workspace.'}</span><button className="button button-primary" onClick={saveAll} disabled={updatePreferences.isPending}>{updatePreferences.isPending ? <LoaderCircle className="spin" size={16} /> : <Check size={16} />} Save preferences</button></div>
    </section><aside className="settings-aside"><div className="settings-aside-mark"><Sparkles size={22} /></div><span className="eyebrow">A NOTE FROM PILOT</span><h3>Your best rhythm is the one that works for you.</h3><p>These preferences shape my recommendations, but they never lock you into a rigid routine. Change them whenever life changes.</p><div className="settings-aside-line" /></aside></div>
  </div>;
}

function NotFound() {
  return <div className="not-found"><span className="eyebrow">NOT ON THE MAP</span><h1>This path took a detour.</h1><p>Let’s get you back to your day.</p><Link className="button button-primary" href="/">Back to today <ArrowLeft size={16} /></Link></div>;
}
function capitalize(value: string) { return value.charAt(0).toUpperCase() + value.slice(1).replaceAll('_', ' '); }

export default App;