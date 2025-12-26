import { Router, Request, Response } from 'express';
import { prisma } from '../../db/prisma';
import { rbac } from '../../middlewares/rbac';
import { asyncHandler } from '../../utils/http';
import { notify } from '../../utils/notify';
import { logger } from '../../config/logger';

export const promoRouter = Router();

const POINTS_FOR_VOUCHER = 10;
const VOUCHER_DISCOUNT_PERCENT = 10;

// Generate unique promo code
function generatePromoCode(): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let code = 'PROMO-';
  for (let i = 0; i < 6; i++) {
    code += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return code;
}

// Generate unique voucher code
function generateVoucherCode(): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let code = 'BON-';
  for (let i = 0; i < 8; i++) {
    code += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return code;
}

// ==================== ADMIN ENDPOINTS ====================

/**
 * @swagger
 * /api/v1/promo/admin/codes:
 *   get:
 *     summary: List all promo codes (Admin)
 *     tags: [Promo]
 *     security:
 *       - bearerAuth: []
 */
promoRouter.get('/admin/codes', rbac(['admin', 'superadmin']), asyncHandler(async (req: Request, res: Response) => {
  const codes = await prisma.promoCode.findMany({
    orderBy: { createdAt: 'desc' },
    include: {
      owner: { select: { id: true, name: true, phone: true } },
      _count: { select: { usages: true } }
    }
  });
  res.json(codes);
}));

/**
 * @swagger
 * /api/v1/promo/admin/codes:
 *   post:
 *     summary: Create a promo code for a user (Admin)
 *     tags: [Promo]
 *     security:
 *       - bearerAuth: []
 */
promoRouter.post('/admin/codes', rbac(['admin', 'superadmin']), asyncHandler(async (req: Request, res: Response) => {
  const { userId, customCode } = req.body;

  if (!userId) {
    return res.status(400).json({ error: { message: 'userId is required' } });
  }

  const user = await prisma.user.findUnique({ where: { id: Number(userId) } });
  if (!user) {
    return res.status(404).json({ error: { message: 'User not found' } });
  }

  // Check if user already has a promo code
  const existing = await prisma.promoCode.findFirst({ where: { ownerUserId: Number(userId) } });
  if (existing) {
    return res.status(400).json({ error: { message: 'User already has a promo code' } });
  }

  let code = customCode?.toUpperCase() || generatePromoCode();
  
  // Ensure code is unique
  let attempts = 0;
  while (await prisma.promoCode.findUnique({ where: { code } })) {
    code = generatePromoCode();
    attempts++;
    if (attempts > 10) {
      return res.status(500).json({ error: { message: 'Could not generate unique code' } });
    }
  }

  const promoCode = await prisma.promoCode.create({
    data: {
      code,
      ownerUserId: Number(userId)
    },
    include: {
      owner: { select: { id: true, name: true, phone: true } }
    }
  });

  // Notify user
  try {
    await notify(user.id, {
      type: 'promo.created',
      title: 'Code promo créé !',
      message: `Votre code promo est: ${code}. Partagez-le pour gagner des points !`
    });
  } catch (e) {
    logger.error({ err: e }, 'Failed to notify user about promo code');
  }

  res.status(201).json(promoCode);
}));

/**
 * @swagger
 * /api/v1/promo/admin/codes/{id}:
 *   patch:
 *     summary: Update promo code status (Admin)
 *     tags: [Promo]
 *     security:
 *       - bearerAuth: []
 */
promoRouter.patch('/admin/codes/:id', rbac(['admin', 'superadmin']), asyncHandler(async (req: Request, res: Response) => {
  const id = Number(req.params.id);
  const { isActive } = req.body;

  if (isNaN(id)) {
    return res.status(400).json({ error: { message: 'Invalid id' } });
  }

  const updated = await prisma.promoCode.update({
    where: { id },
    data: { isActive: Boolean(isActive) },
    include: {
      owner: { select: { id: true, name: true, phone: true } }
    }
  });

  res.json(updated);
}));

/**
 * @swagger
 * /api/v1/promo/admin/codes/{id}:
 *   delete:
 *     summary: Delete a promo code (Admin)
 *     tags: [Promo]
 *     security:
 *       - bearerAuth: []
 */
