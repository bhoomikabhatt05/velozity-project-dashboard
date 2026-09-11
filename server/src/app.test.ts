import { beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
let app: Awaited<typeof import('./app.js')>['createApp'];
beforeAll(async () => { process.env.DATABASE_URL = 'postgresql://test:test@localhost:5432/test'; process.env.JWT_ACCESS_SECRET = 'a'.repeat(40); process.env.JWT_REFRESH_SECRET = 'b'.repeat(40); const module = await import('./app.js'); app = module.createApp; });
describe('API safety smoke tests', () => { it('returns health without a database query', async () => expect((await request(app()).get('/api/health')).body.data.status).toBe('ok')); it('returns a structured error for a missing bearer token', async () => { const response = await request(app()).get('/api/tasks'); expect(response.status).toBe(401); expect(response.body.error.code).toBe('UNAUTHENTICATED'); expect(response.body.error.stack).toBeUndefined(); }); });
