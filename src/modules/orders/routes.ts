import { Router, Request, Response } from 'express';
import { asyncHandler } from '../../utils/http';
import { validate } from '../../middlewares/validate';
import { CreateOrderSchema } from './dto';
import { createOrder } from './service';
import { prisma } from '../../db/prisma';
import { rbac } from '../../middlewares/rbac';
import { notify } from '../../utils/notify';
import { mokoService } from '../../utils/moko';
import { smsService } from '../../utils/sms';
import { logger } from '../../config/logger';

export const ordersRouter = Router();


ordersRouter.post('/', validate(CreateOrderSchema), asyncHandler(async (req: Request, res: Response) => {
  const order = await createOrder(req.body as any);
  res.status(201).json(order);
}));

// GET /api/v1/orders/me (auth required)
ordersRouter.get('/me', rbac(['client','merchant','courier','admin','superadmin','dispatcher']), asyncHandler(async (req: Request, res: Response) => {
  const user = (req as any).user as { id: number; role: string };
  const orders = await prisma.order.findMany({
    where: { customerUserId: user.id },
    orderBy: { createdAt: 'desc' },
    include: { items: true, payments: { orderBy: { id: 'desc' } } }
  });
  res.json(orders);
}));

// GET /api/v1/orders/:id (auth required)
ordersRouter.get('/:id', rbac(['client','merchant','courier','admin','superadmin','dispatcher']), asyncHandler(async (req: Request, res: Response) => {
  const id = Number(req.params.id);
  if (isNaN(id)) return res.status(400).json({ error: { message: 'Invalid order id' } });
  const order = await prisma.order.findUnique({ where: { id }, include: { items: true } });
  if (!order) return res.status(404).json({ error: { message: 'Order not found' } });
  res.json(order);
}));

// POST /api/v1/orders/:id/confirm (dispatcher/admin/superadmin)
ordersRouter.post('/:id/confirm', rbac(['dispatcher','admin','superadmin']), asyncHandler(async (req: Request, res: Response) => {
  const id = Number(req.params.id);
  if (isNaN(id)) return res.status(400).json({ error: { message: 'Invalid order id' } });
  
  const order = await prisma.order.findUnique({ where: { id } });
  if (!order) return res.status(404).json({ error: { message: 'Order not found' } });
  
  if (order.status !== 'pending_confirmation') {
    return res.status(400).json({ error: { message: 'Order is not pending confirmation' } });
  }

  // Update status to received (visible to merchant)
  const updated = await prisma.order.update({ 
    where: { id }, 
    data: { status: 'received' },
    include: { items: true } 
  });

  // Notify Merchant (SMS & In-app)
  try {
    const resto = await prisma.restaurant.findUnique({ where: { id: updated.restaurantId } });
    if (resto?.ownerUserId) {
      // In-App
      await notify(resto.ownerUserId, {
        type: 'order.new_for_restaurant',
        title: `Nouvelle commande ${updated.code}`,
        message: `${updated.customerName} a passé une commande. Total: ${updated.total} FC.`,
        data: { orderId: updated.id }
      });

      // SMS: "New Order added"
      const owner = await prisma.user.findUnique({ where: { id: resto.ownerUserId } });
      if (owner?.phone) {
        await smsService.sendSms(owner.phone, `Malewa-Fac: Nouvelle commande ${updated.code} de ${updated.customerName}. Total: ${updated.total} FC. Connectez-vous pour accepter.`);
      }
    }
  } catch (e) {
    logger.error({ err: e }, 'Failed to notify merchant');
  }

  res.json(updated);
}));

// PATCH /api/v1/orders/:id/status (merchant/admin/dispatcher)
ordersRouter.patch('/:id/status', rbac(['merchant','admin','superadmin','dispatcher','courier']), asyncHandler(async (req: Request, res: Response) => {
  const id = Number(req.params.id);
  const { status } = req.body as { status: 'received'|'preparing'|'ready'|'delivering'|'delivered'|'rejected' };
  if (isNaN(id) || !status) return res.status(400).json({ error: { message: 'Invalid payload' } });
  
  const order = await prisma.order.findUnique({ where: { id } });
  if (!order) return res.status(404).json({ error: { message: 'Order not found' } });
  
  const allowed: Record<string, string[]> = {
    pending_confirmation: ['received', 'rejected'], // Dispatcher can reject too
    received: ['preparing','rejected'],
    preparing: ['ready','rejected'],
    ready: ['delivering'],
    delivering: ['delivered'],
    delivered: [],
    rejected: []
  };
  
  // Allow courier to set 'delivered' if they have the mission? (Simplified: just allow status transition if RBAC passes, logic could be stricter)
  // Note: Courier usually updates MISSION status which updates Order status. But let's keep this direct update for flexibility or sync.
  
  if (!allowed[order.status].includes(status)) return res.status(400).json({ error: { message: 'Invalid status transition' } });
  
  const updated = await prisma.order.update({ where: { id }, data: { status }, include: { items: true } });
  
  // Notifications
  try {
    const labels: Record<string, string> = {
      received: 'Reçue', preparing: 'En préparation', ready: 'Prête', delivering: 'En cours de livraison', delivered: 'Livrée', rejected: 'Rejetée'
    } as const as any;
    
    // Notify Customer
    await notify(updated.customerUserId, {
      type: 'order.status',
      title: `Commande ${updated.code}: ${labels[status] || status}`,
      message: `Statut mis à jour: ${labels[status] || status}.`,
      data: { orderId: updated.id, code: updated.code, status }
    });

    // SMS to Customer if Delivered
    if (status === 'delivered') {
        const customer = await prisma.user.findUnique({ where: { id: updated.customerUserId } });
        if (customer?.phone) {
            await smsService.sendSms(customer.phone, `Malewa-Fac: Votre commande ${updated.code} a été livrée. Merci et bon appétit !`);
        }
    }

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
ordersRouter.post('/:id/assign-mission', rbac(['merchant','admin','superadmin','dispatcher']), asyncHandler(async (req: Request, res: Response) => {
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
      customerPhone: '+243 000 000 000', // Should fetch real phone from user
      status: 'available',
      earning: 2000
    }
  });
  
  // Update Customer Phone in Mission if possible
  const customer = await prisma.user.findUnique({ where: { id: order.customerUserId } });
  if (customer?.phone) {
      await prisma.deliveryMission.update({ where: { id: mission.id }, data: { customerPhone: customer.phone } });
  }

  res.status(201).json(mission);
  
  // Notify customer
  try {
    await notify(order.customerUserId, {
      type: 'mission.created',
      title: `Livraison en préparation`,
      message: `Un coursier va récupérer votre commande ${order.code}.`,
      data: { orderId: order.id }
    });
    
    // SMS to Couriers "Available mission"
    // Notify all couriers? That might be too many SMS.
    // "Pour le livreur s’il y a une nouvelle course disponible."
    // Maybe notify only active couriers?
    // Let's fetch active couriers.
    // Warning: Costly if many couriers. But requirement says so.
    const couriers = await prisma.user.findMany({ where: { role: 'courier', status: 'active' } });
    for (const c of couriers) {
        if (c.phone) {
            // Maybe check if they are 'online'? We don't track online status perfectly yet, just 'active' account.
            // For now, send to all active couriers.
            // Limit to maybe 5 nearest? We don't have geo yet.
            // Let's send to first 5 to avoid spamming everyone? Or just send.
            await smsService.sendSms(c.phone, `Malewa-Fac: Nouvelle course disponible chez ${resto.name}. Gain: ${mission.earning} FC.`);
        }
    }

  } catch {}
}));
