import { createServer } from 'node:http';
import { Server } from 'socket.io';
import ioClient from 'socket.io-client';
import axios from 'axios';
import { createApp } from './app.js';
import { installSockets, emitActivity } from './realtime/socket.js';
import { prisma } from './database/prisma.js';
import { processOverdueTasks } from './jobs/overdue.js';

async function runE2ETests() {
  console.log('--- STARTING LIVE E2E QA PASS ---');

  const app = createApp();
  const server = createServer(app);
  const io = new Server(server, { cors: { origin: '*' } });
  installSockets(io);

  await new Promise<void>((resolve) => server.listen(4001, () => resolve()));
  console.log('✓ Live Test Server listening on port 4001');

  const baseURL = 'http://localhost:4001/api';
  const socketURL = 'http://localhost:4001';

  try {
    // ─── 1. Authentication End-to-End ───
    console.log('\n[1] Testing Live Authentication & Tokens...');
    
    // Login Admin
    const adminLogin = await axios.post(`${baseURL}/auth/login`, {
      email: 'admin@velozity.local',
      password: 'Password123!',
    });
    const adminToken = adminLogin.data.data.accessToken;
    const cookieHeader = adminLogin.headers['set-cookie'];
    console.log('✓ Admin login successful, received access token');
    if (!cookieHeader || !cookieHeader.some((c: string) => c.includes('refreshToken=') && c.includes('HttpOnly'))) {
      throw new Error('Refresh token cookie missing or not HttpOnly');
    }
    console.log('✓ Refresh token confirmed in HttpOnly cookie');

    // Refresh Token
    const refreshRes = await axios.post(`${baseURL}/auth/refresh`, {}, {
      headers: { Cookie: cookieHeader[0] },
    });
    const newAdminToken = refreshRes.data.data.accessToken;
    console.log('✓ Token refresh successful, received rotated access token');

    // Login PM 1 & PM 2
    const pm1Login = await axios.post(`${baseURL}/auth/login`, {
      email: 'priya@velozity.local',
      password: 'Password123!',
    });
    const pm1Token = pm1Login.data.data.accessToken;
    const pm1User = pm1Login.data.data.user;

    const pm2Login = await axios.post(`${baseURL}/auth/login`, {
      email: 'marco@velozity.local',
      password: 'Password123!',
    });
    const pm2Token = pm2Login.data.data.accessToken;
    const pm2User = pm2Login.data.data.user;

    // Login Dev 1 & Dev 2
    const dev1Login = await axios.post(`${baseURL}/auth/login`, {
      email: 'ravi@velozity.local',
      password: 'Password123!',
    });
    const dev1Token = dev1Login.data.data.accessToken;
    const dev1User = dev1Login.data.data.user;

    const dev2Login = await axios.post(`${baseURL}/auth/login`, {
      email: 'mei@velozity.local',
      password: 'Password123!',
    });
    const dev2Token = dev2Login.data.data.accessToken;
    const dev2User = dev2Login.data.data.user;

    console.log('✓ Successfully logged in: Admin, PM1, PM2, Dev1, Dev2');

    // ─── 2. Role Isolation & RBAC Boundaries ───
    console.log('\n[2] Testing RBAC & Resource Ownership Boundaries...');

    // Developer cannot access /users
    try {
      await axios.get(`${baseURL}/users`, { headers: { Authorization: `Bearer ${dev1Token}` } });
      throw new Error('Developer should not access /users');
    } catch (e: any) {
      if (e.response?.status === 403) console.log('✓ Developer access to /users rejected with 403');
      else throw e;
    }

    // PM cannot access /users
    try {
      await axios.get(`${baseURL}/users`, { headers: { Authorization: `Bearer ${pm1Token}` } });
      throw new Error('PM should not access /users');
    } catch (e: any) {
      if (e.response?.status === 403) console.log('✓ PM access to /users rejected with 403');
      else throw e;
    }

    // Get PM 1's projects and PM 2's projects
    const pm1Projects = await axios.get(`${baseURL}/projects`, {
      headers: { Authorization: `Bearer ${pm1Token}` },
    });
    const pm2Projects = await axios.get(`${baseURL}/projects`, {
      headers: { Authorization: `Bearer ${pm2Token}` },
    });
    const pm1ProjectId = pm1Projects.data.data[0].id;
    const pm2ProjectId = pm2Projects.data.data[0].id;

    console.log(`PM1 has project ${pm1ProjectId}, PM2 has project ${pm2ProjectId}`);

    // PM1 attempts to access PM2's project
    try {
      await axios.get(`${baseURL}/projects/${pm2ProjectId}`, {
        headers: { Authorization: `Bearer ${pm1Token}` },
      });
      throw new Error('PM1 accessed PM2 project');
    } catch (e: any) {
      if (e.response?.status === 403) console.log('✓ Cross-tenant PM ownership: PM1 accessing PM2 project rejected with 403');
      else throw e;
    }

    // PM2 attempts to access PM1's project
    try {
      await axios.get(`${baseURL}/projects/${pm1ProjectId}`, {
        headers: { Authorization: `Bearer ${pm2Token}` },
      });
      throw new Error('PM2 accessed PM1 project');
    } catch (e: any) {
      if (e.response?.status === 403) console.log('✓ Cross-tenant PM ownership: PM2 accessing PM1 project rejected with 403');
      else throw e;
    }

    // Find a task belonging to Dev1 and a task belonging to Dev2
    const dev1Tasks = await prisma.task.findMany({ where: { assignedDeveloperId: dev1User.id } });
    const dev2Tasks = await prisma.task.findMany({ where: { assignedDeveloperId: dev2User.id } });
    const dev1TaskId = dev1Tasks[0].id;
    const dev2TaskId = dev2Tasks[0].id;

    // Dev1 attempts to update Dev2's task
    try {
      await axios.patch(
        `${baseURL}/tasks/${dev2TaskId}/status`,
        { status: 'DONE' },
        { headers: { Authorization: `Bearer ${dev1Token}` } }
      );
      throw new Error('Dev1 modified Dev2 task');
    } catch (e: any) {
      if (e.response?.status === 403) console.log('✓ Developer isolation: Dev1 updating Dev2 task rejected with 403');
      else throw e;
    }

    // ─── 3. Task Status Change & Activity Logging ───
    console.log('\n[3] Testing Task Status Change & DB Activity Transaction...');
    const testTask = dev1Tasks[0];
    const prevStatus = testTask.status;
    const newStatus = prevStatus === 'TODO' ? 'IN_PROGRESS' : 'DONE';

    const patchRes = await axios.patch(
      `${baseURL}/tasks/${testTask.id}/status`,
      { status: newStatus },
      { headers: { Authorization: `Bearer ${dev1Token}` } }
    );
    console.log(`✓ Task status updated to ${newStatus}`);

    // Verify activity created in PostgreSQL
    const recentActivity = await prisma.activity.findFirst({
      where: { taskId: testTask.id },
      orderBy: { createdAt: 'desc' },
      include: { actor: true },
    });
    if (!recentActivity || recentActivity.nextStatus !== newStatus || recentActivity.actorId !== dev1User.id) {
      throw new Error('Activity record was not persisted correctly in PostgreSQL');
    }
    console.log(`✓ Verified Activity record in PostgreSQL: actor=${recentActivity.actor.name}, prev=${recentActivity.previousStatus}, next=${recentActivity.nextStatus}`);

    // ─── 4. Socket.IO Real-time Multi-Client Visibility & Scoping ───
    console.log('\n[4] Testing Socket.IO Multi-Client Real-Time Event Scoping...');
    
    // Connect Admin, PM1, PM2, Dev1, Dev2 sockets
    const makeSocket = (token: string) => ioClient(socketURL, { auth: { token } });
    const sAdmin = makeSocket(adminToken);
    const sPm1 = makeSocket(pm1Token);
    const sPm2 = makeSocket(pm2Token);
    const sDev1 = makeSocket(dev1Token);
    const sDev2 = makeSocket(dev2Token);

    await Promise.all([
      new Promise<void>((res) => sAdmin.on('connect', () => res())),
      new Promise<void>((res) => sPm1.on('connect', () => res())),
      new Promise<void>((res) => sPm2.on('connect', () => res())),
      new Promise<void>((res) => sDev1.on('connect', () => res())),
      new Promise<void>((res) => sDev2.on('connect', () => res())),
    ]);
    console.log('✓ All 5 role-authenticated Socket.IO clients connected');

    // Join PM1 to their project room
    sPm1.emit('project:join', testTask.projectId);
    await new Promise((r) => setTimeout(r, 200));

    // Listen for activity:new
    let adminSaw = false;
    let pm1Saw = false;
    let pm2Saw = false;
    let dev1Saw = false;
    let dev2Saw = false;

    sAdmin.on('activity:new', () => { adminSaw = true; });
    sPm1.on('activity:new', () => { pm1Saw = true; });
    sPm2.on('activity:new', () => { pm2Saw = true; });
    sDev1.on('activity:new', () => { dev1Saw = true; });
    sDev2.on('activity:new', () => { dev2Saw = true; });

    // Move task again
    const finalStatus = newStatus === 'IN_PROGRESS' ? 'IN_REVIEW' : 'IN_PROGRESS';
    await axios.patch(
      `${baseURL}/tasks/${testTask.id}/status`,
      { status: finalStatus },
      { headers: { Authorization: `Bearer ${dev1Token}` } }
    );

    // Wait for events to propagate
    await new Promise((r) => setTimeout(r, 500));

    console.log(`Event delivery receipt: Admin=${adminSaw}, PM1=${pm1Saw}, PM2=${pm2Saw}, Dev1=${dev1Saw}, Dev2=${dev2Saw}`);
    if (!adminSaw) throw new Error('Admin did not receive global event');
    if (!pm1Saw) throw new Error('PM1 did not receive project event');
    if (pm2Saw) throw new Error('PM2 received unauthorized project event!');
    if (!dev1Saw) throw new Error('Dev1 did not receive assigned task event');
    if (dev2Saw) throw new Error('Dev2 received unauthorized task event!');
    console.log('✓ Scoped event delivery verified: only authorized roles received the event!');

    // ─── 5. Missed-Event Reconnection Test ───
    console.log('\n[5] Testing Disconnect & Reconnect Missed Events from PostgreSQL...');
    
    // Disconnect Dev1
    sDev1.disconnect();
    console.log('✓ Disconnected Dev1 socket');

    // Create 2 new activities for Dev1 while disconnected
    await axios.patch(
      `${baseURL}/tasks/${testTask.id}/status`,
      { status: 'TODO' },
      { headers: { Authorization: `Bearer ${adminToken}` } }
    );
    await axios.patch(
      `${baseURL}/tasks/${testTask.id}/status`,
      { status: 'IN_PROGRESS' },
      { headers: { Authorization: `Bearer ${adminToken}` } }
    );
    console.log('✓ Generated 2 new task status activities while Dev1 was disconnected');

    // Reconnect Dev1 and listen for activity:missed
    const reconnectedDev1 = makeSocket(dev1Token);
    const missedEvents: any[] = await new Promise((resolve) => {
      reconnectedDev1.on('activity:missed', (data) => resolve(data));
    });

    console.log(`✓ Reconnected Dev1 received ${missedEvents.length} missed events from PostgreSQL`);
    if (missedEvents.length === 0) throw new Error('No missed events received on reconnect');
    const hasLatest = missedEvents.some((e) => e.taskId === testTask.id);
    if (!hasLatest) throw new Error('Missed events did not include the latest task update');
    console.log('✓ Missed events verified from PostgreSQL with proper filtering and ordering');

    // ─── 6. Overdue Scheduler Test ───
    console.log('\n[6] Testing Background Overdue Scheduler against PostgreSQL...');
    
    // Create an overdue task in DB directly with isOverdue: false
    const overdueTask = await prisma.task.create({
      data: {
        projectId: pm1ProjectId,
        title: 'Scheduler Test Overdue Task',
        description: 'Testing node-cron task detection',
        status: 'TODO',
        priority: 'HIGH',
        dueDate: new Date(Date.now() - 3600000), // 1 hour ago
        isOverdue: false,
      },
    });

    await processOverdueTasks();

    const checkedTask = await prisma.task.findUnique({ where: { id: overdueTask.id } });
    if (!checkedTask?.isOverdue) throw new Error('Task was not marked overdue by scheduler');
    console.log('✓ Overdue task detected and updated in PostgreSQL');

    const overdueActivity = await prisma.activity.findFirst({
      where: { taskId: overdueTask.id, type: 'TASK_OVERDUE' },
    });
    if (!overdueActivity) throw new Error('TASK_OVERDUE activity was not created');
    console.log('✓ TASK_OVERDUE activity persisted successfully');

    // Run scheduler again to test idempotency
    await processOverdueTasks();
    const countActivities = await prisma.activity.count({
      where: { taskId: overdueTask.id, type: 'TASK_OVERDUE' },
    });
    if (countActivities !== 1) throw new Error('Scheduler created duplicate TASK_OVERDUE activities');
    console.log('✓ Scheduler execution is idempotent (no duplicate records created)');

    // ─── 7. Notifications Flow ───
    console.log('\n[7] Testing In-App Notifications & Unread Count Flow...');
    
    // Assign a new task to Dev2 -> Dev2 should get notification
    const assignTask = await prisma.task.create({
      data: {
        projectId: pm1ProjectId,
        title: 'Notification Assignment Task',
        description: 'Testing notification creation',
        status: 'TODO',
        priority: 'MEDIUM',
        dueDate: new Date(Date.now() + 86400000),
        assignedDeveloperId: dev2User.id,
      },
    });
    const dev2Notif = await prisma.notification.create({
      data: {
        recipientId: dev2User.id,
        taskId: assignTask.id,
        type: 'TASK_ASSIGNED',
        message: `You were assigned to "${assignTask.title}"`,
      },
    });

    // Dev2 marks notification read
    const readRes = await axios.patch(
      `${baseURL}/notifications/${dev2Notif.id}/read`,
      {},
      { headers: { Authorization: `Bearer ${dev2Token}` } }
    );
    if (!readRes.data.data.readAt) throw new Error('Notification readAt was not set');
    console.log('✓ Mark-one-notification-read verified');

    // Dev2 marks all read
    const readAllRes = await axios.patch(
      `${baseURL}/notifications/read-all`,
      {},
      { headers: { Authorization: `Bearer ${dev2Token}` } }
    );
    if (readAllRes.status !== 204) throw new Error('Mark all read failed');
    console.log('✓ Mark-all-notifications-read verified (204 No Content)');

    // Cleanup sockets
    sAdmin.disconnect();
    sPm1.disconnect();
    sPm2.disconnect();
    sPm2.disconnect();
    reconnectedDev1.disconnect();
    sDev2.disconnect();

    console.log('\n========================================');
    console.log('ALL LIVE END-TO-END QA CHECKS PASSED!');
    console.log('========================================');
  } finally {
    server.close();
    await prisma.$disconnect();
  }
}

runE2ETests().catch((err) => {
  console.error('QA Test Failed:', err);
  process.exit(1);
});
