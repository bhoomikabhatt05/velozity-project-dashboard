import crypto from 'node:crypto';
import jwt from 'jsonwebtoken';
import { env } from '../config/env.js';
import type { Role } from '@prisma/client';
export type TokenUser = { id: string; role: Role; name: string };
export const signAccess = (user: TokenUser) => jwt.sign(user, env.JWT_ACCESS_SECRET, { expiresIn: '15m' });
export const signRefresh = (user: TokenUser) => jwt.sign({ id: user.id, nonce: crypto.randomUUID() }, env.JWT_REFRESH_SECRET, { expiresIn: '7d' });
export const verifyAccess = (token: string) => jwt.verify(token, env.JWT_ACCESS_SECRET) as TokenUser;
export const verifyRefresh = (token: string) => jwt.verify(token, env.JWT_REFRESH_SECRET) as { id: string; exp: number };
export const hashToken = (token: string) => crypto.createHash('sha256').update(token).digest('hex');

