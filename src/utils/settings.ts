import { prisma } from '../db/prisma';

export async function getSetting(key: string, fallback: number): Promise<number> {
  const s = await prisma.setting.findUnique({ where: { skey: key } });
  return s ? Number(s.svalue) : fallback;
}

export async function getFees(params?: { method?: 'pickup'|'campus'|'offcampus'; km?: number }) {
  const method = params?.method ?? 'campus';
  const km = params?.km ?? 1;

  const SERVICE_FEE = await getSetting('SERVICE_FEE', 1000);
  const CAMPUS_DELIVERY_FEE = await getSetting('CAMPUS_DELIVERY_FEE', 1000);
  const OFF_CAMPUS_RATE_PER_KM = await getSetting('OFF_CAMPUS_RATE_PER_KM', 500);
  const OFF_CAMPUS_MIN_FEE = await getSetting('OFF_CAMPUS_MIN_FEE', 2000);

  let deliveryFee = 1000;
  if (method === 'pickup') deliveryFee = 0;
  else if (method === 'campus') deliveryFee = CAMPUS_DELIVERY_FEE;
  else deliveryFee = Math.max(OFF_CAMPUS_MIN_FEE, Math.round(km * OFF_CAMPUS_RATE_PER_KM));

  return { SERVICE_FEE, deliveryFee };
}
