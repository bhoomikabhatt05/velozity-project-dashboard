import type { RequestHandler } from 'express';
import type { ZodTypeAny } from 'zod';
export const validate = (schema: ZodTypeAny): RequestHandler => (req, _res, next) => { const parsed = schema.parse({ body: req.body, params: req.params, query: req.query }); req.body = parsed.body; req.params = parsed.params; req.query = parsed.query; next(); };

