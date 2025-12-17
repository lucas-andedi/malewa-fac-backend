import cors from 'cors';
import { env } from './env';
import { logger } from './logger';

export const corsMiddleware = cors({
  origin: (origin, callback) => {
    const staticAllowed = ['https://malewa-fac.com', 'https://www.malewa-fac.com', 'http://localhost:5174'];
    const envAllowed = env.corsOrigin.split(',').map(o => o.trim());
    const allowedOrigins = [...new Set([...staticAllowed, ...envAllowed])];

    if (!origin || allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      logger.warn({ origin, allowedOrigins }, 'CORS Blocked');
      callback(new Error('Not allowed by CORS'));
    }
  },
  credentials: true,
});
