import { Router, Request, Response } from 'express';
import { prisma } from '../../db/prisma';
import { asyncHandler } from '../../utils/http';
import { rbac } from '../../middlewares/rbac';
import { uploadMiddleware, uploadToSpaces } from '../../utils/upload';

export const restaurantsRouter = Router();

/**
 * @swagger
 * /api/v1/restaurants:
 *   post:
 *     summary: Create a restaurant
 *     tags: [Restaurants]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             required: [name, institutionIds]
 *             properties:
 *               name:
 *                 type: string
 *               deliveryFeeCampus:
 *                 type: integer
 *               address:
 *                 type: string
 *               description:
 *                 type: string
 *               institutionIds:
 *                 type: array
 *                 items:
 *                   type: integer
 *               image:
 *                 type: string
 *                 format: binary
 *     responses:
 *       201:
 *         description: Restaurant created
 */
restaurantsRouter.post('/', rbac(['merchant','admin','superadmin']), uploadMiddleware.single('image'), asyncHandler(async (req: Request, res: Response) => {
  const user = (req as any).user as { id: number; institutionId?: number; role: string };
  const { name, deliveryFeeCampus, address, description } = req.body;
  let institutionIds = req.body.institutionIds;

  if (!name) return res.status(400).json({ error: { message: 'Name required' } });

  // Handle institutionIds parsing (multipart/form-data sends complex types as strings)
  if (typeof institutionIds === 'string') {
    try {
      institutionIds = JSON.parse(institutionIds);
    } catch {
      // If not JSON, maybe comma separated
      institutionIds = institutionIds.split(',').map(Number);
    }
  }
  if (!Array.isArray(institutionIds)) {
    // If not provided, use user's institution if available
    if (user.institutionId) institutionIds = [user.institutionId];
    else return res.status(400).json({ error: { message: 'At least one Institution required' } });
  }

  // If merchant, force owner to be self
  const ownerUserId = user.role === 'merchant' ? user.id : (req.body.ownerUserId ? Number(req.body.ownerUserId) : null);

  let photoUrl = req.body.photoUrl;
  if (req.file) {
    photoUrl = await uploadToSpaces(req.file, 'restaurants');
  }

  const status = ['admin', 'superadmin'].includes(user.role) ? 'active' : 'pending';

  const created = await prisma.restaurant.create({
    data: {
      name,
      address,
      description,
      status,
      ownerUserId,
      deliveryFeeCampus: deliveryFeeCampus ? Number(deliveryFeeCampus) : 1000,
      code: name.substring(0,3).toUpperCase() + Math.floor(Math.random()*1000),
      photoUrl,
      institutionLinks: {
        create: institutionIds.map((id: any) => ({ institutionId: Number(id) }))
      }
    },
    include: { institutionLinks: { include: { institution: true } } }
  });
  
  // Seed default categories
  await prisma.dishCategory.createMany({
    data: [
      { restaurantId: created.id, name: 'Plats Principaux', displayOrder: 0 },
      { restaurantId: created.id, name: 'Accompagnements', displayOrder: 1 },
      { restaurantId: created.id, name: 'Sauces', displayOrder: 2 },
      { restaurantId: created.id, name: 'Boissons', displayOrder: 3 },
      { restaurantId: created.id, name: 'Accessoires', displayOrder: 4 }
    ]
  });

  // Create default mandatory Assiette
  const accessoriesCat = await prisma.dishCategory.findFirst({
    where: { restaurantId: created.id, name: 'Accessoires' }
  });
  
  if (accessoriesCat) {
    await prisma.dish.create({
      data: {
        restaurantId: created.id,
        name: 'Assiette',
        description: 'Assiette jetable obligatoire',
        price: 1000,
        available: true,
        categoryId: accessoriesCat.id,
        isMandatory: true
      }
    });
  }
  
  const response = {
    ...created,
    institutions: created.institutionLinks.map(l => l.institution),
    institutionLinks: undefined
  };

  res.status(201).json(response);
}));

/**
 * @swagger
 * /api/v1/restaurants/{id}:
 *   patch:
 *     summary: Update a restaurant
 *     tags: [Restaurants]
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
 *               deliveryFeeCampus:
 *                 type: integer
 *               address:
 *                 type: string
 *               description:
 *                 type: string
 *               institutionIds:
 *                 type: array
 *                 items:
 *                   type: integer
 *               image:
 *                 type: string
 *                 format: binary
 *     responses:
 *       200:
 *         description: Restaurant updated
 */
