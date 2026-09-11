# Architecture — proposed minimum implementation

## Phase-1 status

This is a proposed architecture, not an implementation claim. The repository was inspected on 2026-09-11 and is empty: there is no application source, package manifest, database schema, test suite, environment template, or Git metadata.

The design below is limited to the attached Velozity Global Solutions assessment requirements.

## Repository layout

Use a small workspace with two TypeScript applications and one shared package only if shared API types prove useful:

```
client/                 React + TypeScript application
  src/
    api/                HTTP client and typed endpoint wrappers
    components/         reusable UI (task list, filters, activity, notifications)
    features/           auth, dashboard, projects, tasks, notifications
    pages/              role-aware routes/pages
    realtime/           Socket.IO connection and event handlers
    state/              session and notification state

server/                 Node.js + Express + TypeScript application
  src/
    config/             environment parsing
    controllers/        HTTP request/response handling
    routes/             route definitions and middleware composition
    services/           business rules, transactions, event publication
    repositories/       Prisma database queries
    middleware/         auth, RBAC, validation, error handler
    sockets/            authenticated Socket.IO setup and room membership
    jobs/               node-cron overdue-task scheduler
    validators/         server-side request schemas
  prisma/               PostgreSQL schema, migrations, seed script
```

Express is the proposed backend because its middleware model makes per-route authentication, validation, RBAC, and structured errors direct. Prisma is the proposed PostgreSQL access layer because it supports migrations, relational queries, transactions, and a repeatable seed script. Socket.IO is the proposed WebSocket layer because named events and authenticated rooms make the required role-filtered delivery concise. `node-cron` is sufficient for one periodic overdue-task job and avoids introducing Redis/Bull when the assessment does not require queue durability or distributed workers.

## Database entities and relationships

| Entity | Essential fields | Relationships / purpose |
| --- | --- | --- |
| `User` | id, name, email, passwordHash, role, createdAt | Has many created projects, assigned tasks, activity records, notifications, and refresh tokens. `role` is `ADMIN`, `PROJECT_MANAGER`, or `DEVELOPER`. |
| `RefreshToken` | id, userId, tokenHash, expiresAt, revokedAt, createdAt | Many-to-one with `User`; stores a hash of each refresh token so rotation/revocation can be enforced. |
| `Client` | id, name, createdAt | Has many projects. |
| `Project` | id, name, clientId, createdById, createdAt | Belongs to `Client` and the creating `User` (PM/admin); has many tasks and activity records. |
| `Task` | id, projectId, title, description, assignedDeveloperId, status, priority, dueDate, isOverdue, createdAt, updatedAt | Belongs to a project and may be assigned to one developer. Status is `TODO`, `IN_PROGRESS`, `IN_REVIEW`, or `DONE`; priority is `LOW`, `MEDIUM`, `HIGH`, or `CRITICAL`. |
| `Activity` | id, projectId, taskId, actorId, type, previousStatus, nextStatus, createdAt | Immutable, database-backed audit/event record for task status changes; belongs to project, task, and actor. |
| `Notification` | id, recipientId, taskId, type, message, readAt, createdAt | Persisted in-app notification for assignment and review events; belongs to recipient and task. |

Foreign keys enforce all ownership links. Initial indexes should cover `Task(projectId, status)`, `Task(assignedDeveloperId, priority, dueDate)`, `Task(dueDate, isOverdue)`, `Activity(projectId, createdAt)`, `Activity(taskId, createdAt)`, `Activity(actorId, createdAt)`, `Notification(recipientId, readAt, createdAt)`, `Project(createdById)`, and unique `User(email)`. The README must later explain final indexing decisions, as required by the assessment.

## Authentication flow

