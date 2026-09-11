# Velozity Client Project Dashboard

A React/TypeScript and Express/TypeScript internal agency dashboard implementing PostgreSQL-backed tasks, role-based access, Socket.IO activity/notifications, JWT authentication, and an overdue-task scheduler.

## Stack and architecture

- **Client:** React, Vite, React Router, Axios, Socket.IO client.
- **Server:** Express, Prisma, Zod, Socket.IO, node-cron.
- **Database:** PostgreSQL with Prisma migrations and relations.

The client is in `client/`; the server is in `server/`. Server routes validate inputs, controllers/routes invoke services/access policies, Prisma persists data, and Socket.IO publishes post-transaction events. See [ARCHITECTURE.md](ARCHITECTURE.md) for the full design and data model.

## Local setup

Prerequisites: Node.js 20+ and Docker Desktop (preferred) or PostgreSQL 16+.

1. Copy `.env.example` to `.env` and replace both JWT values with independently generated 32+ character secrets.
2. Start PostgreSQL: `docker compose up -d`.
3. Install dependencies: `npm install`.
4. Generate and migrate Prisma: `npm run db:generate`, then `npm run db:migrate -w server -- --name init`.
5. Seed the database: `npm run db:seed`.
6. Start both applications: `npm run dev`.

Vite runs on `http://localhost:5173`; the API and Socket.IO server run on `http://localhost:4000`. The default seeded password is `Password123!` for the displayed accounts, including `admin@velozity.local`.

## Development and verification

- `npm run typecheck` — strict TypeScript checks.
- `npm run lint` — currently TypeScript-based lint gate.
- `npm run test` — API safety smoke tests.
- `npm run build` — production builds for both packages.
- `npm run db:seed` — creates 1 admin, 2 PMs, 4 developers, 3 projects, 15 tasks, two overdue tasks, and activity records.

## Security and authorization

Access JWTs are short lived and retained only in browser memory. Refresh JWTs are hashed in PostgreSQL and sent only through an `HttpOnly` cookie; refresh-token rotation and logout revocation are server-side. All protected routes authenticate the bearer token and enforce role and resource ownership in the backend. Error middleware exposes a consistent safe error object and does not return stack traces. CORS is credentialed and limited to `CLIENT_ORIGIN`; secure cookies are enabled with `COOKIE_SECURE=true` in production.

## WebSockets and jobs

Socket.IO was selected for authenticated rooms and named events. Admins receive global activity, PMs use authorized project rooms, and developers only receive events for assigned tasks. Reconnect catch-up queries up to 20 eligible activity rows from PostgreSQL; it does not use an in-memory event cache. Socket connections maintain the live admin presence count and notification unread badge.

`node-cron` is used for a small, idempotent hourly overdue scan. It is appropriate for this single-process assessment application and avoids Redis/Bull operational overhead. In a horizontally scaled deployment, use a distributed lock or a dedicated worker so only one scheduler runs.

## Schema and indexes

`User` owns projects, activities, notifications, and refresh tokens. `Client` has projects; projects have tasks and activities; tasks have an optional developer assignment, activities, and notifications. Foreign keys preserve those links. Indexes support project status queries, developer priority/due-date lists, overdue scans, activity feeds, notifications, and ownership lookups. The Prisma schema is at `server/prisma/schema.prisma`.

## Deployment preparation and limitations

Deploy the Vite static output separately from the Node server (for example, a Vercel frontend and a long-running WebSocket-capable Node host). Configure `DATABASE_URL`, JWT secrets, `CLIENT_ORIGIN`, `COOKIE_SECURE=true`, and the frontend `VITE_API_URL`/`VITE_SOCKET_URL` as deployment environment variables. Vercel serverless functions are not suitable by themselves for a persistent Socket.IO service; use a compatible persistent host for the backend. Current limitations: no distributed Socket.IO adapter or cron lock, no pagination, and no automated end-to-end database/socket test environment included.

## Assessment explanation (196 words)

The hardest problem was keeping real-time activity useful without turning it into a data-leak path. A project page is not a sufficient authorization boundary: an authenticated developer may share a project with other developers but must not receive their tasks or activity. The solution treats the database as the authority and applies the same role-and-ownership predicate to REST activity queries, reconnect catch-up, project-room joins, and live Socket.IO delivery. Status changes are transactional: the task update and immutable activity record commit first, then the server emits a payload containing the actor, task, old status, new status, and timestamp. Admins receive the global stream; PM project rooms are authorized before joining; developers receive only their assigned-task events through private user rooms. On reconnect, the server queries PostgreSQL for up to twenty eligible records instead of relying on process memory, so a restart does not silently lose the catch-up source.

I also chose a short-lived in-memory access token plus a rotated, database-backed refresh token in an HttpOnly cookie. This keeps the more valuable refresh credential out of localStorage while allowing session continuation. With more time, I would add a Redis Socket.IO adapter and a distributed scheduler lock, then run browser-level multi-user integration tests against an ephemeral PostgreSQL instance.
