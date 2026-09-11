import { useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { api } from '../api/client';
import { useAuth } from '../auth/AuthContext';
import { connectSocket } from '../realtime/socket';
import { Notifications } from '../components/Notifications';

// ─── Types ────────────────────────────────────────────────────────────────────

type TaskStatus = 'TODO' | 'IN_PROGRESS' | 'IN_REVIEW' | 'DONE';
type Priority = 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';

type Task = {
  id: string;
  title: string;
  description: string;
  status: TaskStatus;
  priority: Priority;
  dueDate: string;
  isOverdue: boolean;
  projectId: string;
  project?: { id: string; name: string };
  assignedDeveloper?: { id: string; name: string } | null;
};

type Project = {
  id: string;
  name: string;
  client: { id: string; name: string };
  createdBy: { id: string; name: string };
  _count: { tasks: number };
};

type Activity = {
  id: string;
  type: string;
  previousStatus: TaskStatus | null;
  nextStatus: TaskStatus | null;
  createdAt: string;
  actor: { name: string };
  task: { title: string };
  project?: { name: string };
};

type AdminDash = {
  totalProjects: number;
  totalUsers: number;
  statusCounts: Record<TaskStatus, number>;
  overdueCount: number;
};

type PmDash = {
  projects: Project[];
  priorityCounts: Record<Priority, number>;
  overdueCount: number;
  upcomingTasks: Task[];
};

type DevDash = {
  assignedTasks: Task[];
  totalAssigned: number;
  overdueCount: number;
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

const STATUS_LABELS: Record<TaskStatus | string, string> = {
  TODO: 'To Do',
  IN_PROGRESS: 'In Progress',
  IN_REVIEW: 'In Review',
  DONE: 'Done',
};

const PRIORITY_LABELS: Record<Priority | string, string> = {
  LOW: 'Low',
  MEDIUM: 'Medium',
  HIGH: 'High',
  CRITICAL: 'Critical',
};

const label = (x: string) => STATUS_LABELS[x] ?? PRIORITY_LABELS[x] ?? x.replace(/_/g, ' ');
const fmtDate = (d: string) => new Date(d).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
const isOverdueDate = (d: string) => new Date(d) < new Date();

const ALL_STATUSES: TaskStatus[] = ['TODO', 'IN_PROGRESS', 'IN_REVIEW', 'DONE'];
const ALL_PRIORITIES: Priority[] = ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'];

// ─── Sub-components ───────────────────────────────────────────────────────────

function StatusBadge({ status }: { status: string }) {
  return <span className={`badge badge-status badge-${status.toLowerCase()}`}>{label(status)}</span>;
}

function PriorityBadge({ priority }: { priority: string }) {
  return <span className={`badge badge-priority badge-${priority.toLowerCase()}`}>{label(priority)}</span>;
}

function TaskCard({ task, onStatusChange }: { task: Task; onStatusChange?: (id: string, status: TaskStatus) => void }) {
  const overdue = task.isOverdue || (task.status !== 'DONE' && isOverdueDate(task.dueDate));
  return (
    <article className={`task-card ${overdue ? 'overdue' : ''}`}>
      <div className="task-card-header">
        <strong className="task-title">{task.title}</strong>
        <PriorityBadge priority={task.priority} />
      </div>
      <p className="task-desc">{task.description}</p>
      <div className="task-card-footer">
        <StatusBadge status={task.status} />
        {task.project && <span className="task-project">📁 {task.project.name}</span>}
        <span className={`task-due ${overdue ? 'text-danger' : ''}`}>
          {overdue ? '⚠ Overdue · ' : '📅 '}
          {fmtDate(task.dueDate)}
        </span>
      </div>
      {onStatusChange && task.status !== 'DONE' && (
        <div className="task-actions">
          <label htmlFor={`status-${task.id}`} className="sr-only">Change status</label>
          <select
            id={`status-${task.id}`}
            value={task.status}
            onChange={(e) => onStatusChange(task.id, e.target.value as TaskStatus)}
          >
            {ALL_STATUSES.map((s) => (
              <option key={s} value={s}>{label(s)}</option>
            ))}
          </select>
        </div>
      )}
    </article>
  );
}

function ActivityFeed({ items }: { items: Activity[] }) {
  if (!items.length) return <p className="empty-state">No activity yet.</p>;
  return (
    <ul className="activity-list">
      {items.map((a) => (
        <li key={a.id} className="activity-item">
          <div className="activity-dot" />
          <div>
            <span className="activity-actor">{a.actor?.name}</span>
            {a.type === 'TASK_STATUS_CHANGED' && (
              <>
                {' '}moved <em>{a.task?.title}</em>
                {' '}<StatusBadge status={a.previousStatus ?? ''} />
                {' → '}<StatusBadge status={a.nextStatus ?? ''} />
              </>
            )}
            {a.type === 'TASK_OVERDUE' && (
              <> — <em>{a.task?.title}</em> is <span className="text-danger">overdue</span></>
            )}
            {a.project && <span className="activity-project"> · {a.project.name}</span>}
            <time className="activity-time">{fmtDate(a.createdAt)}</time>
          </div>
        </li>
      ))}
    </ul>
  );
}

function StatCard({ label, value, accent }: { label: string; value: string | number; accent?: string }) {
  return (
    <article className="stat-card" style={accent ? { borderTopColor: accent } : undefined}>
      <span className="stat-label">{label}</span>
      <strong className="stat-value">{value}</strong>
    </article>
  );
}

// ─── Admin Dashboard ──────────────────────────────────────────────────────────

function AdminDashboard({ online, socket }: { online: number; socket: ReturnType<typeof connectSocket> | null }) {
  const [dash, setDash] = useState<AdminDash | null>(null);
  const [activities, setActivities] = useState<Activity[]>([]);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [params, setParams] = useSearchParams();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = () => {
    setLoading(true);
    setError('');
    Promise.all([
      api.get<{ data: AdminDash }>('/dashboard'),
      api.get<{ data: Activity[] }>('/activities'),
      api.get<{ data: Task[] }>(`/tasks?${params.toString()}`),
    ])
      .then(([d, a, t]) => {
        setDash(d.data.data);
        setActivities(a.data.data);
        setTasks(t.data.data);
      })
      .catch(() => setError('Failed to load dashboard data.'))
      .finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, [params]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!socket) return;
    const onActivity = (a: Activity) => setActivities((prev) => [a, ...prev].slice(0, 50));
    const onMissed = (a: Activity[]) => setActivities((prev) => [...a, ...prev].filter((v, i, s) => s.findIndex((q) => q.id === v.id) === i));
    socket.on('activity:new', onActivity);
    socket.on('activity:missed', onMissed);
    return () => { socket.off('activity:new', onActivity); socket.off('activity:missed', onMissed); };
  }, [socket]);

  const set = (key: string, value: string) => {
    const n = new URLSearchParams(params);
    value ? n.set(key, value) : n.delete(key);
    setParams(n);
  };

  if (loading) return <div className="loading-state">Loading admin dashboard…</div>;
  if (error) return <div className="error-state">{error} <button onClick={load}>Retry</button></div>;

  return (
    <>
      <section className="stat-grid">
        <StatCard label="Total Projects" value={dash?.totalProjects ?? 0} accent="#6366f1" />
        <StatCard label="Total Users" value={dash?.totalUsers ?? 0} accent="#0ea5e9" />
        <StatCard label="Overdue Tasks" value={dash?.overdueCount ?? 0} accent="#ef4444" />
        <StatCard label="Live Online Users" value={online} accent="#10b981" />
      </section>

      <section className="status-breakdown">
        <h2>Tasks by Status</h2>
        <div className="status-bar-grid">
          {ALL_STATUSES.map((s) => (
            <div key={s} className="status-bar-item">
              <StatusBadge status={s} />
              <span className="status-count">{dash?.statusCounts?.[s] ?? 0}</span>
            </div>
          ))}
        </div>
      </section>

      <section className="dashboard-grid">
        <div>
          <div className="section-header">
            <h2>All Tasks</h2>
            <Filters params={params} onSet={set} />
          </div>
          {tasks.length
            ? tasks.map((t) => <TaskCard key={t.id} task={t} />)
            : <p className="empty-state">No tasks match the current filters.</p>}
        </div>
        <div>
          <h2>Global Activity</h2>
          <ActivityFeed items={activities} />
        </div>
      </section>
    </>
  );
}

