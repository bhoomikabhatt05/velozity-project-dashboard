import { useEffect, useState } from 'react';
import type { Socket } from 'socket.io-client';
import { api } from '../api/client';

type Notification = {
  id: string;
  type: string;
  message: string;
  readAt: string | null;
  createdAt: string;
  task?: { title: string; projectId: string };
};

type NotificationUpdate = {
  notification: Notification | null;
  unreadCount: number;
};

const fmtDate = (d: string) =>
  new Date(d).toLocaleString('en-GB', {
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });

export function Notifications({ socket }: { socket: Socket | null }) {
  const [items, setItems] = useState<Notification[]>([]);
  const [count, setCount] = useState(0);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(true);

  // Load initial notifications
  useEffect(() => {
    api
      .get<{ data: Notification[]; unreadCount: number }>('/notifications')
      .then((r) => {
        setItems(r.data.data);
        setCount(r.data.unreadCount);
      })
      .finally(() => setLoading(false));
  }, []);

  // Real-time updates via Socket.IO
  useEffect(() => {
    if (!socket) return;

    const handler = ({ notification, unreadCount }: NotificationUpdate) => {
      setCount(unreadCount);
      if (notification) {
        setItems((prev) => [notification, ...prev].filter((v, i, s) => s.findIndex((q) => q.id === v.id) === i));
      } else {
        // mark-all-read: clear readAt on all items
        setItems((prev) => prev.map((n) => ({ ...n, readAt: new Date().toISOString() })));
      }
    };

    socket.on('notification:update', handler);
    return () => { socket.off('notification:update', handler); };
  }, [socket]);

  const readAll = async () => {
    await api.patch('/notifications/read-all');
    setCount(0);
    setItems((prev) => prev.map((n) => ({ ...n, readAt: new Date().toISOString() })));
  };

  const readOne = async (id: string) => {
    await api.patch(`/notifications/${id}/read`);
    setItems((prev) => prev.map((n) => n.id === id ? { ...n, readAt: new Date().toISOString() } : n));
  };

  const typeIcon = (type: string) =>
    type === 'TASK_ASSIGNED' ? '📋' : type === 'TASK_IN_REVIEW' ? '🔍' : '🔔';

  return (
    <div className="notif-wrapper" id="notifications-widget">
      <button
        className={`notif-bell ${count > 0 ? 'has-unread' : ''}`}
        onClick={() => setOpen((o) => !o)}
        aria-label={`Notifications — ${count} unread`}
        id="btn-notifications"
      >
        🔔
        {count > 0 && <span className="notif-badge">{count > 99 ? '99+' : count}</span>}
      </button>

      {open && (
        <div className="notif-dropdown" role="dialog" aria-label="Notifications">
          <div className="notif-header">
            <span>Notifications</span>
            {count > 0 && (
              <button className="btn-ghost btn-small" onClick={readAll} id="btn-mark-all-read">
                Mark all read
              </button>
            )}
          </div>

          {loading ? (
            <p className="notif-empty">Loading…</p>
          ) : items.length === 0 ? (
            <p className="notif-empty">No notifications yet.</p>
          ) : (
            <ul className="notif-list">
              {items.map((n) => (
                <li key={n.id} className={`notif-item ${n.readAt ? 'read' : 'unread'}`}>
                  <span className="notif-icon">{typeIcon(n.type)}</span>
                  <div className="notif-body">
                    <p className="notif-msg">{n.message}</p>
                    <time className="notif-time">{fmtDate(n.createdAt)}</time>
                  </div>
                  {!n.readAt && (
                    <button
                      className="btn-ghost btn-small"
                      onClick={() => readOne(n.id)}
                      aria-label="Mark as read"
                    >
                      ✓
                    </button>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
