import { Router, Request, Response } from 'express';
import { prisma } from '../../db/prisma';
import { asyncHandler } from '../../utils/http';
import { rbac } from '../../middlewares/rbac';

export const dishesRouter = Router();

// PATCH /api/v1/dishes/:id (merchant/admin)
dishesRouter.patch('/:id', rbac(['merchant','admin']), asyncHandler(async (req: Request, res: Response) => {
  const id = Number(req.params.id);
  if (isNaN(id)) return res.status(400).json({ error: { message: 'Invalid dish id' } });
  const dish = await prisma.dish.findUnique({ where: { id }, include: { restaurant: true } });
  if (!dish) return res.status(404).json({ error: { message: 'Dish not found' } });
  const user = (req as any).user as { id: number; role: string };
  if (user.role === 'merchant' && dish.restaurant.ownerUserId && dish.restaurant.ownerUserId !== user.id) return res.status(403).json({ error: { message: 'Forbidden' } });

  const { name, description, price, available, photoUrl } = req.body as { name?: string; description?: string; price?: number; available?: boolean; photoUrl?: string };
  const updated = await prisma.dish.update({ where: { id }, data: { name, description, price, available, photoUrl } });
  res.json(updated);
}));

// DELETE /api/v1/dishes/:id (merchant/admin)
dishesRouter.delete('/:id', rbac(['merchant','admin']), asyncHandler(async (req: Request, res: Response) => {
  const id = Number(req.params.id);
  if (isNaN(id)) return res.status(400).json({ error: { message: 'Invalid dish id' } });
  const dish = await prisma.dish.findUnique({ where: { id }, include: { restaurant: true } });
  if (!dish) return res.status(404).json({ error: { message: 'Dish not found' } });
  const user = (req as any).user as { id: number; role: string };
  if (user.role === 'merchant' && dish.restaurant.ownerUserId && dish.restaurant.ownerUserId !== user.id) return res.status(403).json({ error: { message: 'Forbidden' } });
  await prisma.dish.delete({ where: { id } });
  res.json({ ok: true });
}));
