import cors from 'cors';
import { env } from './env';
import { logger } from './logger';

export const corsMiddleware = cors({
  origin: (origin, callback) => {
    const allowedOrigins = env.corsOrigin.split(',').map(o => o.trim());
    if (!origin || allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      logger.warn({ origin, allowedOrigins }, 'CORS Blocked');
      callback(new Error('Not allowed by CORS'));
    }
  },
  credentials: true,
});
