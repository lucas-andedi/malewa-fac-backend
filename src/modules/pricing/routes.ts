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

  const SERVICE_FEE = await getSetting('SERVICE_FEE', 1000);
  const CAMPUS_DELIVERY_FEE = await getSetting('CAMPUS_DELIVERY_FEE', 1000);
  const OFF_CAMPUS_RATE_PER_KM = await getSetting('OFF_CAMPUS_RATE_PER_KM', 500);
  const OFF_CAMPUS_MIN_FEE = await getSetting('OFF_CAMPUS_MIN_FEE', 2000);

  let deliveryFee = 0;
  if (method === 'pickup') deliveryFee = 0;
  else if (method === 'campus') deliveryFee = CAMPUS_DELIVERY_FEE;
  else if (method === 'offcampus') {
    const dist = Math.max(1, Number(km || 1));
    deliveryFee = Math.max(OFF_CAMPUS_MIN_FEE, Math.round(dist * OFF_CAMPUS_RATE_PER_KM));
  } else return res.status(400).json({ error: { message: 'Invalid method' } });

  res.json({ serviceFee: SERVICE_FEE, deliveryFee });
}));
