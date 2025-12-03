import { Router, Request, Response } from 'express';
import { prisma } from '../../db/prisma';
import { asyncHandler } from '../../utils/http';
import { rbac } from '../../middlewares/rbac';
import { uploadMiddleware, uploadToSpaces } from '../../utils/upload';

export const dishesRouter = Router();

/**
 * @swagger
 * /api/v1/dishes/{id}:
 *   patch:
 *     summary: Update a dish
 *     tags: [Dishes]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *     requestBody:
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             properties:
 *               name:
 *                 type: string
 *               price:
 *                 type: number
 *               description:
 *                 type: string
 *               available:
 *                 type: boolean
 *               image:
 *                 type: string
 *                 format: binary
 *     responses:
 *       200:
 *         description: Dish updated
 */
dishesRouter.patch('/:id', rbac(['merchant','admin']), uploadMiddleware.single('image'), asyncHandler(async (req: Request, res: Response) => {
  const id = Number(req.params.id);
  if (isNaN(id)) return res.status(400).json({ error: { message: 'Invalid dish id' } });
  
  const dish = await prisma.dish.findUnique({ where: { id }, include: { restaurant: true } });
  if (!dish) return res.status(404).json({ error: { message: 'Dish not found' } });
  
  const user = (req as any).user as { id: number; role: string };
  if (user.role === 'merchant' && dish.restaurant.ownerUserId && dish.restaurant.ownerUserId !== user.id) return res.status(403).json({ error: { message: 'Forbidden' } });

  // Extract fields from body (multipart/form-data implies strings)
  const { name, description, available, categoryId } = req.body as { name?: string; description?: string; available?: string|boolean; categoryId?: string|number };
  
  let price: number | undefined;
  if (req.body.price) {
    price = Number(req.body.price);
    if (isNaN(price)) return res.status(400).json({ error: { message: 'Invalid price' } });
  }

  let photoUrl = req.body.photoUrl;
  if (req.file) {
    photoUrl = await uploadToSpaces(req.file, 'dishes');
  }

  const availableBool = available === 'true' || available === true ? true : (available === 'false' || available === false ? false : undefined);
  const catId = categoryId ? Number(categoryId) : undefined;

  const updated = await prisma.dish.update({ 
    where: { id }, 
    data: { 
      name, 
      description, 
      price, 
      available: availableBool, 
      photoUrl,
      categoryId: catId
    } 
  });
  res.json(updated);
}));

/**
 * @swagger
 * /api/v1/dishes/{id}:
 *   delete:
 *     summary: Delete a dish
 *     tags: [Dishes]
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
 *         description: Dish deleted
 */
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
