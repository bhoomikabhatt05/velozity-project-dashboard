# Assessment requirements audit

## Audit scope and status definitions

Source of truth: the attached Velozity Global Solutions Full Stack Developer Technical Hiring Assessment screenshots. This file records the repository state inspected on 2026-09-11; it does not treat proposed architecture as implementation.

- **PASS** — implemented and verified by relevant evidence/tests.
- **PARTIAL** — some implementation exists, but required behavior or verification is incomplete.
- **FAIL** — evidence shows the requirement is absent or contradicted.
- **UNVERIFIED** — no adequate evidence yet; no conclusion about implementation is made.

### Verified repository baseline

`/Users/bhoomikabhatt/Documents/New project` contains no files or directories other than `.` and `..`. It is not a Git repository. Therefore application requirements below are **FAIL** where absence is certain; external/submission requirements are **UNVERIFIED** unless their absence is directly established. Creating this planning file does not satisfy a required implementation or README.

## Product, authentication, roles, and authorization

| Requirement | Status | Evidence / gap |
| --- | --- | --- |
| Build a full-stack internal client-project dashboard for project management, task tracking, and real-time team activity. | FAIL | No application exists. |
| Admin has full access; manages clients, projects, users; views all activity. | FAIL | No backend or frontend exists. |
| Project Manager creates/manages projects, assigns tasks, and sees only their team's activity. | FAIL | No backend or frontend exists. |
| Project Manager can only manage projects they created and cannot see/edit another PM's projects. | FAIL | No authorization or data layer exists. |
| Developer sees only assigned tasks, can update assigned task status, and cannot access other developers' tasks. | FAIL | No authorization or data layer exists. |
| JWT authentication uses access and refresh tokens. | FAIL | No authentication code exists. |
| Refresh token is stored in an HttpOnly cookie, not localStorage. | FAIL | No authentication code exists. |
| Role middleware is enforced on every protected route at the API level. | FAIL | No API exists. |
| A developer cannot obtain PM data by directly calling an API endpoint with a modified token. | FAIL | No API/RBAC tests exist. |

## Project and task management

| Requirement | Status | Evidence / gap |
| --- | --- | --- |
| Admin and PM can create projects and assign them to clients. | FAIL | No application or database exists. |
| Projects contain tasks. | FAIL | No database schema exists. |
| Each task has title, description, assigned developer, status, priority, due date, and activity log. | FAIL | No task model exists. |
| Supported task statuses are To Do, In Progress, In Review, and Done. | FAIL | No task model exists. |
| Supported priorities are Low, Medium, High, and Critical. | FAIL | No task model exists. |
| Status changes are recorded with timestamp and actor in a database-backed log. | FAIL | No database or mutation flow exists. |
| Past-due tasks are automatically flagged Overdue by a scheduled background job, not on page load. | FAIL | No scheduler or database exists. |

## Real-time activity feed and presence

| Requirement | Status | Evidence / gap |
| --- | --- | --- |
| Implement the live activity feed using Socket.IO or native WebSocket; justify the choice in README. | FAIL | No server, WebSocket code, or README exists. |
| A task-status update reaches authorized users viewing that project in real time without refresh. | FAIL | No task or WebSocket implementation exists. |
| Feed displays actor, change, and timestamp in the required human-readable form. | FAIL | No UI or activity model exists. |
| Admin sees activity across all projects in a global feed. | FAIL | No feed exists. |
| PM sees activity only from their projects. | FAIL | No feed/RBAC exists. |
| Developer sees activity only for assigned tasks. | FAIL | No feed/RBAC exists. |
| Reconnecting offline users receive their last 20 missed eligible events from the database, not memory cache. | FAIL | No database, event logic, or WebSocket implementation exists. |
| Online presence is maintained through WebSocket. | FAIL | No WebSocket implementation exists. |
| Admin dashboard’s online-user count is live WebSocket presence data. | FAIL | No dashboard or presence implementation exists. |

## Dashboards, lists, and filters