promoRouter.delete('/admin/codes/:id', rbac(['admin', 'superadmin']), asyncHandler(async (req: Request, res: Response) => {
  const id = Number(req.params.id);

  if (isNaN(id)) {
    return res.status(400).json({ error: { message: 'Invalid id' } });
  }

  await prisma.promoCode.delete({ where: { id } });
  res.json({ ok: true });
}));

/**
 * @swagger
 * /api/v1/promo/admin/requests:
 *   get:
 *     summary: List promo code requests (Admin)
 *     tags: [Promo]
 *     security:
 *       - bearerAuth: []
 */
promoRouter.get('/admin/requests', rbac(['admin', 'superadmin']), asyncHandler(async (req: Request, res: Response) => {
  const status = req.query.status as string | undefined;
  const where: any = {};
  if (status && status !== 'all') {
    where.status = status;
  }

  const requests = await prisma.promoCodeRequest.findMany({
    where,
    orderBy: { createdAt: 'desc' },
    include: {
      user: { select: { id: true, name: true, phone: true, email: true } }
    }
  });
  res.json(requests);
}));

/**
 * @swagger
 * /api/v1/promo/admin/requests/{id}:
 *   patch:
 *     summary: Approve or reject a promo code request (Admin)
 *     tags: [Promo]
 *     security:
 *       - bearerAuth: []
 */
promoRouter.patch('/admin/requests/:id', rbac(['admin', 'superadmin']), asyncHandler(async (req: Request, res: Response) => {
  const id = Number(req.params.id);
  const { status, adminNote } = req.body as { status: 'approved' | 'rejected'; adminNote?: string };

  if (isNaN(id) || !['approved', 'rejected'].includes(status)) {
    return res.status(400).json({ error: { message: 'Invalid payload' } });
  }

  const request = await prisma.promoCodeRequest.findUnique({
    where: { id },
    include: { user: true }
  });

  if (!request) {
    return res.status(404).json({ error: { message: 'Request not found' } });
  }

  if (request.status !== 'pending') {
    return res.status(400).json({ error: { message: 'Request already processed' } });
  }

  // Update request
  const updated = await prisma.promoCodeRequest.update({
    where: { id },
    data: { status: status as any, adminNote }
  });

  // If approved, create the promo code
  if (status === 'approved') {
    let code = generatePromoCode();
    let attempts = 0;
    while (await prisma.promoCode.findUnique({ where: { code } })) {
      code = generatePromoCode();
      attempts++;
      if (attempts > 10) break;
    }

    await prisma.promoCode.create({
      data: {
        code,
        ownerUserId: request.userId
      }
    });

    // Notify user
    try {
      await notify(request.userId, {
        type: 'promo.request.approved',
        title: 'Demande approuvée !',
        message: `Votre demande de code promo a été approuvée. Votre code est: ${code}`
      });
    } catch (e) {
      logger.error({ err: e }, 'Failed to notify user');
    }
  } else {
    // Notify rejection
    try {
      await notify(request.userId, {
        type: 'promo.request.rejected',
        title: 'Demande refusée',
        message: adminNote || 'Votre demande de code promo a été refusée.'
      });
    } catch (e) {
      logger.error({ err: e }, 'Failed to notify user');
    }
  }

  res.json(updated);
}));

/**
 * @swagger
 * /api/v1/promo/admin/vouchers:
 *   get:
 *     summary: List all vouchers (Admin)
 *     tags: [Promo]
 *     security:
 *       - bearerAuth: []
 */
promoRouter.get('/admin/vouchers', rbac(['admin', 'superadmin']), asyncHandler(async (req: Request, res: Response) => {
  const vouchers = await prisma.discountVoucher.findMany({
    orderBy: { createdAt: 'desc' },
    include: {
      owner: { select: { id: true, name: true, phone: true } },
      usedBy: { select: { id: true, name: true, phone: true } },
      sharedTo: { select: { id: true, name: true, phone: true } }
    }
  });
  res.json(vouchers);
}));

// ==================== USER ENDPOINTS ====================

/**
 * @swagger
 * /api/v1/promo/my-code:
 *   get:
 *     summary: Get my promo code
 *     tags: [Promo]
 *     security:
 *       - bearerAuth: []
 */