restaurantsRouter.patch('/:id', rbac(['merchant','admin','superadmin']), uploadMiddleware.single('image'), asyncHandler(async (req: Request, res: Response) => {
  const id = Number(req.params.id);
  if (isNaN(id)) return res.status(400).json({ error: { message: 'Invalid restaurant id' } });

  const user = (req as any).user as { id: number; role: string };
  const { name, deliveryFeeCampus, address, description } = req.body;
  let institutionIds = req.body.institutionIds;

  const resto = await prisma.restaurant.findUnique({ where: { id } });
  if (!resto) return res.status(404).json({ error: { message: 'Restaurant not found' } });

  // Check permissions
  if (user.role === 'merchant' && resto.ownerUserId !== user.id) {
    return res.status(403).json({ error: { message: 'Forbidden' } });
  }

  // Handle institutionIds
  if (typeof institutionIds === 'string') {
    try { institutionIds = JSON.parse(institutionIds); } catch { institutionIds = institutionIds.split(',').map(Number); }
  }

  // Deduplicate institutionIds
  let uniqueInstitutionIds: number[] | undefined;
  if (Array.isArray(institutionIds)) {
    uniqueInstitutionIds = Array.from(new Set(institutionIds.map((id: any) => Number(id))));
  }

  let photoUrl = req.body.photoUrl;
  if (req.file) {
    photoUrl = await uploadToSpaces(req.file, 'restaurants');
  }

  // If updating, reset status to pending if it was rejected, to allow re-review
  const newStatus = resto.status === 'rejected' ? 'pending' : undefined;

  const updated = await prisma.restaurant.update({
    where: { id },
    data: {
      name,
      address,
      description,
      deliveryFeeCampus: deliveryFeeCampus ? Number(deliveryFeeCampus) : undefined,
      photoUrl,
      status: newStatus, // Reset status if rejected
      institutionLinks: uniqueInstitutionIds ? {
        deleteMany: {},
        create: uniqueInstitutionIds.map(id => ({ institutionId: id }))
      } : undefined
    },
    include: { institutionLinks: { include: { institution: true } } }
  });

  const response = {
    ...updated,
    institutions: updated.institutionLinks.map(l => l.institution),
    institutionLinks: undefined
  };
  res.json(response);
}));

/**
 * @swagger
 * /api/v1/restaurants/mine:
 *   get:
 *     summary: Get my restaurants (merchant)
 *     tags: [Restaurants]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: List of my restaurants
 */
