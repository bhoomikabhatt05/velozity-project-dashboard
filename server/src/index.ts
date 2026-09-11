import { createServer } from 'node:http';
import { Server } from 'socket.io';
import { createApp } from './app.js';
import { env } from './config/env.js';
import { installSockets } from './realtime/socket.js';
import { startOverdueJob } from './jobs/overdue.js';

const app  = createApp();
const http = createServer(app);
const io   = new Server(http, {
  cors: { origin: env.CLIENT_ORIGIN, credentials: true },
});

installSockets(io);
startOverdueJob();

http.listen(env.PORT, () => {
  console.log(`[server] API listening on http://localhost:${env.PORT}`);
  console.log(`[server] Client origin: ${env.CLIENT_ORIGIN}`);
  console.log(`[server] Environment: ${env.NODE_ENV}`);
});