promoRouter.get('/my-code', rbac(['client', 'merchant', 'courier', 'admin', 'superadmin', 'dispatcher', 'agent']), asyncHandler(async (req: Request, res: Response) => {
  const user = (req as any).user as { id: number };

  const promoCode = await prisma.promoCode.findFirst({
    where: { ownerUserId: user.id },
    include: {
      _count: { select: { usages: true } }
    }
  });

  res.json(promoCode);
}));

/**
 * @swagger
 * /api/v1/promo/my-vouchers:
 *   get:
 *     summary: Get my vouchers (owned, shared to me)
 *     tags: [Promo]
 *     security:
 *       - bearerAuth: []
 */
promoRouter.get('/my-vouchers', rbac(['client', 'merchant', 'courier', 'admin', 'superadmin', 'dispatcher', 'agent']), asyncHandler(async (req: Request, res: Response) => {
  const user = (req as any).user as { id: number };

  // Get vouchers the user owns OR vouchers shared to them that are still active
  const vouchers = await prisma.discountVoucher.findMany({
    where: {
      OR: [
        { ownerUserId: user.id },
        { sharedToUserId: user.id, status: 'active' }
      ]
    },
    orderBy: { createdAt: 'desc' },
    include: {
      owner: { select: { id: true, name: true } },
      sharedTo: { select: { id: true, name: true } }
    }
  });

  res.json(vouchers);
}));

/**
 * @swagger
 * /api/v1/promo/request:
 *   post:
 *     summary: Request a promo code
 *     tags: [Promo]
 *     security:
 *       - bearerAuth: []
 */
promoRouter.post('/request', rbac(['client', 'merchant', 'courier', 'agent', 'admin', 'superadmin', 'dispatcher']), asyncHandler(async (req: Request, res: Response) => {
  const user = (req as any).user as { id: number };
  const { reason } = req.body;

  // Check if user already has a promo code
  const existingCode = await prisma.promoCode.findFirst({ where: { ownerUserId: user.id } });
  if (existingCode) {
    return res.status(400).json({ error: { message: 'Vous avez déjà un code promo' } });
  }

  // Check if user already has a pending request
  const existingRequest = await prisma.promoCodeRequest.findFirst({
    where: { userId: user.id, status: 'pending' }
  });
  if (existingRequest) {
    return res.status(400).json({ error: { message: 'Vous avez déjà une demande en attente' } });
  }

  const request = await prisma.promoCodeRequest.create({
    data: {
      userId: user.id,
      reason
    }
  });

  res.status(201).json(request);
}));

/**
 * @swagger
 * /api/v1/promo/my-request:
 *   get:
 *     summary: Get my promo code request status
 *     tags: [Promo]
 *     security:
 *       - bearerAuth: []
 */
promoRouter.get('/my-request', rbac(['client', 'merchant', 'courier', 'admin', 'superadmin', 'dispatcher', 'agent']), asyncHandler(async (req: Request, res: Response) => {
  const user = (req as any).user as { id: number };

  const request = await prisma.promoCodeRequest.findFirst({
    where: { userId: user.id },
    orderBy: { createdAt: 'desc' }
  });

  res.json(request);
}));

/**
 * @swagger
 * /api/v1/promo/validate:
 *   post:
 *     summary: Validate a promo code (check if usable)
 *     tags: [Promo]
 *     security:
 *       - bearerAuth: []
 */
promoRouter.post('/validate', rbac(['client', 'merchant', 'courier', 'admin', 'superadmin', 'dispatcher', 'agent']), asyncHandler(async (req: Request, res: Response) => {
  const user = (req as any).user as { id: number };
  const { code } = req.body;

  if (!code) {
    return res.status(400).json({ error: { message: 'Code is required' } });
  }

  const promoCode = await prisma.promoCode.findUnique({
    where: { code: code.toUpperCase() },
    include: {
      owner: { select: { id: true, name: true } }
    }
  });

  if (!promoCode) {
    return res.status(404).json({ error: { message: 'Code promo invalide' } });
  }

  if (!promoCode.isActive) {
    return res.status(400).json({ error: { message: 'Ce code promo n\'est plus actif' } });
  }

  // Cannot use own promo code
  if (promoCode.ownerUserId === user.id) {
    return res.status(400).json({ error: { message: 'Vous ne pouvez pas utiliser votre propre code promo' } });
  }

  res.json({
    valid: true,
    code: promoCode.code,
    ownerName: promoCode.owner.name
  });
}));

