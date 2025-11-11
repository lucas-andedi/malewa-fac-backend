import { Router, Request, Response } from 'express';
import { prisma } from '../../db/prisma';
import { asyncHandler } from '../../utils/http';
import { rbac } from '../../middlewares/rbac';

export const restaurantsRouter = Router();

// GET /api/v1/restaurants?institutionCode=unikin
restaurantsRouter.get('/', asyncHandler(async (req: Request, res: Response) => {
  const { institutionCode } = req.query as { institutionCode?: string };

  let where: any = {};
  if (institutionCode) {
    const inst = await prisma.institution.findUnique({ where: { code: institutionCode } });
    if (inst) where.institutionId = inst.id; else return res.json([]);
  }

  const list = await prisma.restaurant.findMany({
    where: {
      ...where,
      OR: [
        { ownerUserId: null },
        { owner: { status: 'active' } }
      ]
    },
    orderBy: { name: 'asc' }
  });
  res.json(list);
}))
;

// GET /api/v1/restaurants/:id
restaurantsRouter.get('/:id', asyncHandler(async (req: Request, res: Response) => {
  const id = Number(req.params.id);
  if (isNaN(id)) return res.status(400).json({ error: { message: 'Invalid restaurant id' } });
  const resto = await prisma.restaurant.findUnique({ where: { id } });
  if (!resto) return res.status(404).json({ error: { message: 'Restaurant not found' } });
  res.json(resto);
}));

// GET /api/v1/restaurants/:id/orders (merchant/admin)
restaurantsRouter.get('/:id/orders', rbac(['merchant','admin']), asyncHandler(async (req: Request, res: Response) => {
  const id = Number(req.params.id);
  if (isNaN(id)) return res.status(400).json({ error: { message: 'Invalid restaurant id' } });
  const user = (req as any).user as { id: number; role: string };
  if (user.role === 'merchant') {
    const resto = await prisma.restaurant.findUnique({ where: { id } });
    if (!resto) return res.status(404).json({ error: { message: 'Restaurant not found' } });
    if (resto.ownerUserId && resto.ownerUserId !== user.id) return res.status(403).json({ error: { message: 'Forbidden' } });
  }
  const orders = await prisma.order.findMany({
    where: { restaurantId: id },
    orderBy: { createdAt: 'desc' },
    include: { items: true }
  });
  res.json(orders);
}));

// POST /api/v1/restaurants/:id/dishes (merchant/admin)
restaurantsRouter.post('/:id/dishes', rbac(['merchant','admin']), asyncHandler(async (req: Request, res: Response) => {
  const id = Number(req.params.id);
  if (isNaN(id)) return res.status(400).json({ error: { message: 'Invalid restaurant id' } });
  const { name, description, price, available, photoUrl } = req.body as { name: string; description?: string; price: number; available?: boolean; photoUrl?: string };
  if (!name || typeof price !== 'number') return res.status(400).json({ error: { message: 'name and price required' } });
  const resto = await prisma.restaurant.findUnique({ where: { id } });
  if (!resto) return res.status(404).json({ error: { message: 'Restaurant not found' } });
  const user = (req as any).user as { id: number; role: string };
  if (user.role === 'merchant' && resto.ownerUserId && resto.ownerUserId !== user.id) return res.status(403).json({ error: { message: 'Forbidden' } });
  const created = await prisma.dish.create({ data: { restaurantId: id, name, description: description || 'Nouveau plat', price, available: available ?? true, photoUrl } });
  res.status(201).json(created);
}));

// GET /api/v1/restaurants/:id/dishes
restaurantsRouter.get('/:id/dishes', asyncHandler(async (req: Request, res: Response) => {
  const id = Number(req.params.id);
  if (isNaN(id)) return res.status(400).json({ error: { message: 'Invalid restaurant id' } });
  const all = String((req.query as any).all || '').toLowerCase() === 'true';
  if (all) {
    const user = (req as any).user as { id: number; role: string } | undefined;
    if (!user || (user.role !== 'merchant' && user.role !== 'admin')) {
      return res.status(403).json({ error: { message: 'Forbidden' } });
    }
    if (user.role === 'merchant') {
      const resto = await prisma.restaurant.findUnique({ where: { id } });
      if (!resto) return res.status(404).json({ error: { message: 'Restaurant not found' } });
      if (resto.ownerUserId && resto.ownerUserId !== user.id) return res.status(403).json({ error: { message: 'Forbidden' } });
    }
    const allDishes = await prisma.dish.findMany({ where: { restaurantId: id }, orderBy: { name: 'asc' } });
    return res.json(allDishes);
  }
  const available = await prisma.dish.findMany({ where: { restaurantId: id, available: true }, orderBy: { name: 'asc' } });
  res.json(available);
}));