restaurantsRouter.get('/mine', rbac(['merchant']), asyncHandler(async (req: Request, res: Response) => {
  const user = (req as any).user as { id: number };
  const list = await prisma.restaurant.findMany({
    where: { ownerUserId: user.id },
    orderBy: { name: 'asc' },
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
 * /api/v1/restaurants:
 *   get:
 *     summary: List active restaurants
 *     tags: [Restaurants]
 *     parameters:
 *       - in: query
 *         name: institutionCode
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: List of active restaurants
 */
restaurantsRouter.get('/', asyncHandler(async (req: Request, res: Response) => {
  const { institutionCode } = req.query as { institutionCode?: string };

  let where: any = { status: 'active' }; // Only show active restaurants publicly
  if (institutionCode) {
    where.institutionLinks = { some: { institution: { code: institutionCode } } };
  }

  const list = await prisma.restaurant.findMany({
    where: {
      ...where,
      OR: [
        { ownerUserId: null },
        { owner: { status: 'active' } }
      ]
    },
    orderBy: { name: 'asc' },
    include: { 
      institutionLinks: { include: { institution: true } },
      owner: { select: { name: true } }
    }
  });
  
  const response = list.map(r => ({
    ...r,
    ownerName: r.owner?.name,
    institutions: r.institutionLinks.map(l => l.institution),
    institutionLinks: undefined,
    owner: undefined
  }));
  res.json(response);
}));

/**
 * @swagger
 * /api/v1/restaurants/{id}:
 *   get:
 *     summary: Get restaurant details
 *     tags: [Restaurants]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *     responses:
 *       200:
 *         description: Restaurant details
 */
restaurantsRouter.get('/:id', asyncHandler(async (req: Request, res: Response) => {
  const id = Number(req.params.id);
  if (isNaN(id)) return res.status(400).json({ error: { message: 'Invalid restaurant id' } });
  const resto = await prisma.restaurant.findUnique({ 
    where: { id },
    include: { 
      institutionLinks: { include: { institution: true } },
      owner: { select: { name: true } }
    } 
  });
  if (!resto) return res.status(404).json({ error: { message: 'Restaurant not found' } });
  
  const response = {
    ...resto,
    ownerName: resto.owner?.name,
    institutions: resto.institutionLinks.map(l => l.institution),
    institutionLinks: undefined,
    owner: undefined
  };
  res.json(response);
}));

/**
 * @swagger
 * /api/v1/restaurants/{id}/transactions:
 *   get:
 *     summary: Get restaurant transactions
 *     tags: [Restaurants]
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
 *         description: List of transactions
 */
restaurantsRouter.get('/:id/transactions', rbac(['merchant']), asyncHandler(async (req: Request, res: Response) => {
  const id = Number(req.params.id);
  if (isNaN(id)) return res.status(400).json({ error: { message: 'Invalid restaurant id' } });
  
  const user = (req as any).user as { id: number };
  const resto = await prisma.restaurant.findUnique({ where: { id } });
  
  if (!resto) return res.status(404).json({ error: { message: 'Restaurant not found' } });
  if (resto.ownerUserId !== user.id) return res.status(403).json({ error: { message: 'Forbidden' } });

  // Find transactions where order belongs to this restaurant AND beneficiary is merchant
  const transactions = await prisma.transaction.findMany({
    where: {
      order: { restaurantId: id },
      beneficiary: 'merchant'
    },
    orderBy: { createdAt: 'desc' },
    include: {
      order: { select: { code: true, total: true } }
    }
  });

  res.json(transactions);
}));

/**
 * @swagger
 * /api/v1/restaurants/{id}/orders:
 *   get:
 *     summary: Get restaurant orders
 *     tags: [Restaurants]
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
 *         description: List of orders
 */
restaurantsRouter.get('/:id/orders', rbac(['merchant','admin','superadmin']), asyncHandler(async (req: Request, res: Response) => {
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

/**
 * @swagger
 * /api/v1/restaurants/{id}/dishes:
 *   post:
 *     summary: Add a dish to restaurant
 *     tags: [Restaurants]
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
 *             required: [name, price]
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
 *       201:
 *         description: Dish created
 */
restaurantsRouter.post('/:id/dishes', rbac(['merchant','admin','superadmin']), uploadMiddleware.single('image'), asyncHandler(async (req: Request, res: Response) => {
  const id = Number(req.params.id);
  if (isNaN(id)) return res.status(400).json({ error: { message: 'Invalid restaurant id' } });
  
  const { name, description, price, available, categoryId, isMandatory } = req.body as { name: string; description?: string; price: string|number; available?: string|boolean; categoryId?: string|number; isMandatory?: string|boolean };
  
  // Convert price to number (since multipart/form-data sends strings)
  const priceNum = Number(price);
  
  if (!name || isNaN(priceNum)) return res.status(400).json({ error: { message: 'name and valid price required' } });
  
  const resto = await prisma.restaurant.findUnique({ where: { id } });
  if (!resto) return res.status(404).json({ error: { message: 'Restaurant not found' } });
  
  const user = (req as any).user as { id: number; role: string };
  if (user.role === 'merchant' && resto.ownerUserId && resto.ownerUserId !== user.id) return res.status(403).json({ error: { message: 'Forbidden' } });
  
  // Handle image upload if present
  let photoUrl = req.body.photoUrl; // Optional: allow passing URL directly if no file
  if (req.file) {
    photoUrl = await uploadToSpaces(req.file, 'dishes');
  }

  const created = await prisma.dish.create({ 
    data: { 
      restaurantId: id, 
      name, 
      description: description || 'Nouveau plat', 
      price: priceNum, 
      available: available === 'true' || available === true, 
      photoUrl,
      categoryId: categoryId ? Number(categoryId) : undefined,
      isMandatory: isMandatory === 'true' || isMandatory === true
    } 
  });
  res.status(201).json(created);
}));

/**
 * @swagger
 * /api/v1/restaurants/{id}/dishes:
 *   get:
 *     summary: Get restaurant dishes
 *     tags: [Restaurants]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *       - in: query
 *         name: all
 *         schema:
 *           type: boolean
 *         description: If true, returns all dishes (requires auth). Otherwise only available (public).
 *     responses:
 *       200:
 *         description: List of dishes
 */
restaurantsRouter.get('/:id/dishes', asyncHandler(async (req: Request, res: Response) => {
  const id = Number(req.params.id);
  if (isNaN(id)) return res.status(400).json({ error: { message: 'Invalid restaurant id' } });
  const all = String((req.query as any).all || '').toLowerCase() === 'true';
  
  const include = { category: true };

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
    const allDishes = await prisma.dish.findMany({ where: { restaurantId: id }, orderBy: { name: 'asc' }, include });
    return res.json(allDishes);
  }
  const available = await prisma.dish.findMany({ where: { restaurantId: id, available: true }, orderBy: { name: 'asc' }, include });
  res.json(available);
}));


// Categories Management

/**
 * @swagger
 * /api/v1/restaurants/{id}/categories:
 *   get:
 *     summary: Get restaurant categories
 *     tags: [Restaurants]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *     responses:
 *       200:
 *         description: List of categories
 */
restaurantsRouter.get('/:id/categories', asyncHandler(async (req: Request, res: Response) => {
  const id = Number(req.params.id);
  if (isNaN(id)) return res.status(400).json({ error: { message: 'Invalid restaurant id' } });
  const list = await prisma.dishCategory.findMany({
    where: { restaurantId: id },
    orderBy: { displayOrder: 'asc' }
  });
  res.json(list);
}));

/**
 * @swagger
 * /api/v1/restaurants/{id}/categories:
 *   post:
 *     summary: Create category
 *     tags: [Restaurants]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [name]
 *             properties:
 *               name:
 *                 type: string
 *               displayOrder:
 *                 type: integer
 *     responses:
 *       201:
 *         description: Category created
 */
restaurantsRouter.post('/:id/categories', rbac(['merchant','admin']), asyncHandler(async (req: Request, res: Response) => {
  const id = Number(req.params.id);
  const { name, displayOrder } = req.body;
  
  // Check ownership
  const user = (req as any).user;
  if (user.role === 'merchant') {
     const r = await prisma.restaurant.findUnique({ where: { id } });
     if (r?.ownerUserId !== user.id) return res.status(403).json({ error: { message: 'Forbidden' } });
  }

  const created = await prisma.dishCategory.create({
    data: { restaurantId: id, name, displayOrder: Number(displayOrder||0) }
  });
  res.status(201).json(created);
}));

/**
 * @swagger
 * /api/v1/restaurants/{id}/categories/reorder:
 *   patch:
 *     summary: Reorder categories
 *     tags: [Restaurants]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [orders]
 *             properties:
 *               orders:
 *                 type: array
 *                 items:
 *                   type: object
 *                   properties:
 *                     id:
 *                       type: integer
 *                     order:
 *                       type: integer
 *     responses:
 *       200:
 *         description: Categories reordered
 */
restaurantsRouter.patch('/:id/categories/reorder', rbac(['merchant','admin']), asyncHandler(async (req: Request, res: Response) => {
   const id = Number(req.params.id);
   const { orders } = req.body as { orders: { id: number; order: number }[] };
   
   const user = (req as any).user;
   if (user.role === 'merchant') {
      const r = await prisma.restaurant.findUnique({ where: { id } });
      if (r?.ownerUserId !== user.id) return res.status(403).json({ error: { message: 'Forbidden' } });
   }

   await prisma.$transaction(
     orders.map(o => prisma.dishCategory.update({
       where: { id: o.id },
       data: { displayOrder: o.order }
     }))
   );
   res.json({ ok: true });
}));

/**
 * @swagger
 * /api/v1/restaurants/{id}/categories/{catId}:
 *   delete:
 *     summary: Delete category
 *     tags: [Restaurants]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Category deleted
 */
restaurantsRouter.delete('/:id/categories/:catId', rbac(['merchant','admin']), asyncHandler(async (req: Request, res: Response) => {
   const id = Number(req.params.id);
   const catId = Number(req.params.catId);
   
   const user = (req as any).user;
   if (user.role === 'merchant') {
      const r = await prisma.restaurant.findUnique({ where: { id } });
      if (r?.ownerUserId !== user.id) return res.status(403).json({ error: { message: 'Forbidden' } });
   }

   // Check if dishes exist? Maybe allow delete and set categoryId null?
   // For now, set null
   await prisma.dish.updateMany({ where: { categoryId: catId }, data: { categoryId: null } });
   await prisma.dishCategory.delete({ where: { id: catId } });
   res.json({ ok: true });
}));

