import { Request, Response } from 'express';
import axios from 'axios';
import { prisma } from '../../db/prisma';
import { env } from '../../config/env';
import { createOrder } from '../orders/service';

async function getSetting(key: string, fallback: number): Promise<number> {
  const s = await prisma.setting.findUnique({ where: { skey: key } });
  return s ? Number(s.svalue) : fallback;
}

export async function initiateLabyrinthePayment(req: Request, res: Response) {
  const body = req.body as {
    phone?: string;
    order?: {
      customerName: string;
      customerUserId?: number;
      restaurantId: number;
      items: Array<{ dishId: number; qty: number }>;
      deliveryMethod: 'pickup'|'campus'|'offcampus';
      address?: string;
      estimatedDistanceKm?: number;
    };
  };
  const { phone, order } = body;
  if (!phone || !order) return res.status(400).json({ error: { message: 'phone and order are required' } });
  if (!env.labyrintheApiUrl || !env.labyrintheToken) return res.status(500).json({ error: { message: 'Labyrinthe is not configured on server' } });

  // Compute total amount from order payload
  const { restaurantId, items, deliveryMethod, estimatedDistanceKm } = order;
  if (!restaurantId || !Array.isArray(items) || items.length === 0 || !deliveryMethod) {
    return res.status(400).json({ error: { message: 'Invalid order payload' } });
  }
  const dishIds = items.map(i => i.dishId);
  const dishes = await prisma.dish.findMany({ where: { id: { in: dishIds }, restaurantId } });
  if (dishes.length !== items.length) return res.status(400).json({ error: { message: 'Invalid items' } });
  const subtotal = items.reduce((s, i) => {
    const d = dishes.find(x => x.id === i.dishId)!;
    return s + d.price * i.qty;
  }, 0);
  const SERVICE_FEE = await getSetting('SERVICE_FEE', 1000);
  const CAMPUS_DELIVERY_FEE = await getSetting('CAMPUS_DELIVERY_FEE', 2000);
  const OFF_CAMPUS_RATE_PER_KM = await getSetting('OFF_CAMPUS_RATE_PER_KM', 500);
  const OFF_CAMPUS_MIN_FEE = await getSetting('OFF_CAMPUS_MIN_FEE', 2000);
  let deliveryFee = 0;
  if (deliveryMethod === 'pickup') deliveryFee = 0;
  else if (deliveryMethod === 'campus') deliveryFee = CAMPUS_DELIVERY_FEE;
  else deliveryFee = Math.max(OFF_CAMPUS_MIN_FEE, Math.round((estimatedDistanceKm || 1) * OFF_CAMPUS_RATE_PER_KM));
  const total = subtotal + SERVICE_FEE + deliveryFee;

  const callbackUrl = `${env.appUrl.replace(/\/$/, '')}/api/v1/payments/labyrinthe/webhook`;

  try {
    const params = {
      token: env.labyrintheToken,
      reference: `MOB-${Date.now()}`,
      amount: total,
      currency: env.labyrintheCurrency || 'CDF',
      country: env.labyrintheCountry || 'CD',
      phone: String(phone),
      callback: callbackUrl,
      firstname: 'Idolo',
      lastname: 'Technologie',
      email: 'joellucasandedi@gmail.com',
    } as const;

    const { data: response } = await axios.post(env.labyrintheApiUrl, params, { timeout: 20000 });

    if (!response?.success) {
      return res.status(response?.status || 403).json({ error: { message: 'Le processus de paiement n\'a pas pu être lancé' }, providerResponse: response });
    }

    
    const orderNumber = String(response.orderNumber);
    const payload = { ...order, paymentMethod: 'mobile' as const, phone: String(phone) };
    await prisma.setting.upsert({
      where: { skey: `LABY:${orderNumber}` },
      create: { skey: `LABY:${orderNumber}`, svalue: JSON.stringify(payload) },
      update: { svalue: JSON.stringify(payload) }
    });

    return res.status(201).json({ orderNumber, amountCustomer: response.amountCustomer ?? null });
  } catch (error: any) {
    if (axios.isAxiosError(error)) {
      const status = error.response?.status || 500;
      return res.status(status).json({ error: { message: 'Erreur API Labyrinthe', status }, providerResponse: (error.response?.data ?? null) });
    }
    return res.status(500).json({ error: { message: error?.message || 'Erreur lors de l\'initialisation du paiement' } });
  }
}

export async function labyrintheWebhookHandler(req: Request, res: Response) {
  // Always return 200 to acknowledge receipt
  try {
    const { orderNumber, results } = req.body as { orderNumber?: string; results?: { status?: { code?: number } } };
    if (!orderNumber) {
      return res.status(200).json({ received: true, note: 'orderNumber missing' });
    }

    const code = results?.status?.code;
    if (code === 3) {
      // Failure: clear any pending session
      try { await prisma.setting.delete({ where: { skey: `LABY:${String(orderNumber)}` } }); } catch {}
    } else if (code === 2) {
      // Success: retrieve pending session, create order, attach payment
      const key = `LABY:${String(orderNumber)}`;
      const session = await prisma.setting.findUnique({ where: { skey: key } });
      if (session) {
        try {
          const payload = JSON.parse(session.svalue) as any;
          const created = await createOrder(payload);
          await prisma.payment.create({
            data: {
              orderId: created.id,
              method: 'mobile',
              provider: 'labyrinthe',
              providerRef: String(orderNumber),
              amount: created.total,
              status: 'succeeded',
              paidAt: new Date(),
            }
          });
        } catch {}
        try { await prisma.setting.delete({ where: { skey: key } }); } catch {}
      }
    }

    return res.status(200).json({ received: true });
  } catch (error) {
    return res.status(200).json({ received: true, note: 'processing error ignored' });
  }
}

export async function mobileStatusHandler(req: Request, res: Response) {
  const orderNumber = String((req.query.orderNumber || '') as string);
  if (!orderNumber) return res.status(400).json({ error: { message: 'orderNumber required' } });
  const payment = await prisma.payment.findFirst({ where: { provider: 'labyrinthe', providerRef: orderNumber } });
  if (payment) {
    const order = await prisma.order.findUnique({ where: { id: payment.orderId } });
    return res.json({ status: payment.status, orderId: order?.id, orderCode: order?.code });
  }
  const pending = await prisma.setting.findUnique({ where: { skey: `LABY:${orderNumber}` } });
  if (pending) return res.json({ status: 'pending' });
  return res.json({ status: 'failed' });
}
