import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import {
  Prisma, Role, TaskStatus, Priority,
  ActivityType, NotificationType,
} from '@prisma/client';
import { prisma } from '../database/prisma.js';
import { authenticate, allow } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import { AppError } from '../errors/app-error.js';
import { hashToken, signAccess, signRefresh, verifyRefresh } from '../auth/tokens.js';
import { env } from '../config/env.js';
import { projectFor, taskFor } from '../services/access.js';
import { emitActivity, emitNotification } from '../realtime/socket.js';

// ─── Shared schemas ──────────────────────────────────────────────────────────

const id = z.string().cuid();

const cookie = {
  httpOnly: true,
  secure: env.COOKIE_SECURE === 'true',
  sameSite: 'lax' as const,
  path: '/api/auth',
  maxAge: 7 * 86_400_000,
};

const taskInput = z.object({
  title: z.string().min(1).max(160),
  description: z.string().min(1).max(5000),
  assignedDeveloperId: id.optional(),
  priority: z.nativeEnum(Priority),
  dueDate: z.coerce.date(),
});

const taskPatch = z.object({
  title: z.string().min(1).max(160).optional(),
  description: z.string().min(1).max(5000).optional(),
  assignedDeveloperId: id.nullable().optional(),
  priority: z.nativeEnum(Priority).optional(),
  dueDate: z.coerce.date().optional(),
});

const filterQuery = z.object({
  status: z.nativeEnum(TaskStatus).optional(),
  priority: z.nativeEnum(Priority).optional(),
  dueFrom: z.coerce.date().optional(),
  dueTo: z.coerce.date().optional(),
  projectId: id.optional(),
});

export const api = Router();

// ─── Public ───────────────────────────────────────────────────────────────────

api.get('/health', (_req, res) => res.json({ data: { status: 'ok' } }));

// ─── Auth ─────────────────────────────────────────────────────────────────────

api.post(
  '/auth/login',
  validate(z.object({
    body: z.object({ email: z.string().email(), password: z.string().min(8) }),
    params: z.object({}),
    query: z.object({}),
  })),
  async (req, res) => {
    const user = await prisma.user.findUnique({ where: { email: req.body.email } });
    if (!user || !(await bcrypt.compare(req.body.password, user.passwordHash))) {
      throw new AppError(401, 'INVALID_CREDENTIALS', 'Invalid email or password');
    }
    const payload = { id: user.id, role: user.role, name: user.name };
    const refresh = signRefresh(payload);
    await prisma.refreshToken.create({
      data: {
        userId: user.id,
        tokenHash: hashToken(refresh),
        expiresAt: new Date(Date.now() + 7 * 86_400_000),
      },
    });
    res.cookie('refreshToken', refresh, cookie).json({
      data: { accessToken: signAccess(payload), user: payload },
    });
  },
);

api.post('/auth/refresh', async (req, res) => {
  const raw = req.cookies?.refreshToken as string | undefined;
  if (!raw) throw new AppError(401, 'UNAUTHENTICATED', 'Refresh token is required');

  let token: { id: string; exp: number };
  try {
    token = verifyRefresh(raw);
  } catch {
    throw new AppError(401, 'UNAUTHENTICATED', 'Invalid refresh token');
  }

  const stored = await prisma.refreshToken.findUnique({
    where: { tokenHash: hashToken(raw) },
    include: { user: true },
  });
  if (!stored || stored.revokedAt || stored.expiresAt < new Date()) {
    throw new AppError(401, 'UNAUTHENTICATED', 'Refresh token is revoked or expired');
  }

  // Rotate: revoke old, issue new
  await prisma.refreshToken.update({ where: { id: stored.id }, data: { revokedAt: new Date() } });

  const payload = { id: stored.user.id, role: stored.user.role, name: stored.user.name };
  const replacement = signRefresh(payload);
  await prisma.refreshToken.create({
    data: {
      userId: token.id,
      tokenHash: hashToken(replacement),
      expiresAt: new Date(Date.now() + 7 * 86_400_000),
    },
  });
  res.cookie('refreshToken', replacement, cookie).json({
    data: { accessToken: signAccess(payload), user: payload },
  });
});