// ─── PM Dashboard ─────────────────────────────────────────────────────────────

function PMDashboard({ socket }: { socket: ReturnType<typeof connectSocket> | null }) {
  const [dash, setDash] = useState<PmDash | null>(null);
  const [activities, setActivities] = useState<Activity[]>([]);
  const [params, setParams] = useSearchParams();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = () => {
    setLoading(true);
    setError('');
    Promise.all([
      api.get<{ data: PmDash }>('/dashboard'),
      api.get<{ data: Activity[] }>('/activities'),
    ])
      .then(([d, a]) => {
        setDash(d.data.data);
        setActivities(a.data.data);
      })
      .catch(() => setError('Failed to load dashboard data.'))
      .finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!socket) return;
    const onActivity = (a: Activity) => setActivities((prev) => [a, ...prev].slice(0, 50));
    const onMissed = (a: Activity[]) => setActivities((prev) => [...a, ...prev].filter((v, i, s) => s.findIndex((q) => q.id === v.id) === i));
    socket.on('activity:new', onActivity);
    socket.on('activity:missed', onMissed);

    // Join project rooms for real-time updates
    dash?.projects.forEach((p) => socket.emit('project:join', p.id));

    return () => { socket.off('activity:new', onActivity); socket.off('activity:missed', onMissed); };
  }, [socket, dash?.projects]);

  const set = (key: string, value: string) => {
    const n = new URLSearchParams(params);
    value ? n.set(key, value) : n.delete(key);
    setParams(n);
  };

  if (loading) return <div className="loading-state">Loading project manager dashboard…</div>;
  if (error) return <div className="error-state">{error} <button onClick={load}>Retry</button></div>;

  return (
    <>
      <section className="stat-grid">
        <StatCard label="My Projects" value={dash?.projects.length ?? 0} accent="#6366f1" />
        <StatCard label="Overdue Tasks" value={dash?.overdueCount ?? 0} accent="#ef4444" />
        <StatCard label="Due This Week" value={dash?.upcomingTasks.length ?? 0} accent="#f59e0b" />
      </section>

      <section className="priority-breakdown">
        <h2>Tasks by Priority</h2>
        <div className="status-bar-grid">
          {ALL_PRIORITIES.map((p) => (
            <div key={p} className="status-bar-item">
              <PriorityBadge priority={p} />
              <span className="status-count">{dash?.priorityCounts?.[p] ?? 0}</span>
            </div>
          ))}
        </div>
      </section>

      <section className="dashboard-grid">
        <div>
          <h2>My Projects</h2>
          {dash?.projects.length
            ? dash.projects.map((p) => (
              <article key={p.id} className="project-card">
                <strong>{p.name}</strong>
                <span className="project-client">🏢 {p.client.name}</span>
                <span className="project-tasks">{p._count.tasks} task{p._count.tasks !== 1 ? 's' : ''}</span>
              </article>
            ))
            : <p className="empty-state">No projects yet.</p>}

          {dash?.upcomingTasks.length ? (
            <>
              <h2 style={{ marginTop: '24px' }}>Due This Week</h2>
              <Filters params={params} onSet={set} hideProjectId />
              {dash.upcomingTasks.map((t) => <TaskCard key={t.id} task={t} />)}
            </>
          ) : null}
        </div>
        <div>
          <h2>Project Activity</h2>
          <ActivityFeed items={activities} />
        </div>
      </section>
    </>
  );
}