1. `POST /auth/login` validates credentials server-side and verifies the password hash.
2. The server returns a short-lived JWT access token in the JSON response and creates a rotated, long-lived refresh token record containing only a hash.
3. The raw refresh token is sent only as a `HttpOnly`, `Secure` (production), appropriately scoped cookie. It is never written to localStorage.
4. `POST /auth/refresh` reads the cookie, validates and rotates the stored refresh token, and returns a new access token while replacing the cookie.
5. `POST /auth/logout` revokes the persisted token and clears the cookie.
6. The React client keeps the access token in memory, sends it as a Bearer token, and uses the refresh endpoint when needed.

JWT signing keys, database URL, client origin, and cookie/security settings must be read from `.env`; provide `.env.example` without secrets.

## Authorization flow

Every protected HTTP route first verifies the access JWT and then runs API-level authorization in service/policy functions; UI visibility is only a usability layer.

| Actor | Server-enforced scope |
| --- | --- |
| Admin | Full access to clients, projects, users, tasks, and all activity. |
| Project Manager | Can create/manage only projects whose `createdById` is their user ID; can assign tasks only within those projects; can read activity only for those projects. |
| Developer | Can list/read only tasks where `assignedDeveloperId` is their user ID; may change only their assigned task status; cannot read another developer’s tasks or PM data. |

Resource ownership is checked after fetching the resource and before any mutation or response serialization. Unauthorized roles receive a consistent `403` error and missing/inaccessible resources do not leak data. Request validators reject malformed route, query, and body inputs before controller logic. A single error middleware returns a structured safe response (for example `{ "error": { "code", "message", "details?" } }`) without stack traces.

## WebSocket architecture

Socket.IO authenticates the access token during connection. The server derives the user and role from that token; the client must not choose privileged rooms.

- Each authenticated connection joins a private `user:{userId}` room for notifications.
- When a user views an authorized project, the server validates project access before joining `project:{projectId}`. It removes the room on leaving the page.
- A task-status transaction writes the task and activity row first. After commit, it emits the activity/status event to authorized project viewers.
- Admin clients additionally receive global-feed events. PM clients receive events only where `project.createdById` matches them. Developer event delivery is limited to activities for tasks assigned to them.
- On connection/reconnection, the server queries the database for up to 20 activity records created after the client’s persisted last-seen activity ID/timestamp, applies the same role filter, and emits them as missed events. No in-memory event cache is used for this requirement.
- A presence service tracks authenticated connected user IDs (with socket counts for multiple tabs) and emits the current online-user count to admins. Presence is connection-driven, not polling.

The event payload should contain an immutable activity ID, actor display data, task/project IDs, previous and new status, and a timestamp so the UI can render the required actor/change/time feed and de-duplicate reconnect delivery.

## Notification architecture

Within the same database transaction as the triggering task mutation:

- assigning a task creates a notification for the assigned developer;
- changing a task to `IN_REVIEW` creates a notification for that project’s PM/creator.

After commit, the server emits the new notification and the recalculated unread count to the recipient’s private Socket.IO room. REST endpoints list notifications and mark one or all as read; they enforce recipient ownership. Marking read also broadcasts the new unread count. The frontend displays the persisted list in a dropdown and updates its badge from socket events, not polling.

## Background-job architecture

`node-cron` runs a server-side, idempotent periodic job (for example, once per hour). It finds unfinished tasks with a past due date and `isOverdue = false`, marks them overdue in PostgreSQL, and records operational failures through server logging. The scheduler never depends on a page load. It will be started with the server process and covered by an integration test against a test database. Deployment documentation must state the limitation that a single scheduler instance is required unless a distributed lock/worker is introduced.

## Smallest practical implementation sequence

1. Initialize the TypeScript workspace, Docker-based PostgreSQL local setup, Prisma schema/migrations, environment template, and seed script.
2. Implement auth, refresh-token rotation, error handling, validation, and ownership/RBAC integration tests before feature UI.
3. Implement clients, projects, tasks, activity persistence, URL-query task filters, and role-specific dashboard queries.
4. Add Socket.IO authentication, scoped rooms, database-backed missed-event catch-up, presence, and notification events; test with multiple authenticated clients.
5. Add the cron job, seed verification, production README, deployment configuration, and final acceptance checks.
