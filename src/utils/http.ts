import { Request, Response, NextFunction } from 'express';

export class AppError extends Error {
  constructor(public message: string, public statusCode: number = 500) {
    super(message);
    this.name = 'AppError';
  }
}

export function asyncHandler<T extends (req: Request, res: Response, next: NextFunction) => Promise<any>>(fn: T) {
  return (req: Request, res: Response, next: NextFunction) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
}