api.post('/auth/logout', async (req, res) => {
  const raw = req.cookies?.refreshToken as string | undefined;
  if (raw) {
    await prisma.refreshToken.updateMany({
      where: { tokenHash: hashToken(raw), revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }
  res.clearCookie('refreshToken', { ...cookie, maxAge: undefined }).status(204).send();
});

// ─── All routes below require authentication ──────────────────────────────────

api.use(authenticate);

// ─── Users ────────────────────────────────────────────────────────────────────

api.get('/users', allow(Role.ADMIN), async (_req, res) => {
  res.json({
    data: await prisma.user.findMany({
      select: { id: true, name: true, email: true, role: true },
    }),
  });
});

api.post(
  '/users',
  allow(Role.ADMIN),
  validate(z.object({
    body: z.object({
      name: z.string().min(1),
      email: z.string().email(),
      password: z.string().min(12),
      role: z.nativeEnum(Role),
    }),
    params: z.object({}),
    query: z.object({}),
  })),
  async (req, res) => {
    const passwordHash = await bcrypt.hash(req.body.password, 12);
    res.status(201).json({
      data: await prisma.user.create({
        data: { name: req.body.name, email: req.body.email, role: req.body.role, passwordHash },
        select: { id: true, name: true, email: true, role: true },
      }),
    });
  },
);

// ─── Clients ──────────────────────────────────────────────────────────────────

api.get('/clients', allow(Role.ADMIN, Role.PROJECT_MANAGER), async (_req, res) => {
  res.json({ data: await prisma.client.findMany({ orderBy: { name: 'asc' } }) });
});

api.post(
  '/clients',
  allow(Role.ADMIN),
  validate(z.object({
    body: z.object({ name: z.string().min(1).max(160) }),
    params: z.object({}),
    query: z.object({}),
  })),
  async (req, res) => {
    res.status(201).json({ data: await prisma.client.create({ data: req.body }) });
  },
);

// ─── Projects ─────────────────────────────────────────────────────────────────

api.get('/projects', async (req, res) => {
  const where: Prisma.ProjectWhereInput =
    req.user!.role === Role.ADMIN
      ? {}
      : req.user!.role === Role.PROJECT_MANAGER
      ? { createdById: req.user!.id }
      : { tasks: { some: { assignedDeveloperId: req.user!.id } } };

  res.json({
    data: await prisma.project.findMany({
      where,
      include: {
        client: true,
        createdBy: { select: { id: true, name: true } },
        _count: { select: { tasks: true } },
      },
      orderBy: { createdAt: 'desc' },
    }),
  });
});

api.post(
  '/projects',
  allow(Role.ADMIN, Role.PROJECT_MANAGER),
  validate(z.object({
    body: z.object({ name: z.string().min(1), clientId: id }),
    params: z.object({}),
    query: z.object({}),
  })),
  async (req, res) => {
    res.status(201).json({
      data: await prisma.project.create({
        data: { ...req.body, createdById: req.user!.id },
      }),
    });
  },
);

api.get(
  '/projects/:projectId',
  validate(z.object({
    body: z.unknown(),
    params: z.object({ projectId: id }),
    query: z.object({}),
  })),
  async (req, res) => {
    const projectId = req.params.projectId as string;

    if (req.user!.role === Role.DEVELOPER) {
      const exists = await prisma.task.findFirst({
        where: { projectId, assignedDeveloperId: req.user!.id },
      });
      if (!exists) throw new AppError(403, 'FORBIDDEN', 'Project access denied');
    } else {
      await projectFor(req.user!, projectId);
    }

    res.json({
      data: await prisma.project.findUniqueOrThrow({
        where: { id: projectId },
        include: { client: true, createdBy: { select: { id: true, name: true } } },
      }),
    });
  },
);

api.patch(
  '/projects/:projectId',
  allow(Role.ADMIN, Role.PROJECT_MANAGER),
  validate(z.object({
    body: z.object({ name: z.string().min(1).optional(), clientId: id.optional() }),
    params: z.object({ projectId: id }),
    query: z.object({}),
  })),
  async (req, res) => {
    const projectId = req.params.projectId as string;
    await projectFor(req.user!, projectId);
    res.json({
      data: await prisma.project.update({ where: { id: projectId }, data: req.body }),
    });
  },
);

// ─── Tasks (project-scoped) ───────────────────────────────────────────────────

api.get(
  '/projects/:projectId/tasks',
  validate(z.object({
    body: z.unknown(),
    params: z.object({ projectId: id }),
    query: filterQuery,
  })),
  async (req, res) => {
    const projectId = req.params.projectId as string;
    const q = req.query as z.infer<typeof filterQuery>;

    if (req.user!.role === Role.DEVELOPER) {
      const exists = await prisma.task.findFirst({
        where: { projectId, assignedDeveloperId: req.user!.id },
      });
      if (!exists) throw new AppError(403, 'FORBIDDEN', 'Project access denied');
    } else {
      await projectFor(req.user!, projectId);
    }

    const where: Prisma.TaskWhereInput = {
      projectId,
      ...(q.status && { status: q.status }),
      ...(q.priority && { priority: q.priority }),
      ...((q.dueFrom || q.dueTo) ? {
        dueDate: {
          ...(q.dueFrom && { gte: q.dueFrom }),
          ...(q.dueTo && { lte: q.dueTo }),
        },
      } : {}),
      ...(req.user!.role === Role.DEVELOPER && { assignedDeveloperId: req.user!.id }),
    };

    res.json({
      data: await prisma.task.findMany({
        where,
        include: {
          assignedDeveloper: { select: { id: true, name: true } },
          project: { select: { id: true, name: true } },
        },
        orderBy: [{ priority: 'desc' }, { dueDate: 'asc' }],
      }),
    });
  },
);

api.post(
  '/projects/:projectId/tasks',
  allow(Role.ADMIN, Role.PROJECT_MANAGER),
  validate(z.object({
    body: taskInput,
    params: z.object({ projectId: id }),
    query: z.object({}),
  })),
  async (req, res) => {
    const projectId = req.params.projectId as string;
    await projectFor(req.user!, projectId);

    if (req.body.assignedDeveloperId) {
      const dev = await prisma.user.findUnique({ where: { id: req.body.assignedDeveloperId } });
      if (!dev || dev.role !== Role.DEVELOPER) {
        throw new AppError(400, 'VALIDATION_ERROR', 'Assignee must be a developer');
      }
    }

    const task = await prisma.$transaction(async (tx) => {
      const created = await tx.task.create({ data: { ...req.body, projectId } });
      if (created.assignedDeveloperId) {
        await tx.notification.create({
          data: {
            recipientId: created.assignedDeveloperId,
            taskId: created.id,
            type: NotificationType.TASK_ASSIGNED,
            message: `You were assigned: ${created.title}`,
          },
        });
      }
      return created;
    });

    if (task.assignedDeveloperId) {
      const n = await prisma.notification.findFirst({
        where: { taskId: task.id, recipientId: task.assignedDeveloperId },
        orderBy: { createdAt: 'desc' },
      });
      const unreadCount = await prisma.notification.count({
        where: { recipientId: task.assignedDeveloperId, readAt: null },
      });
      emitNotification(task.assignedDeveloperId, n, unreadCount);
    }

    res.status(201).json({ data: task });
  },
);

api.patch(
  '/projects/:projectId/tasks/:taskId',
  allow(Role.ADMIN, Role.PROJECT_MANAGER),
  validate(z.object({
    body: taskPatch,
    params: z.object({ projectId: id, taskId: id }),
    query: z.object({}),
  })),
  async (req, res) => {
    const { projectId, taskId } = req.params as { projectId: string; taskId: string };
    await projectFor(req.user!, projectId);

    const existing = await prisma.task.findFirst({ where: { id: taskId, projectId } });
    if (!existing) throw new AppError(404, 'NOT_FOUND', 'Task not found');

    // If changing assignee, validate new assignee is a DEVELOPER
    if (req.body.assignedDeveloperId !== undefined && req.body.assignedDeveloperId !== null) {
      const dev = await prisma.user.findUnique({ where: { id: req.body.assignedDeveloperId } });
      if (!dev || dev.role !== Role.DEVELOPER) {
        throw new AppError(400, 'VALIDATION_ERROR', 'Assignee must be a developer');
      }
    }

    // Handle assignee change notification
    const updatedTask = await prisma.$transaction(async (tx) => {
      const task = await tx.task.update({
        where: { id: taskId },
        data: req.body,
      });

      // Notify new assignee if assignee changed
      const newAssigneeId = req.body.assignedDeveloperId;
      if (newAssigneeId && newAssigneeId !== existing.assignedDeveloperId) {
        await tx.notification.create({
          data: {
            recipientId: newAssigneeId,
            taskId: task.id,
            type: NotificationType.TASK_ASSIGNED,
            message: `You were assigned: ${task.title}`,
          },
        });
      }

      return task;
    });

    // Emit notification if assignee changed
    if (
      req.body.assignedDeveloperId &&
      req.body.assignedDeveloperId !== existing.assignedDeveloperId
    ) {
      const n = await prisma.notification.findFirst({
        where: { taskId: updatedTask.id, recipientId: req.body.assignedDeveloperId },
        orderBy: { createdAt: 'desc' },
      });
      const unreadCount = await prisma.notification.count({
        where: { recipientId: req.body.assignedDeveloperId, readAt: null },
      });
      emitNotification(req.body.assignedDeveloperId, n, unreadCount);
    }

    res.json({ data: updatedTask });
  },
);

// ─── Tasks (global, filtered) ─────────────────────────────────────────────────

api.get(
  '/tasks',
  validate(z.object({
    body: z.unknown(),
    params: z.object({}),
    query: filterQuery,
  })),
  async (req, res) => {
    const q = req.query as z.infer<typeof filterQuery>;

    const where: Prisma.TaskWhereInput = {
      ...(q.status && { status: q.status }),
      ...(q.priority && { priority: q.priority }),
      ...((q.dueFrom || q.dueTo) ? {
        dueDate: {
          ...(q.dueFrom && { gte: q.dueFrom }),
          ...(q.dueTo && { lte: q.dueTo }),
        },
      } : {}),
      ...(q.projectId && { projectId: q.projectId }),
    };

    if (req.user!.role === Role.PROJECT_MANAGER) {
      where.project = { createdById: req.user!.id };
    }
    if (req.user!.role === Role.DEVELOPER) {
      where.assignedDeveloperId = req.user!.id;
    }

    res.json({
      data: await prisma.task.findMany({
        where,
        include: {
          project: { select: { id: true, name: true } },
          assignedDeveloper: { select: { id: true, name: true } },
        },
        orderBy:
          req.user!.role === Role.DEVELOPER
            ? [{ priority: 'desc' }, { dueDate: 'asc' }]
            : { dueDate: 'asc' },
      }),
    });
  },
);

api.patch(
  '/tasks/:taskId/status',
  validate(z.object({
    body: z.object({ status: z.nativeEnum(TaskStatus) }),
    params: z.object({ taskId: id }),
    query: z.object({}),
  })),
  async (req, res) => {
    const prior = await taskFor(req.user!, req.params.taskId as string);

    // DEVELOPER can only update their own assigned task
    if (req.user!.role === Role.DEVELOPER && prior.assignedDeveloperId !== req.user!.id) {
      throw new AppError(403, 'FORBIDDEN', 'Task access denied');
    }

    const newStatus = req.body.status as TaskStatus;

    const { task, activity, notification } = await prisma.$transaction(async (tx) => {
      const task = await tx.task.update({
        where: { id: prior.id },
        data: {
          status: newStatus,
          // Clear overdue flag when task is done
          isOverdue: newStatus === TaskStatus.DONE ? false : prior.isOverdue,
        },
      });

      const activity = await tx.activity.create({
        data: {
          projectId: prior.projectId,
          taskId: prior.id,
          actorId: req.user!.id,
          type: ActivityType.TASK_STATUS_CHANGED,
          previousStatus: prior.status,
          nextStatus: newStatus,
        },
        include: {
          actor: { select: { name: true } },
          task: { select: { title: true } },
        },
      });

      let notification = null;
      if (newStatus === TaskStatus.IN_REVIEW) {
        // Notify project owner (PM who created the project)
        notification = await tx.notification.create({
          data: {
            recipientId: prior.project.createdById,
            taskId: prior.id,
            type: NotificationType.TASK_IN_REVIEW,
            message: `${req.user!.name} moved "${prior.title}" to In Review`,
          },
        });
      }

      return { task, activity, notification };
    });

    // Emit real-time activity (scoped: project room, developer, admins)
    emitActivity(activity, prior.projectId, prior.assignedDeveloperId);

    // Emit notification to PM if task moved to IN_REVIEW
    if (notification) {
      const unreadCount = await prisma.notification.count({
        where: { recipientId: notification.recipientId, readAt: null },
      });
      emitNotification(notification.recipientId, notification, unreadCount);
    }

    res.json({ data: task });
  },
);

// ─── Dashboard aggregate ──────────────────────────────────────────────────────

api.get('/dashboard', async (req, res) => {
  const role = req.user!.role;

  if (role === Role.ADMIN) {
    const [
      totalProjects,
      totalUsers,
      tasksByStatus,
      overdueCount,
    ] = await Promise.all([
      prisma.project.count(),
      prisma.user.count(),
      prisma.task.groupBy({ by: ['status'], _count: { id: true } }),
      prisma.task.count({ where: { isOverdue: true } }),
    ]);

    const statusCounts = Object.fromEntries(
      tasksByStatus.map((r) => [r.status, r._count.id]),
    );

    res.json({ data: { totalProjects, totalUsers, statusCounts, overdueCount } });
    return;
  }

  if (role === Role.PROJECT_MANAGER) {
    const projects = await prisma.project.findMany({
      where: { createdById: req.user!.id },
      include: {
        client: true,
        _count: { select: { tasks: true } },
      },
    });
    const projectIds = projects.map((p) => p.id);

    const [tasksByPriority, overdueCount, upcomingTasks] = await Promise.all([
      prisma.task.groupBy({
        by: ['priority'],
        where: { projectId: { in: projectIds } },
        _count: { id: true },
      }),
      prisma.task.count({ where: { projectId: { in: projectIds }, isOverdue: true } }),
      prisma.task.findMany({
        where: {
          projectId: { in: projectIds },
          status: { not: TaskStatus.DONE },
          dueDate: { lte: new Date(Date.now() + 7 * 86_400_000) },
        },
        orderBy: { dueDate: 'asc' },
        take: 10,
        include: { project: { select: { id: true, name: true } } },
      }),
    ]);

    const priorityCounts = Object.fromEntries(
      tasksByPriority.map((r) => [r.priority, r._count.id]),
    );

    res.json({ data: { projects, priorityCounts, overdueCount, upcomingTasks } });
    return;
  }

  // DEVELOPER
  const [assignedTasks, totalAssigned, overdueCount] = await Promise.all([
    prisma.task.findMany({
      where: { assignedDeveloperId: req.user!.id, status: { not: TaskStatus.DONE } },
      include: { project: { select: { id: true, name: true } } },
      orderBy: [{ priority: 'desc' }, { dueDate: 'asc' }],
    }),
    prisma.task.count({ where: { assignedDeveloperId: req.user!.id } }),
    prisma.task.count({ where: { assignedDeveloperId: req.user!.id, isOverdue: true } }),
  ]);

  res.json({ data: { assignedTasks, totalAssigned, overdueCount } });
});

// ─── Activity ─────────────────────────────────────────────────────────────────

api.get('/activities', async (req, res) => {
  const where: Prisma.ActivityWhereInput =
    req.user!.role === Role.ADMIN
      ? {}
      : req.user!.role === Role.PROJECT_MANAGER
      ? { project: { createdById: req.user!.id } }
      : { task: { assignedDeveloperId: req.user!.id } };

  res.json({
    data: await prisma.activity.findMany({
      where,
      take: 50,
      orderBy: { createdAt: 'desc' },
      include: {
        actor: { select: { name: true } },
        task: { select: { title: true } },
        project: { select: { name: true } },
      },
    }),
  });
});

// ─── Notifications ────────────────────────────────────────────────────────────

api.get('/notifications', async (req, res) => {
  const [data, unreadCount] = await Promise.all([
    prisma.notification.findMany({
      where: { recipientId: req.user!.id },
      orderBy: { createdAt: 'desc' },
      take: 30,
      include: { task: { select: { title: true, projectId: true } } },
    }),
    prisma.notification.count({ where: { recipientId: req.user!.id, readAt: null } }),
  ]);
  res.json({ data, unreadCount });
});

api.patch(
  '/notifications/:notificationId/read',
  validate(z.object({
    body: z.object({}),
    params: z.object({ notificationId: id }),
    query: z.object({}),
  })),
  async (req, res) => {
    const n = await prisma.notification.findFirst({
      where: { id: req.params.notificationId as string, recipientId: req.user!.id },
    });
    if (!n) throw new AppError(404, 'NOT_FOUND', 'Notification not found');

    const data = await prisma.notification.update({
      where: { id: n.id },
      data: { readAt: new Date() },
    });

    const unreadCount = await prisma.notification.count({
      where: { recipientId: req.user!.id, readAt: null },
    });
    emitNotification(req.user!.id, data, unreadCount);
    res.json({ data });
  },
);

api.patch('/notifications/read-all', async (req, res) => {
  await prisma.notification.updateMany({
    where: { recipientId: req.user!.id, readAt: null },
    data: { readAt: new Date() },
  });
  emitNotification(req.user!.id, null, 0);
  res.status(204).send();
});
