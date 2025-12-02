import { Router, Request, Response } from 'express';
import { prisma } from '../../db/prisma';
import { rbac } from '../../middlewares/rbac';
import { asyncHandler } from '../../utils/http';
import { notify } from '../../utils/notify';

export const adminRouter = Router();

/**
 * @swagger
 * /api/v1/admin/users:
 *   get:
 *     summary: List users
 *     tags: [Admin]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: status
 *         schema:
 *           type: string
 *           enum: [pending, active, suspended]
 *       - in: query
 *         name: role
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: List of users
 */
adminRouter.get('/users', rbac(['admin','superadmin']), asyncHandler(async (req: Request, res: Response) => {
  const status = (req.query as any).status as 'pending'|'active'|'suspended'|undefined;
  const role = (req.query as any).role as string|undefined;
  const where: any = {};
  if (status) where.status = status;
  if (role) where.role = role;
  
  const users = await prisma.user.findMany({ 
    where, 
    orderBy: { id: 'desc' },
    include: {
      managedRestaurants: { select: { id: true, name: true } }
    }
  });
  res.json(users);
}));

/**
 * @swagger
 * /api/v1/admin/users:
 *   post:
 *     summary: Create Admin/Dispatcher (Superadmin only)
 *     tags: [Admin]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [name, phone, password, role]
 *             properties:
 *               name:
 *                 type: string
 *               phone:
 *                 type: string
 *               password:
 *                 type: string
 *               role:
 *                 type: string
 *                 enum: [admin, dispatcher, agent]
 *     responses:
 *       200:
 *         description: User updated
 */
