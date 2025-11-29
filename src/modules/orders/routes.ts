import { Router, Request, Response } from 'express';
import { asyncHandler } from '../../utils/http';
import { validate } from '../../middlewares/validate';
import { CreateOrderSchema } from './dto';
import { createOrder } from './service';
import { prisma } from '../../db/prisma';
import { rbac } from '../../middlewares/rbac';
import { notify } from '../../utils/notify';
import { mokoService } from '../../utils/moko';
import { logger } from '../../config/logger';

export const ordersRouter = Router();


ordersRouter.post('/', validate(CreateOrderSchema), asyncHandler(async (req: Request, res: Response) => {
  const order = await createOrder(req.body as any);
  res.status(201).json(order);
}));

// GET /api/v1/orders/me (auth required)
ordersRouter.get('/me', rbac(['client','merchant','courier','admin']), asyncHandler(async (req: Request, res: Response) => {
  const user = (req as any).user as { id: number; role: string };
  const orders = await prisma.order.findMany({
    where: { customerUserId: user.id },
    orderBy: { createdAt: 'desc' },
    include: { items: true, payments: { orderBy: { id: 'desc' } } }
  });
  res.json(orders);
}));

// GET /api/v1/orders/:id (auth required)
ordersRouter.get('/:id', rbac(['client','merchant','courier','admin']), asyncHandler(async (req: Request, res: Response) => {
  const id = Number(req.params.id);
  if (isNaN(id)) return res.status(400).json({ error: { message: 'Invalid order id' } });
  const order = await prisma.order.findUnique({ where: { id }, include: { items: true } });
  if (!order) return res.status(404).json({ error: { message: 'Order not found' } });
  res.json(order);
}));

// PATCH /api/v1/orders/:id/status (merchant/admin)
ordersRouter.patch('/:id/status', rbac(['merchant','admin']), asyncHandler(async (req: Request, res: Response) => {
  const id = Number(req.params.id);
  const { status } = req.body as { status: 'received'|'preparing'|'ready'|'delivering'|'delivered'|'rejected' };
  if (isNaN(id) || !status) return res.status(400).json({ error: { message: 'Invalid payload' } });
  const order = await prisma.order.findUnique({ where: { id } });
  if (!order) return res.status(404).json({ error: { message: 'Order not found' } });
  const allowed: Record<string, string[]> = {
    received: ['preparing','rejected'],
    preparing: ['ready','rejected'],
    ready: ['delivering'],
    delivering: ['delivered'],
    delivered: [],
    rejected: []
  };
  if (!allowed[order.status].includes(status)) return res.status(400).json({ error: { message: 'Invalid status transition' } });
  const updated = await prisma.order.update({ where: { id }, data: { status }, include: { items: true } });
  // Notifications
  try {
    const labels: Record<string, string> = {
      received: 'Reçue', preparing: 'En préparation', ready: 'Prête', delivering: 'En cours de livraison', delivered: 'Livrée', rejected: 'Rejetée'
    } as const as any;
    await notify(updated.customerUserId, {
      type: 'order.status',
      title: `Commande ${updated.code}: ${labels[status] || status}`,
      message: `Statut mis à jour: ${labels[status] || status}.`,
      data: { orderId: updated.id, code: updated.code, status }
    });
    const resto = await prisma.restaurant.findUnique({ where: { id: updated.restaurantId } });
    if (resto?.ownerUserId) {
      await notify(resto.ownerUserId, {
        type: 'order.status_restaurant',
        title: `Commande ${updated.code}: ${labels[status] || status}`,
        data: { orderId: updated.id, status }
      });
    }
  } catch {}
  res.json(updated);
}));

// POST /api/v1/orders/:id/assign-mission (merchant/admin)
ordersRouter.post('/:id/assign-mission', rbac(['merchant','admin']), asyncHandler(async (req: Request, res: Response) => {
  const id = Number(req.params.id);
  if (isNaN(id)) return res.status(400).json({ error: { message: 'Invalid order id' } });
  const order = await prisma.order.findUnique({ where: { id } });
  if (!order) return res.status(404).json({ error: { message: 'Order not found' } });
  if (order.status !== 'ready') return res.status(400).json({ error: { message: 'Order must be ready to assign mission' } });
  const resto = await prisma.restaurant.findUnique({ where: { id: order.restaurantId } });
  if (!resto) return res.status(400).json({ error: { message: 'Restaurant missing' } });
  const existing = await prisma.deliveryMission.findFirst({ where: { orderId: order.id } });
  if (existing) return res.json(existing);
  const mission = await prisma.deliveryMission.create({
    data: {
      orderId: order.id,
      restaurantId: resto.id,
      restaurantLocation: `${resto.name}`,
      customerLocation: order.address || 'A récupérer',
      customerPhone: '+243 000 000 000',
      status: 'available',
      earning: 2000
    }
  });
  res.status(201).json(mission);
  // Notify customer that a mission has been created (pickup started soon)
  try {
    const orderFull = await prisma.order.findUnique({ where: { id: order.id } });
    if (orderFull) {
      await notify(orderFull.customerUserId, {
        type: 'mission.created',
        title: `Livraison en préparation`,
        message: `Un coursier va récupérer votre commande ${orderFull.code}.`,
        data: { orderId: orderFull.id }
      });
    }
  } catch {}
}));