// ─── Developer Dashboard ──────────────────────────────────────────────────────

function DevDashboard({ socket }: { socket: ReturnType<typeof connectSocket> | null }) {
  const [dash, setDash] = useState<DevDash | null>(null);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [activities, setActivities] = useState<Activity[]>([]);
  const [params, setParams] = useSearchParams();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [updating, setUpdating] = useState<string | null>(null);

  const load = () => {
    setLoading(true);
    setError('');
    Promise.all([
      api.get<{ data: DevDash }>('/dashboard'),
      api.get<{ data: Task[] }>(`/tasks?${params.toString()}`),
      api.get<{ data: Activity[] }>('/activities'),
    ])
      .then(([d, t, a]) => {
        setDash(d.data.data);
        setTasks(t.data.data);
        setActivities(a.data.data);
      })
      .catch(() => setError('Failed to load dashboard data.'))
      .finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, [params]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!socket) return;
    const onActivity = (a: Activity) => setActivities((prev) => [a, ...prev].slice(0, 50));
    const onMissed = (a: Activity[]) => setActivities((prev) => [...a, ...prev].filter((v, i, s) => s.findIndex((q) => q.id === v.id) === i));
    const onTaskUpdate = () => load();
    socket.on('activity:new', onActivity);
    socket.on('activity:missed', onMissed);
    // Refresh task list when a relevant activity arrives
    socket.on('activity:new', onTaskUpdate);
    return () => {
      socket.off('activity:new', onActivity);
      socket.off('activity:missed', onMissed);
      socket.off('activity:new', onTaskUpdate);
    };
  }, [socket]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleStatusChange = async (taskId: string, status: TaskStatus) => {
    setUpdating(taskId);
    try {
      await api.patch(`/tasks/${taskId}/status`, { status });
      setTasks((prev) => prev.map((t) => t.id === taskId ? { ...t, status } : t));
    } catch {
      setError('Failed to update task status.');
    } finally {
      setUpdating(null);
    }
  };

  const set = (key: string, value: string) => {
    const n = new URLSearchParams(params);
    value ? n.set(key, value) : n.delete(key);
    setParams(n);
  };

  if (loading) return <div className="loading-state">Loading your tasks…</div>;
  if (error) return <div className="error-state">{error} <button onClick={load}>Retry</button></div>;

  return (
    <>
      <section className="stat-grid">
        <StatCard label="Total Assigned" value={dash?.totalAssigned ?? 0} accent="#6366f1" />
        <StatCard label="Active Tasks" value={dash?.assignedTasks.length ?? 0} accent="#0ea5e9" />
        <StatCard label="Overdue" value={dash?.overdueCount ?? 0} accent="#ef4444" />
      </section>

      <section className="dashboard-grid">
        <div>
          <div className="section-header">
            <h2>My Tasks</h2>
            <Filters params={params} onSet={set} hideProjectId />
          </div>
          {tasks.length
            ? tasks.map((t) => (
              <div key={t.id} className={updating === t.id ? 'updating' : ''}>
                <TaskCard task={t} onStatusChange={handleStatusChange} />
              </div>
            ))
            : <p className="empty-state">No tasks match the current filters.</p>}
        </div>
        <div>
          <h2>My Activity</h2>
          <ActivityFeed items={activities} />
        </div>
      </section>
    </>
  );
}

