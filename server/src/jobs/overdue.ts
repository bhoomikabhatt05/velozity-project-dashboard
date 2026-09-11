import cron from 'node-cron';
import { TaskStatus } from '@prisma/client';
import { prisma } from '../database/prisma.js';
export async function processOverdueTasks() { return prisma.task.updateMany({ where: { dueDate: { lt: new Date() }, status: { not: TaskStatus.DONE }, isOverdue: false }, data: { isOverdue: true } }); }
export const startOverdueJob = () => cron.schedule('0 * * * *', () => { void processOverdueTasks().catch(console.error); });

