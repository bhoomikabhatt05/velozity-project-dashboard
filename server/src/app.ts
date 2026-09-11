import express from 'express'; import cors from 'cors'; import cookieParser from 'cookie-parser';
import { env } from './config/env.js'; import { api } from './routes/index.js'; import { errorHandler } from './middleware/error.js';
export function createApp() { const app = express(); app.use(cors({ origin: env.CLIENT_ORIGIN, credentials: true })); app.use(express.json({ limit: '1mb' })); app.use(cookieParser()); app.use('/api', api); app.use(errorHandler); return app; }