// ─── Shared Filters ────────────────────────────────────────────────────────────

function Filters({
  params,
  onSet,
  hideProjectId,
}: {
  params: URLSearchParams;
  onSet: (key: string, value: string) => void;
  hideProjectId?: boolean;
}) {
  return (
    <div className="filters">
      <select
        id="filter-status"
        value={params.get('status') ?? ''}
        onChange={(e) => onSet('status', e.target.value)}
        aria-label="Filter by status"
      >
        <option value="">All statuses</option>
        {ALL_STATUSES.map((s) => <option key={s} value={s}>{label(s)}</option>)}
      </select>
      <select
        id="filter-priority"
        value={params.get('priority') ?? ''}
        onChange={(e) => onSet('priority', e.target.value)}
        aria-label="Filter by priority"
      >
        <option value="">All priorities</option>
        {ALL_PRIORITIES.map((p) => <option key={p} value={p}>{label(p)}</option>)}
      </select>
      <div className="filter-dates">
        <input
          id="filter-from"
          type="date"
          title="Due from"
          aria-label="Due from date"
          value={params.get('dueFrom') ?? ''}
          onChange={(e) => onSet('dueFrom', e.target.value)}
        />
        <span>–</span>
        <input
          id="filter-to"
          type="date"
          title="Due to"
          aria-label="Due to date"
          value={params.get('dueTo') ?? ''}
          onChange={(e) => onSet('dueTo', e.target.value)}
        />
      </div>
      {!hideProjectId && params.get('projectId') && (
        <button className="btn-ghost" onClick={() => onSet('projectId', '')}>Clear project filter</button>
      )}
      {(params.get('status') || params.get('priority') || params.get('dueFrom') || params.get('dueTo')) && (
        <button
          className="btn-ghost"
          onClick={() => {
            onSet('status', '');
            onSet('priority', '');
            onSet('dueFrom', '');
            onSet('dueTo', '');
          }}
        >
          Clear filters
        </button>
      )}
    </div>
  );
}

// ─── Main Dashboard Page ──────────────────────────────────────────────────────

export function DashboardPage() {
  const { user, token, logout } = useAuth();
  const [online, setOnline] = useState(0);

  const socket = useMemo(
    () => (token ? connectSocket(token) : null),
    [token],
  );

  // Presence counter (admin only)
  useEffect(() => {
    if (!socket) return;
    socket.on('presence:count', setOnline);
    return () => { socket.off('presence:count', setOnline); };
  }, [socket]);

  const roleLabel = {
    ADMIN: 'Administrator',
    PROJECT_MANAGER: 'Project Manager',
    DEVELOPER: 'Developer',
  }[user?.role ?? 'DEVELOPER'];

  return (
    <div className="app-shell">
      <header className="topbar">
        <div className="topbar-brand">
          <span className="brand-logo">⚡</span>
          <strong>Velozity</strong>
        </div>
        <div className="topbar-user">
          <span className="user-info">
            <span className="user-name">{user?.name}</span>
            <span className="role-badge">{roleLabel}</span>
          </span>
          <Notifications socket={socket} />
          <button className="btn-logout" onClick={logout} id="btn-logout">
            Sign out
          </button>
        </div>
      </header>

      <main className="page-content">
        {user?.role === 'ADMIN' && <AdminDashboard online={online} socket={socket} />}
        {user?.role === 'PROJECT_MANAGER' && <PMDashboard socket={socket} />}
        {user?.role === 'DEVELOPER' && <DevDashboard socket={socket} />}
      </main>
    </div>
  );
}
