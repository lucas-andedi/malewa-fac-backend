import { Router, Request, Response } from 'express';
import { prisma } from '../../db/prisma';
import { asyncHandler } from '../../utils/http';
import { rbac } from '../../middlewares/rbac';

export const transactionsRouter = Router();

// GET /api/v1/transactions?beneficiary=merchant|courier&status=pending|paid
transactionsRouter.get('/', rbac(['client','merchant','courier','admin']), asyncHandler(async (req: Request, res: Response) => {
  const user = (req as any).user as { id: number; role: 'client'|'merchant'|'courier'|'admin' };
  const beneficiary = (req.query as any).beneficiary as 'merchant'|'courier'|undefined;
  const status = (req.query as any).status as 'pending'|'paid'|undefined;

  const whereBase: any = { };
  if (beneficiary) whereBase.beneficiary = beneficiary;
  if (status) whereBase.status = status;

  let where: any = { ...whereBase };

  if (user.role === 'courier') {
    // Only courier's transactions via mission ownership
    where = {
      ...whereBase,
      beneficiary: 'courier',
      order: { missions: { some: { courierUserId: user.id } } }
    };
  } else if (user.role === 'merchant') {
    // Only merchant's transactions via restaurant ownership
    where = {
      ...whereBase,
      beneficiary: 'merchant',
      order: { restaurant: { ownerUserId: user.id } }
    };
  }

  const list = await prisma.transaction.findMany({ where, orderBy: { id: 'desc' } });
  res.json(list);
}));

// PATCH /api/v1/transactions/:id/mark-paid (admin)
transactionsRouter.patch('/:id/mark-paid', rbac(['admin']), asyncHandler(async (req: Request, res: Response) => {
  const id = Number(req.params.id);
  if (isNaN(id)) return res.status(400).json({ error: { message: 'Invalid transaction id' } });
  const trx = await prisma.transaction.findUnique({ where: { id } });
  if (!trx) return res.status(404).json({ error: { message: 'Transaction not found' } });
  const updated = await prisma.transaction.update({ where: { id }, data: { status: 'paid' } });
  res.json(updated);
}));
