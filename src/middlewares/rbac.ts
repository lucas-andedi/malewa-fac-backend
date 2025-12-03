import { Request, Response, NextFunction } from 'express';
import { UserRole } from '@prisma/client';

export function rbac(roles: UserRole[]) {
  return (req: Request, res: Response, next: NextFunction) => {
    const user = (req as any).user as { id: number; role: UserRole } | undefined;
    if (!user) return res.status(401).json({ error: { message: 'Unauthorized' } });
    if (!roles.includes(user.role)) return res.status(403).json({ error: { message: 'Forbidden' } });
    next();
  };
}
