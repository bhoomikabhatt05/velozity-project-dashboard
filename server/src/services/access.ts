import { prisma } from '../database/prisma.js';
import type { TokenUser } from '../auth/tokens.js';
import { AppError } from '../errors/app-error.js';
export async function projectFor(user: TokenUser, projectId: string) { const project = await prisma.project.findUnique({ where: { id: projectId } }); if (!project) throw new AppError(404, 'NOT_FOUND', 'Project not found'); if (user.role === 'ADMIN' || (user.role === 'PROJECT_MANAGER' && project.createdById === user.id)) return project; throw new AppError(403, 'FORBIDDEN', 'Project access denied'); }
export async function taskFor(user: TokenUser, taskId: string) { const task = await prisma.task.findUnique({ where: { id: taskId }, include: { project: true } }); if (!task) throw new AppError(404, 'NOT_FOUND', 'Task not found'); if (user.role === 'ADMIN' || (user.role === 'PROJECT_MANAGER' && task.project.createdById === user.id) || (user.role === 'DEVELOPER' && task.assignedDeveloperId === user.id)) return task; throw new AppError(403, 'FORBIDDEN', 'Task access denied'); }

