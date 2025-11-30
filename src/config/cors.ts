import cors from 'cors';
import { env } from './env';

export const corsMiddleware = cors({
  origin: (origin, callback) => {
    const allowedOrigins = env.corsOrigin.split(',').map(o => o.trim());
    if (!origin || allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      callback(new Error('Not allowed by CORS'));
    }
  },
  credentials: true,
});