| Requirement | Status | Evidence / gap |
| --- | --- | --- |
| Admin dashboard shows total projects, tasks by status, overdue count, and live online-user count. | FAIL | No dashboard exists. |
| PM dashboard shows own-project summary, tasks by priority, and upcoming due dates this week. | FAIL | No dashboard exists. |
| Developer dashboard shows assigned tasks sorted by priority then due date. | FAIL | No dashboard or query exists. |
| All task lists filter by status, priority, and due-date range. | FAIL | No task-list implementation exists. |
| Filters use shareable URL query parameters. | FAIL | No routes/query handling exists. |

## Notifications

| Requirement | Status | Evidence / gap |
| --- | --- | --- |
| Assigning a task notifies its developer in-app; notification is stored in the database and shown in UI. | FAIL | No notifications, database, or UI exist. |
| Moving a task to In Review notifies its PM. | FAIL | No task mutation or notification flow exists. |
| Notifications have an unread badge and dropdown. | FAIL | No UI exists. |
| A user can mark an individual notification or all notifications as read. | FAIL | No API/UI exists. |
| Unread notification count updates through WebSocket, not polling. | FAIL | No notification or WebSocket implementation exists. |

## Technical requirements

| Requirement | Status | Evidence / gap |
| --- | --- | --- |
| Frontend is React with TypeScript; plain JavaScript is not accepted. | FAIL | No frontend exists. |
| Backend is Node.js with Express or Fastify, and the choice is justified. | FAIL | No backend or documentation exists. |
| Database is PostgreSQL with relational design, foreign keys, frequent-query indexes, and README indexing rationale. | FAIL | No schema/database/README exists. |
| Data access uses Prisma or raw SQL; MongoDB/NoSQL is not used. | FAIL | No data layer exists. |
| Real-time transport is WebSocket; long-polling and SSE are not used. | FAIL | No real-time implementation exists. |
| Overdue scheduler uses node-cron or Bull and choice is justified. | FAIL | No scheduler or documentation exists. |
| All API inputs are validated server-side. | FAIL | No API exists. |
| Every API endpoint returns consistent structured errors without raw stack traces. | FAIL | No API exists. |
| Secrets are in `.env`, never hardcoded. | FAIL | No code or environment configuration exists. |

## Seed data

| Requirement | Status | Evidence / gap |
| --- | --- | --- |
| Repository includes a seed script. | FAIL | No repository files exist. |
| Seed creates 1 Admin, 2 Project Managers, and 4 Developers. | FAIL | No seed script exists. |
| Seed creates at least 3 projects with at least 5 tasks each in various statuses. | FAIL | No seed script exists. |
| Seed creates at least 2 overdue tasks. | FAIL | No seed script exists. |
| Seed creates existing activity records so the initial feed is non-empty. | FAIL | No seed script exists. |

## Submission requirements

| Requirement | Status | Evidence / gap |
| --- | --- | --- |
| Submit a public GitHub/GitLab repository. | FAIL | The inspected workspace itself is not a Git repository. Public remote status has not been checked. |
| Host the application on Vercel and share a live application link. | UNVERIFIED | No deployment metadata or link is available in this workspace. |
| Provide a README with local setup instructions (Docker preferred). | FAIL | No README exists. |
| README includes database schema diagram or description. | FAIL | No README exists. |
| README includes architectural decisions, including WebSocket choice, job-queue choice, and token-storage approach. | FAIL | No README exists. |
| README includes known limitations. | FAIL | No README exists. |
| Provide a 150–250 word explanation of the hardest problem solved, real-time role-filtered feed handling, and one thing to do differently. | FAIL | No submission explanation exists. |

## Disqualification / hard-blocker assessment

The attached assessment does not explicitly label any condition “automatic disqualification.” The following are nevertheless direct, currently unmet submission or non-negotiable technical requirements and would prevent a compliant submission if left unresolved:

1. No Git repository/public GitHub or GitLab repository is present.
2. No deployed Vercel application or live link has been evidenced.
3. No React + TypeScript frontend, Node.js Express/Fastify backend, PostgreSQL relational database, or Prisma/raw-SQL layer exists.
4. No API-level JWT/RBAC enforcement exists; frontend-only authorization is expressly unacceptable.
5. No WebSocket implementation exists; long-polling/SSE cannot be substituted.
6. No database-backed missed-event catch-up, persisted notifications, or WebSocket unread-count behavior exists.
7. No scheduled overdue-task job, server validation, structured error handling, environment configuration, seed data, or README exists.

