import { Request, Response, NextFunction } from 'express';

export function rbac(roles: Array<'client'|'merchant'|'courier'|'admin'>) {
  return (req: Request, res: Response, next: NextFunction) => {
    const user = (req as any).user as { id: number; role: string } | undefined;
    if (!user) return res.status(401).json({ error: { message: 'Unauthorized' } });
    if (!roles.includes(user.role as any)) return res.status(403).json({ error: { message: 'Forbidden' } });
    next();
  };
}
