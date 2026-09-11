import type { RequestHandler } from 'express';
import type { ZodTypeAny } from 'zod';
import { ZodError } from 'zod';
import { AppError } from '../errors/app-error.js';

export const validate = (schema: ZodTypeAny): RequestHandler =>
  (req, _res, next) => {
    try {
      const parsed = schema.parse({ body: req.body, params: req.params, query: req.query });
      req.body = parsed.body;
      req.params = parsed.params as typeof req.params;
      req.query = parsed.query as typeof req.query;
      next();
    } catch (err) {
      if (err instanceof ZodError) {
        next(new AppError(400, 'VALIDATION_ERROR', 'Invalid request input', err.flatten()));
      } else {
        next(err);
      }
    }
  };
