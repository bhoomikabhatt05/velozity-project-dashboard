import 'dotenv/config';
import { z } from 'zod';

const schema = z.object({ DATABASE_URL: z.string().url(), JWT_ACCESS_SECRET: z.string().min(32), JWT_REFRESH_SECRET: z.string().min(32), CLIENT_ORIGIN: z.string().url().default('http://localhost:5173'), PORT: z.coerce.number().int().positive().default(4000), NODE_ENV: z.enum(['development', 'test', 'production']).default('development'), COOKIE_SECURE: z.enum(['true', 'false']).default('false') });
export const env = schema.parse(process.env);

