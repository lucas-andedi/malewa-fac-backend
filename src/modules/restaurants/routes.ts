import { Router, Request, Response } from 'express';
import { prisma } from '../../db/prisma';
import { asyncHandler } from '../../utils/http';
import { rbac } from '../../middlewares/rbac';
import { uploadMiddleware, uploadToSpaces } from '../../utils/upload';

export const restaurantsRouter = Router();

// POST /api/v1/restaurants (merchant/admin/superadmin)
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
      deliveryFeeCampus: deliveryFeeCampus ? Number(deliveryFeeCampus) : 1500,
      code: name.substring(0,3).toUpperCase() + Math.floor(Math.random()*1000),
      photoUrl,
      institutionLinks: {
        create: institutionIds.map((id: any) => ({ institutionId: Number(id) }))
      }
    },
    include: { institutionLinks: { include: { institution: true } } }
  });
  
  const response = {
    ...created,
    institutions: created.institutionLinks.map(l => l.institution),
    institutionLinks: undefined
  };

  res.status(201).json(response);
}));

// PATCH /api/v1/restaurants/:id (merchant/admin/superadmin)
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

// GET /api/v1/restaurants/mine (merchant)
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

// GET /api/v1/restaurants?institutionCode=unikin
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
    include: { institutionLinks: { include: { institution: true } } }
  });
  
  const response = list.map(r => ({
    ...r,
    institutions: r.institutionLinks.map(l => l.institution),
    institutionLinks: undefined
  }));
  res.json(response);
}));

// GET /api/v1/restaurants/:id
restaurantsRouter.get('/:id', asyncHandler(async (req: Request, res: Response) => {
  const id = Number(req.params.id);
  if (isNaN(id)) return res.status(400).json({ error: { message: 'Invalid restaurant id' } });
  const resto = await prisma.restaurant.findUnique({ 
    where: { id },
    include: { institutionLinks: { include: { institution: true } } } 
  });
  if (!resto) return res.status(404).json({ error: { message: 'Restaurant not found' } });
  
  const response = {
    ...resto,
    institutions: resto.institutionLinks.map(l => l.institution),
    institutionLinks: undefined
  };
  res.json(response);
}));

// GET /api/v1/restaurants/:id/transactions (merchant)
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

// GET /api/v1/restaurants/:id/orders (merchant/admin/superadmin)
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

// POST /api/v1/restaurants/:id/dishes (merchant/admin/superadmin)
restaurantsRouter.post('/:id/dishes', rbac(['merchant','admin','superadmin']), uploadMiddleware.single('image'), asyncHandler(async (req: Request, res: Response) => {
  const id = Number(req.params.id);
  if (isNaN(id)) return res.status(400).json({ error: { message: 'Invalid restaurant id' } });
  
  const { name, description, price, available } = req.body as { name: string; description?: string; price: string|number; available?: string|boolean };
  
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
      photoUrl 
    } 
  });
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

