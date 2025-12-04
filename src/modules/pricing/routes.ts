import { Router, Request, Response } from 'express';
import { prisma } from '../../db/prisma';
import { asyncHandler } from '../../utils/http';

export const pricingRouter = Router();

async function getSetting(key: string, fallback: number): Promise<number> {
  const s = await prisma.setting.findUnique({ where: { skey: key } });
  return s ? Number(s.svalue) : fallback;
}

pricingRouter.get('/delivery', asyncHandler(async (req: Request, res: Response) => {
  const method = String((req.query as any).method || 'campus');
  const km = (req.query as any).km ? Number((req.query as any).km) : undefined;
  
  // Check user's order count if authenticated (via query param passed from frontend or token if available)
  // Since this is a public endpoint usually called without auth header in current frontend impl, 
  // we might need to rely on the user passing their ID or just handle it at order creation time.
  // However, the prompt asks for "frais puisse etre gratuit", implying display as well.
  // Let's try to see if we can get the user from the request if 'authOptional' middleware is used globally.
  // If the user is logged in, req.user might be populated.
  
  const user = (req as any).user;
  let isFree = false;
  
  if (user) {
    const count = await prisma.order.count({ where: { customerUserId: user.id } });
    if (count < 3) isFree = true;
  }

  const SERVICE_FEE = await getSetting('SERVICE_FEE', 1000); // Default 1000
  const CAMPUS_DELIVERY_FEE = await getSetting('CAMPUS_DELIVERY_FEE', 1000); // Default 1000
  const OFF_CAMPUS_RATE_PER_KM = await getSetting('OFF_CAMPUS_RATE_PER_KM', 500);
  const OFF_CAMPUS_MIN_FEE = await getSetting('OFF_CAMPUS_MIN_FEE', 2000);

  let deliveryFee = 0;
  if (method === 'pickup') deliveryFee = 0;
  else if (method === 'campus') deliveryFee = CAMPUS_DELIVERY_FEE;
  else if (method === 'offcampus') {
    const dist = Math.max(1, Number(km || 1));
    deliveryFee = Math.max(OFF_CAMPUS_MIN_FEE, Math.round(dist * OFF_CAMPUS_RATE_PER_KM));
  } else return res.status(400).json({ error: { message: 'Invalid method' } });

  if (isFree) {
    // Free service and delivery for first 3 orders
    res.json({ serviceFee: 0, deliveryFee: 0, isFreeTrial: true });
  } else {
    res.json({ serviceFee: SERVICE_FEE, deliveryFee });
  }
}));
