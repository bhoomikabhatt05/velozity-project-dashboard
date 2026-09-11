import { beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import type { Express } from 'express';

// We deliberately do NOT need a real database for these tests.
// They validate the request/response contract, middleware chain,
// validation, and RBAC without hitting PostgreSQL.

let app: Express;

beforeAll(async () => {
  // Set minimal env before importing anything that reads it
  process.env.DATABASE_URL   = 'postgresql://test:test@localhost:5432/velozity_test';
  process.env.JWT_ACCESS_SECRET  = 'a'.repeat(64);
  process.env.JWT_REFRESH_SECRET = 'b'.repeat(64);
  process.env.CLIENT_ORIGIN  = 'http://localhost:5173';
  process.env.COOKIE_SECURE  = 'false';

  const { createApp } = await import('./app.js');
  app = createApp();
});

// ─── Health ───────────────────────────────────────────────────────────────────

describe('GET /api/health', () => {
  it('returns ok without a database query', async () => {
    const res = await request(app).get('/api/health');
    expect(res.status).toBe(200);
    expect(res.body.data.status).toBe('ok');
  });
});

// ─── Security — no stack traces ───────────────────────────────────────────────

describe('Security — error shape', () => {
  it('never exposes a stack trace to the client', async () => {
    const res = await request(app).get('/api/tasks');
    expect(res.body.error?.stack).toBeUndefined();
  });

  it('returns structured { error: { code, message } } for errors', async () => {
    const res = await request(app).get('/api/tasks');
    expect(res.body).toMatchObject({ error: { code: expect.any(String), message: expect.any(String) } });
  });
});

// ─── Authentication — unauthenticated access ──────────────────────────────────

describe('Authentication — protected routes require a Bearer token', () => {
  const protectedRoutes = [
    ['GET', '/api/tasks'],
    ['GET', '/api/projects'],
    ['GET', '/api/activities'],
    ['GET', '/api/notifications'],
    ['GET', '/api/dashboard'],
    ['GET', '/api/users'],
    ['GET', '/api/clients'],
  ] as const;

  for (const [method, path] of protectedRoutes) {
    it(`${method} ${path} → 401 without token`, async () => {
      const res = await (request(app) as any)[method.toLowerCase()](path);
      expect(res.status).toBe(401);
      expect(res.body.error.code).toBe('UNAUTHENTICATED');
    });
  }
});

// ─── Authentication — login validation ───────────────────────────────────────

describe('POST /api/auth/login — validation', () => {
  it('rejects missing email with 400', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({ password: 'Password123!' });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });

  it('rejects invalid email format with 400', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: 'not-an-email', password: 'Password123!' });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });

  it('rejects password shorter than 8 chars with 400', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: 'a@b.com', password: 'short' });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });
});

// ─── Authentication — refresh token ──────────────────────────────────────────

describe('POST /api/auth/refresh', () => {
  it('returns 401 when no refresh cookie is present', async () => {
    const res = await request(app).post('/api/auth/refresh');
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('UNAUTHENTICATED');
  });
});

// ─── Authentication — logout ──────────────────────────────────────────────────

describe('POST /api/auth/logout', () => {
  it('returns 204 even with no cookie (best-effort logout)', async () => {
    const res = await request(app).post('/api/auth/logout');
    expect(res.status).toBe(204);
  });
});

// ─── RBAC — invalid / missing Bearer ─────────────────────────────────────────

describe('RBAC — malformed Bearer token', () => {
  it('returns 401 for a garbage token', async () => {
    const res = await request(app)
      .get('/api/tasks')
      .set('Authorization', 'Bearer this-is-not-a-jwt');
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('UNAUTHENTICATED');
  });

  it('returns 401 for a token signed with the wrong secret', async () => {
    // Valid JWT structure but wrong secret
    const fakeToken =
      'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9' +
      '.eyJpZCI6ImZha2UiLCJyb2xlIjoiQURNSU4iLCJuYW1lIjoiRmFrZSIsImlhdCI6MTYwMDAwMDAwMCwiZXhwIjo5OTk5OTk5OTk5fQ' +
      '.WRONG_SIGNATURE';
    const res = await request(app)
      .get('/api/tasks')
      .set('Authorization', `Bearer ${fakeToken}`);
    expect(res.status).toBe(401);
  });
});

// ─── Validation — body validation ─────────────────────────────────────────────

