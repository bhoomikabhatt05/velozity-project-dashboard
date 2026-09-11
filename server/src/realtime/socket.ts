import type { Server } from 'socket.io';
import { verifyAccess } from '../auth/tokens.js';
import { prisma } from '../database/prisma.js';
import { projectFor } from '../services/access.js';

/** The Socket.IO server instance, set once on startup. */
let io: Server | undefined;

/**
 * Tracks how many active connections each user has.
 * Key = userId, value = number of open sockets.
 * Used for the live online-user count emitted to admins.
 */
const online = new Map<string, number>();

export function installSockets(server: Server): void {
  io = server;

  // ── Authentication middleware ──────────────────────────────────────────────
  server.use((socket, next) => {
    try {
      socket.data.user = verifyAccess(socket.handshake.auth.token as string);
      next();
    } catch {
      next(new Error('unauthorized'));
    }
  });

  // ── Connection handler ─────────────────────────────────────────────────────
  server.on('connection', async (socket) => {
    const user = socket.data.user;

    // Track presence
    online.set(user.id, (online.get(user.id) ?? 0) + 1);
    server.to('admins').emit('presence:count', online.size);

    // Join role-specific rooms
    if (user.role === 'ADMIN') {
      socket.join('admins');
    }
    // Every user gets a private room for targeted notifications
    socket.join(`user:${user.id}`);

    // DEVELOPER: auto-join the project rooms for all their assigned tasks
    if (user.role === 'DEVELOPER') {
      const assignedProjectIds = await prisma.task
        .findMany({
          where: { assignedDeveloperId: user.id },
          select: { projectId: true },
          distinct: ['projectId'],
        })
        .then((rows) => rows.map((r) => r.projectId));

      for (const projectId of assignedProjectIds) {
        socket.join(`project:${projectId}`);
      }
    }

    // ── Missed-event replay ──────────────────────────────────────────────────
    // Deliver the last 20 relevant activity events the user may have missed
    // while disconnected. The WHERE clause mirrors the GET /activities RBAC.
    const missedWhere =
      user.role === 'ADMIN'
        ? {}
        : user.role === 'PROJECT_MANAGER'
        ? { project: { createdById: user.id } }
        : { task: { assignedDeveloperId: user.id } };

    const missed = await prisma.activity.findMany({
      where: missedWhere,
      orderBy: { createdAt: 'desc' },
      take: 20,
      include: {
        actor: { select: { name: true } },
        task: { select: { title: true } },
        project: { select: { name: true } },
      },
    });
    socket.emit('activity:missed', missed.reverse());

    // ── PM / Admin project room management ───────────────────────────────────
    socket.on('project:join', async (projectId: string) => {
      // Developers are auto-joined; PMs and Admins can join on demand
      if (user.role !== 'DEVELOPER') {
        try {
          await projectFor(user, projectId);
          socket.join(`project:${projectId}`);
        } catch {
          // Unauthorized — silently ignore
        }
      }
    });

    socket.on('project:leave', (projectId: string) => {
      socket.leave(`project:${projectId}`);
    });

    // ── Disconnect ────────────────────────────────────────────────────────────
    socket.on('disconnect', () => {
      const count = (online.get(user.id) ?? 1) - 1;
      if (count > 0) {
        online.set(user.id, count);
      } else {
        online.delete(user.id);
      }
      server.to('admins').emit('presence:count', online.size);
    });
  });
}

/**
 * Emit a new activity event to all rooms that should see it:
 * - The project room (PM + anyone who joined via project:join)
 * - The assigned developer's private room (if any)
 * - The admin room
 */
export const emitActivity = (
  activity: unknown,
  projectId: string,
  developerId?: string | null,
): void => {
  io?.to(`project:${projectId}`).emit('activity:new', activity);
  if (developerId) {
    io?.to(`user:${developerId}`).emit('activity:new', activity);
  }
  io?.to('admins').emit('activity:new', activity);
};

/**
 * Emit a notification update to a specific user's private room.
 * If `notification` is null, only the unread count is being updated (e.g. mark-all-read).
 */
export const emitNotification = (
  userId: string,
  notification: unknown,
  unreadCount: number,
): void => {
  io?.to(`user:${userId}`).emit('notification:update', { notification, unreadCount });
};
