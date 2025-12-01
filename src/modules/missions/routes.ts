import { Router, Request, Response } from 'express';
import { prisma } from '../../db/prisma';
import { Prisma } from '@prisma/client';
import { asyncHandler } from '../../utils/http';
import { rbac } from '../../middlewares/rbac';
import { ensureMerchantAndCourierTransactions } from '../../utils/finance';
import { notify } from '../../utils/notify';
import { smsService } from '../../utils/sms';

export const missionsRouter = Router();

/**
 * @swagger
 * /api/v1/missions:
 *   get:
 *     summary: List delivery missions
 *     tags: [Missions]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: status
 *         schema:
 *           type: string
 *           enum: [available, active, delivered]
 *     responses:
 *       200:
 *         description: List of missions
 */
missionsRouter.get('/', rbac(['courier','admin']), asyncHandler(async (req: Request, res: Response) => {
  const user = (req as any).user as { id: number; role: string };
  const status = String((req.query as any).status || 'available');

  let where: any = {};
  if (user.role === 'courier') {
    if (status === 'available') where = { status: 'available' };
    else if (status === 'active') where = { courierUserId: user.id, status: { in: ['accepted','picked','enroute'] } };
    else if (status === 'delivered') where = { courierUserId: user.id, status: 'delivered' };
  }

  const list = await prisma.deliveryMission.findMany({ 
    where, 
    orderBy: { id: 'desc' },
    include: {
      restaurant: { select: { name: true, address: true } },
      order: { select: { code: true, customerName: true, items: true, total: true } }
    }
  });
  
  // Map to DTO
  const response = list.map(m => ({
    ...m,
    restaurantName: m.restaurant.name,
    restaurantAddress: m.restaurant.address || m.restaurantLocation,
    orderCode: m.order.code,
    customerName: m.order.customerName,
    orderTotal: m.order.total,
    items: m.order.items,
    restaurant: undefined,
    order: undefined
  }));

  res.json(response);
}));

/**
 * @swagger
 * /api/v1/missions/{id}/accept:
 *   post:
 *     summary: Accept a mission (courier)
 *     tags: [Missions]
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
 *         description: Mission accepted
 */
missionsRouter.post('/:id/accept', rbac(['courier']), asyncHandler(async (req: Request, res: Response) => {
  const user = (req as any).user as { id: number };
  const id = Number(req.params.id);
  const mission = await prisma.deliveryMission.findUnique({ where: { id } });
  if (!mission) return res.status(404).json({ error: { message: 'Mission not found' } });
  if (mission.status !== 'available') return res.status(400).json({ error: { message: 'Mission not available' } });
  
  const updated = await prisma.deliveryMission.update({ 
    where: { id }, 
    data: { status: 'accepted', courierUserId: user.id },
    include: {
      restaurant: { select: { name: true, address: true } },
      order: { select: { code: true, customerName: true, items: true, total: true } }
    }
  });

  const response = {
    ...updated,
    restaurantName: updated.restaurant.name,
    restaurantAddress: updated.restaurant.address || updated.restaurantLocation,
    orderCode: updated.order.code,
    customerName: updated.order.customerName,
    orderTotal: updated.order.total,
    items: updated.order.items,
    restaurant: undefined,
    order: undefined
  };
  res.json(response);
  
  // Notify customer and restaurant owner
  try {
    const order = await prisma.order.findUnique({ where: { id: mission.orderId } });
    const resto = await prisma.restaurant.findUnique({ where: { id: mission.restaurantId } });
    if (order) {
      await notify(order.customerUserId, {
        type: 'mission.accepted',
        title: 'Coursier assigné',
        message: 'Un coursier a accepté votre livraison.',
        data: { orderId: order.id }
      });
    }
    if (resto?.ownerUserId) {
      await notify(resto.ownerUserId, {
        type: 'mission.accepted_restaurant',
        title: 'Coursier assigné à la commande',
        data: { orderId: mission.orderId }
      });
    }
  } catch {}
}))
/**
 * @swagger
 * /api/v1/missions/{id}/status:
 *   patch:
 *     summary: Update mission status
 *     tags: [Missions]
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
 *                 enum: [picked, enroute, delivered]
 *     responses:
 *       200:
 *         description: Status updated
 */
missionsRouter.patch('/:id/status', rbac(['courier']), asyncHandler(async (req: Request, res: Response) => {
  const user = (req as any).user as { id: number };
  const id = Number(req.params.id);
  const { status } = req.body as { status: 'picked'|'enroute'|'delivered' };
  if (isNaN(id) || !status) return res.status(400).json({ error: { message: 'Invalid payload' } });
  const existing = await prisma.deliveryMission.findUnique({ where: { id } });
  if (!existing) return res.status(404).json({ error: { message: 'Mission not found' } });
  if (existing.courierUserId !== user.id) return res.status(403).json({ error: { message: 'Forbidden' } });

  const allowed: Record<string, string[]> = {
    available: ['accepted'],
    accepted: ['picked'],
    picked: ['enroute'],
    enroute: ['delivered'],
    delivered: []
  };
  if (!allowed[existing.status].includes(status)) return res.status(400).json({ error: { message: 'Invalid status transition' } });

  const updated = await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
    const m = await tx.deliveryMission.update({ where: { id }, data: { status } });
    if (status === 'delivered') {
      await tx.order.update({ where: { id: existing.orderId }, data: { status: 'delivered' } });
    }
    return m;
  });

  if (status === 'delivered') {
    // ensure transactions exist
    await ensureMerchantAndCourierTransactions(existing.orderId);
  }

  res.json(updated);
  // Notify customer on status progression
  try {
    const order = await prisma.order.findUnique({ where: { id: existing.orderId } });
    const resto = await prisma.restaurant.findUnique({ where: { id: existing.restaurantId } });
    const labels: Record<string, string> = { picked: 'Commande récupérée', enroute: 'Commande en route', delivered: 'Commande livrée' } as any;
    if (order) {
      await notify(order.customerUserId, {
        type: `mission.${status}`,
        title: labels[status] || `Mise à jour: ${status}`,
        data: { orderId: order.id, missionId: updated.id }
      });
      
      // SMS to Customer on Delivered
      if (status === 'delivered') {
         const customer = await prisma.user.findUnique({ where: { id: order.customerUserId } });
         if (customer?.phone) {
             await smsService.sendSms(customer.phone, `Malewa-Fac: Votre commande ${order.code} a été livrée par le coursier. Merci!`);
         }
      }
    }
    if (status === 'delivered' && resto?.ownerUserId) {
      await notify(resto.ownerUserId, {
        type: 'order.delivered',
        title: 'Commande livrée',
        data: { orderId: existing.orderId }
      });
    }
  } catch {}
}))
