import { Router, Request, Response } from 'express';
import { prisma } from '../../db/prisma';
import { asyncHandler } from '../../utils/http';
import { rbac } from '../../middlewares/rbac';

export const notificationsRouter = Router();

// GET /api/v1/notifications?unreadOnly=true&limit=20
notificationsRouter.get('/', rbac(['client','merchant','courier','admin']), asyncHandler(async (req: Request, res: Response) => {
  const user = (req as any).user as { id: number };
  const unreadOnly = String((req.query as any).unreadOnly || 'false').toLowerCase() === 'true';
  const limit = Math.max(1, Math.min(100, Number((req.query as any).limit) || 20));
  const where: any = { userId: user.id };
  if (unreadOnly) where.readAt = null;
  const list = await prisma.notification.findMany({ where, orderBy: { createdAt: 'desc' }, take: limit });
  res.json(list);
}));

// PATCH /api/v1/notifications/:id/read
notificationsRouter.patch('/:id/read', rbac(['client','merchant','courier','admin']), asyncHandler(async (req: Request, res: Response) => {
  const user = (req as any).user as { id: number };
  const id = Number(req.params.id);
  if (isNaN(id)) return res.status(400).json({ error: { message: 'invalid id' } });
  const updated = await prisma.notification.updateMany({ where: { id, userId: user.id, readAt: null }, data: { readAt: new Date() } });
  res.json({ ok: true, updated: updated.count });
}));

// PATCH /api/v1/notifications/read-all
notificationsRouter.patch('/read-all', rbac(['client','merchant','courier','admin']), asyncHandler(async (req: Request, res: Response) => {
  const user = (req as any).user as { id: number };
  const updated = await prisma.notification.updateMany({ where: { userId: user.id, readAt: null }, data: { readAt: new Date() } });
  res.json({ ok: true, updated: updated.count });
}));
