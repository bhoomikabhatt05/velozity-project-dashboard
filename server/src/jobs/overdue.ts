import cron from 'node-cron';
import { TaskStatus, ActivityType } from '@prisma/client';
import { prisma } from '../database/prisma.js';
import { emitActivity } from '../realtime/socket.js';

/**
 * Mark tasks as overdue when their dueDate has passed and they are not DONE.
 * Creates a TASK_OVERDUE activity record and emits a real-time socket event
 * for each newly overdue task. Safe to run repeatedly — only processes tasks
 * where isOverdue is still false.
 */
export async function processOverdueTasks(): Promise<void> {
  const now = new Date();

  // Find tasks that just became overdue (not yet flagged)
  const tasksToMark = await prisma.task.findMany({
    where: {
      dueDate: { lt: now },
      status: { not: TaskStatus.DONE },
      isOverdue: false,
    },
    include: {
      project: { select: { id: true, createdById: true } },
    },
  });

  if (tasksToMark.length === 0) return;

  // Batch-update all at once
  await prisma.task.updateMany({
    where: { id: { in: tasksToMark.map((t) => t.id) } },
    data: { isOverdue: true },
  });

  // Create TASK_OVERDUE activity for each task and emit socket events
  for (const task of tasksToMark) {
    try {
      const activity = await prisma.activity.create({
        data: {
          projectId: task.projectId,
          taskId: task.id,
          actorId: task.project.createdById, // PM who owns the project is the "actor"
          type: ActivityType.TASK_OVERDUE,
          previousStatus: task.status,
          nextStatus: task.status,
        },
        include: {
          actor: { select: { name: true } },
          task: { select: { title: true } },
          project: { select: { name: true } },
        },
      });

      emitActivity(activity, task.projectId, task.assignedDeveloperId);
    } catch (err) {
      // Log but don't throw — one failure shouldn't stop processing others
      console.error(`Failed to create TASK_OVERDUE activity for task ${task.id}:`, err);
    }
  }

  console.log(`[overdue-job] Marked ${tasksToMark.length} task(s) as overdue.`);
}

/** Runs processOverdueTasks every hour on the hour. */
export const startOverdueJob = () =>
  cron.schedule('0 * * * *', () => {
    void processOverdueTasks().catch(console.error);
  });
