import type { NextFunction, Request, Response } from 'express';
import type { Role } from '@prisma/client';
import { verifyAccess, type TokenUser } from '../auth/tokens.js';
import { AppError } from '../errors/app-error.js';
declare global { namespace Express { interface Request { user?: TokenUser } } }
export function authenticate(req: Request, _res: Response, next: NextFunction) { try { const token = req.header('authorization')?.replace(/^Bearer\s+/i, ''); if (!token) throw new AppError(401, 'UNAUTHENTICATED', 'Access token is required'); req.user = verifyAccess(token); next(); } catch { next(new AppError(401, 'UNAUTHENTICATED', 'Invalid or expired access token')); } }
export const allow = (...roles: Role[]) => (req: Request, _res: Response, next: NextFunction) => !req.user || !roles.includes(req.user.role) ? next(new AppError(403, 'FORBIDDEN', 'Insufficient permissions')) : next();

