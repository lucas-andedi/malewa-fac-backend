import { NextFunction, Request, Response } from 'express';
import { logger } from '../config/logger';

export function errorHandler(err: any, _req: Request, res: Response, _next: NextFunction) {
  const status = err.status || 500;
  const message = err.message || 'Internal Server Error';
  if (status >= 500) {
    logger.error({ err }, message);
  } else {
    logger.warn({ err }, message);
  }
  res.status(status).json({ error: { message, status } });
}