describe('Validate middleware', () => {
  it('returns 400 VALIDATION_ERROR for a completely empty login body', async () => {
    const res = await request(app).post('/api/auth/login').send({});
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
    expect(res.body.error.details).toBeDefined();
  });

  it('returns 400 VALIDATION_ERROR (not 500) for invalid task status in query', async () => {
    // We need a valid (but fake) token — create one using our test secrets
    const jwt = await import('jsonwebtoken');
    const token = jwt.default.sign(
      { id: 'fakeid', role: 'ADMIN', name: 'Test' },
      'a'.repeat(64),
      { expiresIn: '1m' },
    );
    const res = await request(app)
      .get('/api/tasks?status=INVALID_STATUS')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });
});

// ─── RBAC — admin-only endpoints ─────────────────────────────────────────────

describe('RBAC — admin-only endpoints reject non-admins', () => {
  let devToken: string;
  let pmToken: string;

  beforeAll(async () => {
    const jwt = await import('jsonwebtoken');
    devToken = jwt.default.sign(
      { id: 'dev1', role: 'DEVELOPER', name: 'Dev' },
      'a'.repeat(64),
      { expiresIn: '1m' },
    );
    pmToken = jwt.default.sign(
      { id: 'pm1', role: 'PROJECT_MANAGER', name: 'PM' },
      'a'.repeat(64),
      { expiresIn: '1m' },
    );
  });

  it('GET /api/users → 403 for DEVELOPER', async () => {
    const res = await request(app)
      .get('/api/users')
      .set('Authorization', `Bearer ${devToken}`);
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('FORBIDDEN');
  });

  it('GET /api/users → 403 for PROJECT_MANAGER', async () => {
    const res = await request(app)
      .get('/api/users')
      .set('Authorization', `Bearer ${pmToken}`);
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('FORBIDDEN');
  });

  it('POST /api/users → 403 for DEVELOPER', async () => {
    const res = await request(app)
      .post('/api/users')
      .set('Authorization', `Bearer ${devToken}`)
      .send({ name: 'x', email: 'x@x.com', password: 'password123456', role: 'DEVELOPER' });
    expect(res.status).toBe(403);
  });

  it('POST /api/clients → 403 for DEVELOPER', async () => {
    const res = await request(app)
      .post('/api/clients')
      .set('Authorization', `Bearer ${devToken}`)
      .send({ name: 'Evil Client' });
    expect(res.status).toBe(403);
  });
});

// ─── RBAC — developer filter ──────────────────────────────────────────────────

describe('RBAC — developer task filter', () => {
  // This tests that the route is correctly scoped to the developer's user ID
  // without needing a real DB. The route will throw a DB error after auth/RBAC
  // passes — we just confirm it gets past auth checks (doesn't return 401/403).
  it('passes auth/RBAC for GET /api/tasks with valid DEVELOPER token', async () => {
    const jwt = await import('jsonwebtoken');
    const token = jwt.default.sign(
      { id: 'dev1', role: 'DEVELOPER', name: 'Dev' },
      'a'.repeat(64),
      { expiresIn: '1m' },
    );
    const res = await request(app)
      .get('/api/tasks')
      .set('Authorization', `Bearer ${token}`);
    // Not 401 or 403 — DB error is expected in this environment
    expect(res.status).not.toBe(401);
    expect(res.status).not.toBe(403);
  });
});

// ─── Filter query validation ──────────────────────────────────────────────────

describe('Task filter validation', () => {
  let adminToken: string;
  beforeAll(async () => {
    const jwt = await import('jsonwebtoken');
    adminToken = jwt.default.sign(
      { id: 'admin1', role: 'ADMIN', name: 'Admin' },
      'a'.repeat(64),
      { expiresIn: '1m' },
    );
  });

  it('rejects invalid priority value with 400', async () => {
    const res = await request(app)
      .get('/api/tasks?priority=ULTRA')
      .set('Authorization', `Bearer ${adminToken}`);
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });

  it('accepts valid status=IN_PROGRESS without 400', async () => {
    const res = await request(app)
      .get('/api/tasks?status=IN_PROGRESS')
      .set('Authorization', `Bearer ${adminToken}`);
    // Will 500 from DB in test env, but not 400 or 403
    expect(res.status).not.toBe(400);
    expect(res.status).not.toBe(403);
  });
});
