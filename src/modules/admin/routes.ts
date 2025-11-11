import { Router, Request, Response } from 'express';
import { prisma } from '../../db/prisma';
import { rbac } from '../../middlewares/rbac';
import { asyncHandler } from '../../utils/http';
import { notify } from '../../utils/notify';

export const adminRouter = Router();

// GET /api/v1/admin/users?status=pending|active|suspended
adminRouter.get('/users', rbac(['admin']), asyncHandler(async (req: Request, res: Response) => {
  const status = (req.query as any).status as 'pending'|'active'|'suspended'|undefined;
  const where: any = {};
  if (status) where.status = status;
  const users = await prisma.user.findMany({ where, orderBy: { id: 'desc' } });
  res.json(users);
}));

// PATCH /api/v1/admin/users/:id/status
adminRouter.patch('/users/:id/status', rbac(['admin']), asyncHandler(async (req: Request, res: Response) => {
  const id = Number(req.params.id);
  const { status } = req.body as { status: 'pending'|'active'|'suspended' };
  if (isNaN(id) || !status) return res.status(400).json({ error: { message: 'Invalid payload' } });
  const user = await prisma.user.findUnique({ where: { id } });
  if (!user) return res.status(404).json({ error: { message: 'User not found' } });
  const updated = await prisma.user.update({ where: { id }, data: { status } });
  // Notify user about status change (best-effort)
  try {
    await notify(updated.id, {
      type: 'user.status',
      title: `Votre statut a été mis à jour: ${status}`,
      message: status === 'active' ? 'Votre compte est approuvé et actif.' : status === 'suspended' ? 'Votre compte a été suspendu.' : 'Votre compte est en attente.'
    });
  } catch {}
  res.json(updated);
}));

// DELETE /api/v1/admin/users/:id
adminRouter.delete('/users/:id', rbac(['admin']), asyncHandler(async (req: Request, res: Response) => {
  const id = Number(req.params.id);
  if (isNaN(id)) return res.status(400).json({ error: { message: 'Invalid user id' } });
  await prisma.user.delete({ where: { id } });
  res.json({ ok: true });
}));

// GET /api/v1/admin/stats
adminRouter.get('/stats', rbac(['admin']), asyncHandler(async (_req: Request, res: Response) => {
  const [totalOrders, revenueAgg, commissionAgg, newUsers] = await Promise.all([
    prisma.order.count(),
    prisma.order.aggregate({ _sum: { total: true } }),
    prisma.transaction.aggregate({ _sum: { commission: true } }),
    prisma.user.count({ where: { status: 'pending' } })
  ]);

  res.json({
    totalOrders,
    revenueTotal: revenueAgg._sum.total || 0,
    commission: commissionAgg._sum.commission || 0,
    newUsers
  });
}));

// GET /api/v1/admin/transactions
adminRouter.get('/transactions', rbac(['admin']), asyncHandler(async (req: Request, res: Response) => {
  const status = (req.query as any).status as 'pending'|'paid'|undefined;
  const where: any = {};
  if (status) where.status = status;
  const list = await prisma.transaction.findMany({ where, orderBy: { id: 'desc' } });
  res.json(list);
}));