adminRouter.post('/users', rbac(['superadmin']), asyncHandler(async (req: Request, res: Response) => {
    const { name, phone, password, role } = req.body;
    if (!['admin', 'dispatcher', 'agent'].includes(role)) return res.status(400).json({ error: { message: 'Invalid role' } });
    
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

/**
 * @swagger
 * /api/v1/admin/users/{id}/status:
 *   patch:
 *     summary: Update user status
 *     tags: [Admin]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [status]
 *             properties:
 *               status:
 *                 type: string
 *                 enum: [pending, active, suspended]
 *     responses:
 *       200:
 *         description: User updated
 */
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

/**
 * @swagger
 * /api/v1/admin/users/{id}/role:
 *   patch:
 *     summary: Update user role (Superadmin only)
 *     tags: [Admin]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [role]
 *             properties:
 *               role:
 *                 type: string
 *                 enum: [client, merchant, courier, admin, superadmin, dispatcher]
 *     responses:
 *       200:
 *         description: Role updated
 */
adminRouter.patch('/users/:id/role', rbac(['superadmin']), asyncHandler(async (req: Request, res: Response) => {
  const id = Number(req.params.id);
  const { role } = req.body;
  const allowedRoles = ['client', 'merchant', 'courier', 'admin', 'superadmin', 'dispatcher', 'agent'];
  
  if (isNaN(id) || !allowedRoles.includes(role)) {
    return res.status(400).json({ error: { message: 'Invalid role' } });
  }

  const updated = await prisma.user.update({ 
    where: { id }, 
    data: { role: role as any } 
  });
  
  res.json(updated);
}));

/**
 * @swagger
 * /api/v1/admin/users/{id}:
 *   delete:
 *     summary: Delete user
 *     tags: [Admin]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *     responses:
 *       200:
 *         description: User deleted
 */
adminRouter.delete('/users/:id', rbac(['admin','superadmin']), asyncHandler(async (req: Request, res: Response) => {
  const id = Number(req.params.id);
  if (isNaN(id)) return res.status(400).json({ error: { message: 'Invalid user id' } });
  await prisma.user.delete({ where: { id } });
  res.json({ ok: true });
}));

/**
 * @swagger
 * /api/v1/admin/stats:
 *   get:
 *     summary: Get admin dashboard stats
 *     tags: [Admin]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Stats object
 */
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

/**
 * @swagger
 * /api/v1/admin/agents/{id}/restaurants:
 *   put:
 *     summary: Assign restaurants to agent
 *     tags: [Admin]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [restaurantIds]
 *             properties:
 *               restaurantIds:
 *                 type: array
 *                 items:
 *                   type: integer
 *     responses:
 *       200:
 *         description: Restaurants assigned
 */
adminRouter.put('/agents/:id/restaurants', rbac(['superadmin']), asyncHandler(async (req: Request, res: Response) => {
  const id = Number(req.params.id);
  const { restaurantIds } = req.body;
  
  if (isNaN(id) || !Array.isArray(restaurantIds)) {
    return res.status(400).json({ error: { message: 'Invalid payload' } });
  }

  const user = await prisma.user.findUnique({ where: { id } });
  if (!user || user.role !== 'agent') {
    return res.status(400).json({ error: { message: 'User not found or not an agent' } });
  }

  const updated = await prisma.user.update({
    where: { id },
    data: {
      managedRestaurants: {
        set: restaurantIds.map((rid: number) => ({ id: rid }))
      }
    },
    include: { managedRestaurants: true }
  });

  res.json(updated);
}));

/**
 * @swagger
 * /api/v1/admin/orders:
 *   get:
 *     summary: List all orders
 *     tags: [Admin]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: status
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: List of orders
 */
adminRouter.get('/orders', rbac(['admin','superadmin','dispatcher','agent']), asyncHandler(async (req: Request, res: Response) => {
  const user = (req as any).user;
  const status = (req.query as any).status;
  const where: any = {};
  if (status && status !== 'all') where.status = status;
  
  // If agent, filter by managed restaurants
  if (user.role === 'agent') {
    const agent = await prisma.user.findUnique({ 
      where: { id: user.id },
      include: { managedRestaurants: { select: { id: true } } }
    });
    const managedIds = agent?.managedRestaurants.map(r => r.id) || [];
    where.restaurantId = { in: managedIds };
  }

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

/**
 * @swagger
 * /api/v1/admin/transactions:
 *   get:
 *     summary: List all transactions
 *     tags: [Admin]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: status
 *         schema:
 *           type: string
 *           enum: [pending, paid]
 *     responses:
 *       200:
 *         description: List of transactions
 */
adminRouter.get('/transactions', rbac(['admin','superadmin']), asyncHandler(async (req: Request, res: Response) => {
  const status = (req.query as any).status as 'pending'|'paid'|undefined;
  const where: any = {};
  if (status) where.status = status;
  const list = await prisma.transaction.findMany({ where, orderBy: { id: 'desc' } });
  res.json(list);
}));

/**
 * @swagger
 * /api/v1/admin/restaurants:
 *   get:
 *     summary: List all restaurants (admin view)
 *     tags: [Admin]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: status
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: List of restaurants
 */
adminRouter.get('/restaurants', rbac(['admin','superadmin']), asyncHandler(async (req: Request, res: Response) => {
  const status = (req.query as any).status;
  const where: any = {};
  if (status && status !== 'all') where.status = status;
  const list = await prisma.restaurant.findMany({ 
    where, 
    orderBy: { createdAt: 'desc' },
    include: { institutionLinks: { include: { institution: true } } }
  });
  const response = list.map(r => ({
    ...r,
    institutions: r.institutionLinks.map(l => l.institution),
    institutionLinks: undefined
  }));
  res.json(response);
}));

/**
 * @swagger
 * /api/v1/admin/restaurants/{id}/status:
 *   patch:
 *     summary: Update restaurant status
 *     tags: [Admin]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [status]
 *             properties:
 *               status:
 *                 type: string
 *                 enum: [pending, active, rejected, suspended]
 *               reason:
 *                 type: string
 *     responses:
 *       200:
 *         description: Restaurant updated
 */
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

/**
 * @swagger
 * /api/v1/admin/finance/merchants:
 *   get:
 *     summary: Get merchant financial stats
 *     tags: [Admin]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: from
 *         schema:
 *           type: string
 *           format: date
 *       - in: query
 *         name: to
 *         schema:
 *           type: string
 *           format: date
 *     responses:
 *       200:
 *         description: Financial stats
 */
adminRouter.get('/finance/merchants', rbac(['admin','superadmin']), asyncHandler(async (req: Request, res: Response) => {
  const { from, to } = req.query as { from?: string; to?: string };
  const where: any = { status: 'delivered' };
  if (from && to) {
    where.updatedAt = {
      gte: new Date(from),
      lte: new Date(to)
    };
  }

  const orders = await prisma.order.findMany({
    where,
    include: { restaurant: true }
  });

  const stats: Record<number, { 
      restaurantId: number; 
      name: string;
      totalSales: number; 
      totalServiceFee: number; 
      pickupFee: number; 
      deliveryFeeGenerated: number; 
  }> = {};

  for (const o of orders) {
      if (!stats[o.restaurantId]) {
          stats[o.restaurantId] = {
              restaurantId: o.restaurantId,
              name: o.restaurant.name,
              totalSales: 0,
              totalServiceFee: 0,
              pickupFee: 0,
              deliveryFeeGenerated: 0
          };
      }
      stats[o.restaurantId].totalSales += o.subtotal;
      stats[o.restaurantId].totalServiceFee += o.serviceFee;
      if (o.deliveryMethod === 'pickup') {
          stats[o.restaurantId].pickupFee += o.serviceFee;
      } else {
          stats[o.restaurantId].deliveryFeeGenerated += o.serviceFee;
      }
  }

  res.json(Object.values(stats));
}));