/**
 * @swagger
 * /api/v1/promo/validate-voucher:
 *   post:
 *     summary: Validate a discount voucher
 *     tags: [Promo]
 *     security:
 *       - bearerAuth: []
 */
promoRouter.post('/validate-voucher', rbac(['client', 'merchant', 'courier', 'admin', 'superadmin', 'dispatcher', 'agent']), asyncHandler(async (req: Request, res: Response) => {
  const user = (req as any).user as { id: number };
  const { code } = req.body;

  if (!code) {
    return res.status(400).json({ error: { message: 'Code is required' } });
  }

  const voucher = await prisma.discountVoucher.findUnique({
    where: { code: code.toUpperCase() },
    include: {
      owner: { select: { id: true, name: true } }
    }
  });

  if (!voucher) {
    return res.status(404).json({ error: { message: 'Bon de réduction invalide' } });
  }

  if (voucher.status !== 'active') {
    return res.status(400).json({ error: { message: 'Ce bon de réduction n\'est plus valide' } });
  }

  // Check if voucher is usable by this user
  const canUse = voucher.ownerUserId === user.id || voucher.sharedToUserId === user.id;
  if (!canUse) {
    return res.status(400).json({ error: { message: 'Ce bon ne vous appartient pas' } });
  }

  // Check expiry
  if (voucher.expiresAt && new Date(voucher.expiresAt) < new Date()) {
    return res.status(400).json({ error: { message: 'Ce bon de réduction a expiré' } });
  }

  res.json({
    valid: true,
    code: voucher.code,
    discountPercent: voucher.discountPercent,
    ownerName: voucher.owner.name
  });
}));

/**
 * @swagger
 * /api/v1/promo/share-voucher:
 *   post:
 *     summary: Share a voucher with another user
 *     tags: [Promo]
 *     security:
 *       - bearerAuth: []
 */
promoRouter.post('/share-voucher', rbac(['client', 'merchant', 'courier', 'admin', 'superadmin', 'dispatcher', 'agent']), asyncHandler(async (req: Request, res: Response) => {
  const user = (req as any).user as { id: number };
  const { voucherId, targetPhone } = req.body;

  if (!voucherId || !targetPhone) {
    return res.status(400).json({ error: { message: 'voucherId and targetPhone are required' } });
  }

  const voucher = await prisma.discountVoucher.findUnique({ where: { id: Number(voucherId) } });

  if (!voucher) {
    return res.status(404).json({ error: { message: 'Voucher not found' } });
  }

  if (voucher.ownerUserId !== user.id) {
    return res.status(403).json({ error: { message: 'You can only share your own vouchers' } });
  }

  if (voucher.status !== 'active') {
    return res.status(400).json({ error: { message: 'Voucher is not active' } });
  }

  if (voucher.sharedToUserId) {
    return res.status(400).json({ error: { message: 'Voucher already shared' } });
  }

  // Find target user by phone
  const targetUser = await prisma.user.findUnique({ where: { phone: targetPhone } });
  if (!targetUser) {
    return res.status(404).json({ error: { message: 'Utilisateur non trouvé avec ce numéro' } });
  }

  if (targetUser.id === user.id) {
    return res.status(400).json({ error: { message: 'Vous ne pouvez pas partager avec vous-même' } });
  }

  const updated = await prisma.discountVoucher.update({
    where: { id: voucher.id },
    data: { sharedToUserId: targetUser.id }
  });

  // Notify target user
  try {
    await notify(targetUser.id, {
      type: 'voucher.shared',
      title: 'Bon de réduction reçu !',
      message: `Vous avez reçu un bon de réduction de ${voucher.discountPercent}% de la part de ${user.id}. Code: ${voucher.code}`
    });
  } catch (e) {
    logger.error({ err: e }, 'Failed to notify user about shared voucher');
  }

  res.json(updated);
}));

// ==================== INTERNAL FUNCTIONS (exported for use in orders) ====================

/**
 * Apply a promo code to an order (called from order service)
 * Returns the promo code record if valid
 */
