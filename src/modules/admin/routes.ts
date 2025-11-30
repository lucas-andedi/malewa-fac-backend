import { Router, Request, Response } from 'express';
import { prisma } from '../../db/prisma';
import { rbac } from '../../middlewares/rbac';
import { asyncHandler } from '../../utils/http';
import { notify } from '../../utils/notify';

export const adminRouter = Router();

// GET /api/v1/admin/users?status=pending|active|suspended
adminRouter.get('/users', rbac(['admin','superadmin']), asyncHandler(async (req: Request, res: Response) => {
  const status = (req.query as any).status as 'pending'|'active'|'suspended'|undefined;
  const role = (req.query as any).role as string|undefined;
  const where: any = {};
  if (status) where.status = status;
  if (role) where.role = role;
  const users = await prisma.user.findMany({ where, orderBy: { id: 'desc' } });
  res.json(users);
}));

// POST /api/v1/admin/users (superadmin only) - Create Admin/Dispatcher
adminRouter.post('/users', rbac(['superadmin']), asyncHandler(async (req: Request, res: Response) => {
    const { name, phone, password, role } = req.body;
    if (!['admin', 'dispatcher'].includes(role)) return res.status(400).json({ error: { message: 'Invalid role' } });
    
    const exists = await prisma.user.findUnique({ where: { phone } });
    if (exists) return res.status(400).json({ error: { message: 'Phone already in use' } });

    const passwordHash = await import('bcryptjs').then(b => b.hash(password, 10));
    const user = await prisma.user.create({
        data: {
            name,
            phone,
            passwordHash,
            role,
            status: 'active'
        }
    });
    res.status(201).json(user);
}));

// PATCH /api/v1/admin/users/:id/status
adminRouter.patch('/users/:id/status', rbac(['admin','superadmin']), asyncHandler(async (req: Request, res: Response) => {
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

// PATCH /api/v1/admin/users/:id/role
adminRouter.patch('/users/:id/role', rbac(['superadmin']), asyncHandler(async (req: Request, res: Response) => {
  const id = Number(req.params.id);
  const { role } = req.body;
  const allowedRoles = ['client', 'merchant', 'courier', 'admin', 'superadmin', 'dispatcher'];
  
  if (isNaN(id) || !allowedRoles.includes(role)) {
    return res.status(400).json({ error: { message: 'Invalid role' } });
  }

  const updated = await prisma.user.update({ 
    where: { id }, 
    data: { role: role as any } 
  });
  
  res.json(updated);
}));

// DELETE /api/v1/admin/users/:id
adminRouter.delete('/users/:id', rbac(['admin','superadmin']), asyncHandler(async (req: Request, res: Response) => {
  const id = Number(req.params.id);
  if (isNaN(id)) return res.status(400).json({ error: { message: 'Invalid user id' } });
  await prisma.user.delete({ where: { id } });
  res.json({ ok: true });
}));

// GET /api/v1/admin/stats
adminRouter.get('/stats', rbac(['admin','superadmin','dispatcher']), asyncHandler(async (_req: Request, res: Response) => {
  const [totalOrders, revenueAgg, commissionAgg, newUsers, recentTx] = await Promise.all([
    prisma.order.count(),
    prisma.order.aggregate({ _sum: { total: true } }),
    prisma.transaction.aggregate({ _sum: { commission: true } }),
    prisma.user.count({ where: { status: 'pending' } }),
    prisma.transaction.findMany({ take: 5, orderBy: { createdAt: 'desc' } })
  ]);

  res.json({
    totalOrders,
    revenueTotal: revenueAgg._sum.total || 0,
    commission: commissionAgg._sum.commission || 0,
    newUsers,
    recentTransactions: recentTx
  });
}));

// GET /api/v1/admin/orders
adminRouter.get('/orders', rbac(['admin','superadmin','dispatcher']), asyncHandler(async (req: Request, res: Response) => {
  const status = (req.query as any).status;
  const where: any = {};
  if (status && status !== 'all') where.status = status;
  
  const list = await prisma.order.findMany({ 
    where, 
    orderBy: { createdAt: 'desc' },
    include: { 
      customer: { select: { name: true, email: true, phone: true } },
      restaurant: { select: { name: true } },
      items: true // Include items
    }
  });
  res.json(list);
}));

// GET /api/v1/admin/transactions
adminRouter.get('/transactions', rbac(['admin','superadmin']), asyncHandler(async (req: Request, res: Response) => {
  const status = (req.query as any).status as 'pending'|'paid'|undefined;
  const where: any = {};
  if (status) where.status = status;
  const list = await prisma.transaction.findMany({ where, orderBy: { id: 'desc' } });
  res.json(list);
}));

// GET /api/v1/admin/restaurants
adminRouter.get('/restaurants', rbac(['admin','superadmin']), asyncHandler(async (req: Request, res: Response) => {
  const status = (req.query as any).status;
  const where: any = {};
  if (status && status !== 'all') where.status = status;
  const list = await prisma.restaurant.findMany({ where, orderBy: { createdAt: 'desc' } });
  res.json(list);
}));

// PATCH /api/v1/admin/restaurants/:id/status
adminRouter.patch('/restaurants/:id/status', rbac(['admin','superadmin']), asyncHandler(async (req: Request, res: Response) => {
  const id = Number(req.params.id);
  const { status, reason } = req.body;
  
  if (isNaN(id) || !['pending','active','rejected','suspended'].includes(status)) {
    return res.status(400).json({ error: { message: 'Invalid payload' } });
  }

  const resto = await prisma.restaurant.findUnique({ where: { id } });
  if (!resto) return res.status(404).json({ error: { message: 'Restaurant not found' } });
  
  const updated = await prisma.restaurant.update({ 
    where: { id }, 
    data: { 
      status,
      rejectionReason: status === 'rejected' ? reason : null // Clear reason if not rejected
    } 
  });
  
  // Notify owner
  if (updated.ownerUserId) {
     try {
        let msg = `Votre restaurant est ${status}.`;
        if (status === 'active') msg = 'Votre restaurant est validé et visible.';
        if (status === 'rejected' && reason) msg += ` Raison: ${reason}`;
        
        await notify(updated.ownerUserId, {
           type: 'restaurant.status',
           title: `Statut restaurant: ${status}`,
           message: msg
        });
     } catch {}
  }
  res.json(updated);
}));