## Minimal compliant implementation proposal

Implement only the assessment’s core flows:

1. React + TypeScript client; Express + TypeScript server; PostgreSQL + Prisma; Socket.IO; node-cron.
2. A relational schema for users, refresh tokens, clients, projects, tasks, activities, and notifications, with the ownership and feed-query indexes described in `ARCHITECTURE.md`.
3. Login, refresh rotation in an HttpOnly cookie, logout, protected endpoint middleware, and resource-level RBAC tests.
4. CRUD only for clients/projects/tasks/users necessary for admin and PM roles; a developer task/status endpoint restricted to assignee ownership.
5. Role-scoped dashboards and task query filters (`status`, `priority`, `dueFrom`, `dueTo`) backed by server queries.
6. Persist activity and notifications in task-mutation transactions, then emit scoped Socket.IO events; query the database for up to 20 missed events on reconnect.
7. One idempotent node-cron overdue scan; Prisma seed data meeting the exact minimum counts; integration tests covering persistence, permissions, sockets, and scheduler behavior.
8. Docker-oriented setup, README decisions/limitations/schema explanation, Vercel deployment, public repository, and the requested 150–250 word explanation.

No extra roles, chat, file uploads, analytics, polling, SSE, or unrelated product features are needed.

## Current implementation audit — 2026-09-11

The detailed tables above are the immutable empty-workspace baseline. This section supersedes their status values after implementation. **PASS** is reserved for behavior exercised by the listed checks; code review alone is **PARTIAL**.

| Requirement group | Current status | Evidence / remaining verification |
| --- | --- | --- |
| React TypeScript/Vite frontend, Express TypeScript backend, PostgreSQL Prisma schema | PARTIAL | Both production builds and TypeScript checks pass. Prisma schema generates, but migration against PostgreSQL has not run. |
| JWT access/refresh, HttpOnly refresh cookie, logout, structured errors | PARTIAL | Implemented; API smoke test verifies safe missing-token error. Login/refresh/logout persistence not yet database-tested. |
| API RBAC and resource ownership | PARTIAL | Server routes restrict admin/PM/developer scopes and resources. Direct cross-user integration tests remain required. |
| Clients, projects, task lifecycle, activity persistence | PARTIAL | Routes and transactional activity creation implemented. Database mutation verification remains required. |
| Socket.IO activity, role filtering, missed events, presence | PARTIAL | Authenticated rooms, DB catch-up query, and presence code implemented. Multi-client socket tests remain required. |
| Role dashboards and URL filters | PARTIAL | Task API filters and responsive role-aware UI exist. Required aggregate dashboard queries and browser verification remain incomplete. |
| Persisted notifications and WebSocket unread count | PARTIAL | Assignment/review notification creation and event delivery implemented. Database/socket verification remains required. |
| node-cron overdue processing | PARTIAL | Idempotent hourly query exists; scheduler behavior not yet run against PostgreSQL. |
| Seed script exact data | PARTIAL | Code creates exact required counts and activity/overdue data; it has not been executed against PostgreSQL. |
| README, environment/deployment preparation, 150–250 word explanation | PARTIAL | README, `.env.example`, Docker Compose, and deployment notes created. No public repository or deployment exists. |
| Public repository and Vercel live link | FAIL | Git is initialized locally, but no remote repository or deployment has been created. |

### Checks actually run after implementation

- `npm run db:generate` — PASS.
- `npm run typecheck` — PASS.
- `npm run build` — PASS (server build and Vite production build).
- `npm run lint` — PASS (configured TypeScript lint gates).
- `npm run test` — PASS: health endpoint and structured unauthenticated API error.

### Highest-risk remaining gaps

1. Run Docker PostgreSQL, apply the initial migration, seed it, and verify the exact database rows.
2. Add and run integration tests for login/refresh/logout, PM ownership boundaries, developer task boundaries, scheduler processing, and notifications.
3. Add multi-client Socket.IO tests for live role filtering, reconnect catch-up, unread-count events, and presence.
4. Implement the remaining role-specific dashboard aggregates and project/task detail/create/edit UI before treating UI requirements as complete.
5. Create a public remote and deploy a persistent Socket.IO-capable backend plus the Vite frontend; provide the Vercel live URL required by the assessment.