export async function applyPromoCodeToOrder(
  code: string,
  orderId: number,
  usedByUserId: number
): Promise<{ success: boolean; error?: string; promoCode?: any }> {
  const promoCode = await prisma.promoCode.findUnique({
    where: { code: code.toUpperCase() }
  });

  if (!promoCode) {
    return { success: false, error: 'Code promo invalide' };
  }

  if (!promoCode.isActive) {
    return { success: false, error: 'Ce code promo n\'est plus actif' };
  }

  if (promoCode.ownerUserId === usedByUserId) {
    return { success: false, error: 'Vous ne pouvez pas utiliser votre propre code promo' };
  }

  // Record usage
  await prisma.promoCodeUsage.create({
    data: {
      promoCodeId: promoCode.id,
      orderId,
      usedByUserId
    }
  });

  // Increment points
  const newPoints = promoCode.points + 1;
  await prisma.promoCode.update({
    where: { id: promoCode.id },
    data: { points: newPoints }
  });

  // Check if owner earned a voucher (every 10 points)
  if (newPoints % POINTS_FOR_VOUCHER === 0) {
    let voucherCode = generateVoucherCode();
    let attempts = 0;
    while (await prisma.discountVoucher.findUnique({ where: { code: voucherCode } })) {
      voucherCode = generateVoucherCode();
      attempts++;
      if (attempts > 10) break;
    }

    await prisma.discountVoucher.create({
      data: {
        code: voucherCode,
        ownerUserId: promoCode.ownerUserId,
        discountPercent: VOUCHER_DISCOUNT_PERCENT,
        expiresAt: new Date(Date.now() + 90 * 24 * 60 * 60 * 1000) // 90 days expiry
      }
    });

    // Notify owner
    try {
      await notify(promoCode.ownerUserId, {
        type: 'voucher.earned',
        title: 'Bon de réduction gagné !',
        message: `Félicitations ! Vous avez atteint ${newPoints} points et gagné un bon de réduction de ${VOUCHER_DISCOUNT_PERCENT}%. Code: ${voucherCode}`
      });
    } catch (e) {
      logger.error({ err: e }, 'Failed to notify user about earned voucher');
    }
  } else {
    // Just notify about new point
    try {
      await notify(promoCode.ownerUserId, {
        type: 'promo.point.earned',
        title: 'Point gagné !',
        message: `Quelqu'un a utilisé votre code promo. Vous avez maintenant ${newPoints} point(s). Encore ${POINTS_FOR_VOUCHER - (newPoints % POINTS_FOR_VOUCHER)} pour un bon de réduction !`
      });
    } catch (e) {
      logger.error({ err: e }, 'Failed to notify user about point');
    }
  }

  return { success: true, promoCode };
}

/**
 * Apply a discount voucher to an order
 * Returns the discount amount
 */
export async function applyVoucherToOrder(
  code: string,
  orderId: number,
  usedByUserId: number,
  orderTotal: number
): Promise<{ success: boolean; error?: string; discount?: number; voucher?: any }> {
  const voucher = await prisma.discountVoucher.findUnique({
    where: { code: code.toUpperCase() }
  });

  if (!voucher) {
    return { success: false, error: 'Bon de réduction invalide' };
  }

  if (voucher.status !== 'active') {
    return { success: false, error: 'Ce bon de réduction n\'est plus valide' };
  }

  // Check if user can use it
  const canUse = voucher.ownerUserId === usedByUserId || voucher.sharedToUserId === usedByUserId;
  if (!canUse) {
    return { success: false, error: 'Ce bon ne vous appartient pas' };
  }

  // Check expiry
  if (voucher.expiresAt && new Date(voucher.expiresAt) < new Date()) {
    await prisma.discountVoucher.update({
      where: { id: voucher.id },
      data: { status: 'expired' }
    });
    return { success: false, error: 'Ce bon de réduction a expiré' };
  }

  // Calculate discount
  const discount = Math.round(orderTotal * voucher.discountPercent / 100);

  // Mark voucher as used
  await prisma.discountVoucher.update({
    where: { id: voucher.id },
    data: {
      status: 'used',
      usedByUserId,
      usedOnOrderId: orderId
    }
  });

  return { success: true, discount, voucher };
}
