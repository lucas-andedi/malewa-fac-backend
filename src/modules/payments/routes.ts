import { Router, Request, Response } from 'express';
import { asyncHandler } from '../../utils/http';
import { prisma } from '../../db/prisma';
import { stripe } from '../../config/stripe';
import { env } from '../../config/env';
import { initiateLabyrinthePayment, labyrintheWebhookHandler, mobileStatusHandler } from './labyrinthe';

export const paymentsRouter = Router();

// Helper to get dynamic settings similar to pricing module
async function getSetting(key: string, fallback: number): Promise<number> {
  const s = await prisma.setting.findUnique({ where: { skey: key } });
  return s ? Number(s.svalue) : fallback;
}

// POST /api/v1/payments/cart-intent (no auth) - prepare Stripe intent from cart, before order creation
paymentsRouter.post('/cart-intent', asyncHandler(async (req: Request, res: Response) => {
  const { restaurantId, items, deliveryMethod, estimatedDistanceKm } = req.body as {
    restaurantId?: number;
    items?: Array<{ dishId: number; qty: number }>;
    deliveryMethod?: 'pickup'|'campus'|'offcampus';
    estimatedDistanceKm?: number;
  };

  if (!restaurantId || !Array.isArray(items) || items.length === 0 || !deliveryMethod) {
    return res.status(400).json({ error: { message: 'restaurantId, items and deliveryMethod required' } });
  }
  if (!env.stripeSecretKey || !env.stripePublicKey) {
    return res.status(500).json({ error: { message: 'Stripe not configured on server' } });
  }

  // Validate dishes belong to restaurant and compute subtotal
  const dishIds = items.map(i => i.dishId);
  const dishes = await prisma.dish.findMany({ where: { id: { in: dishIds }, restaurantId } });
  if (dishes.length !== items.length) return res.status(400).json({ error: { message: 'Invalid items' } });
  const subtotal = items.reduce((s, i) => {
    const d = dishes.find(x => x.id === i.dishId)!;
    return s + d.price * i.qty;
  }, 0);

  // Fees
  const SERVICE_FEE = await getSetting('SERVICE_FEE', 1000);
  const CAMPUS_DELIVERY_FEE = await getSetting('CAMPUS_DELIVERY_FEE', 2000);
  const OFF_CAMPUS_RATE_PER_KM = await getSetting('OFF_CAMPUS_RATE_PER_KM', 500);
  const OFF_CAMPUS_MIN_FEE = await getSetting('OFF_CAMPUS_MIN_FEE', 2000);
  let deliveryFee = 0;
  if (deliveryMethod === 'pickup') deliveryFee = 0;
  else if (deliveryMethod === 'campus') deliveryFee = CAMPUS_DELIVERY_FEE;
  else deliveryFee = Math.max(OFF_CAMPUS_MIN_FEE, Math.round((estimatedDistanceKm || 1) * OFF_CAMPUS_RATE_PER_KM));
  const total = subtotal + SERVICE_FEE + deliveryFee;

  const amountMinor = Math.max(1, Math.round(total * (env.stripeAmountMultiplier || 1)));
  const currency = env.stripeCurrency || 'usd';

  const intent = await stripe.paymentIntents.create({
    amount: amountMinor,
    currency,
    automatic_payment_methods: { enabled: true },
    metadata: {
      // no order yet
      restaurantId: String(restaurantId),
    }
  });

  return res.status(201).json({
    clientSecret: intent.client_secret,
    publishableKey: env.stripePublicKey,
  });
}));

// POST /api/v1/payments/intent (auth)
paymentsRouter.post('/intent', asyncHandler(async (req: Request, res: Response) => {
  const { orderId, method } = req.body as { orderId: number; method: 'mobile'|'card'|'cod' };
  if (!orderId || !method) return res.status(400).json({ error: { message: 'orderId and method required' } });
  const order = await prisma.order.findUnique({ where: { id: orderId } });
  if (!order) return res.status(404).json({ error: { message: 'Order not found' } });

  // Stripe flow for card payments
  if (method === 'card') {
    if (!env.stripeSecretKey || !env.stripePublicKey) {
      return res.status(500).json({ error: { message: 'Stripe not configured on server' } });
    }
    const amountMinor = Math.max(1, Math.round(order.total * (env.stripeAmountMultiplier || 1)));
    const currency = env.stripeCurrency || 'usd';

    const intent = await stripe.paymentIntents.create({
      amount: amountMinor,
      currency,
      automatic_payment_methods: { enabled: true },
      metadata: {
        orderId: String(order.id),
        orderCode: order.code,
      }
    });

    const payment = await prisma.payment.create({
      data: {
        orderId: order.id,
        method,
        amount: order.total,
        status: 'pending',
        provider: 'stripe',
        providerRef: intent.id,
      }
    });

    return res.status(201).json({
      payment,
      clientSecret: intent.client_secret,
      publishableKey: env.stripePublicKey,
    });
  }

  // Default/mock flow for non-card methods
  const payment = await prisma.payment.create({ data: { orderId: order.id, method, amount: order.total, status: 'pending' } });
  const paymentUrl = `https://pay.malewa-fac.cd/${order.code}`;
  res.status(201).json({ payment, paymentUrl });
}));

// POST /api/v1/payments/webhook (provider)
paymentsRouter.post('/webhook', asyncHandler(async (req: Request, res: Response) => {
  // Mock: body should contain { orderCode, status }
  const { orderCode, status } = req.body as { orderCode?: string; status?: 'succeeded'|'failed'|'refunded' };
  if (!orderCode) return res.status(400).json({ error: { message: 'orderCode required' } });
  const order = await prisma.order.findUnique({ where: { code: orderCode } });
  if (!order) return res.status(404).json({ error: { message: 'Order not found' } });
  const pay = await prisma.payment.findFirst({ where: { orderId: order.id }, orderBy: { id: 'desc' } });
  if (!pay) return res.status(404).json({ error: { message: 'Payment not found' } });

  const updated = await prisma.payment.update({ where: { id: pay.id }, data: { status: (status ?? 'succeeded') as any, paidAt: status === 'succeeded' ? new Date() : undefined } });
  res.json({ ok: true, payment: updated });
}));

// Labyrinthe Mobile Money
// POST /api/v1/payments/mobile/initiate
paymentsRouter.post('/mobile/initiate', asyncHandler(initiateLabyrinthePayment as any));

// POST /api/v1/payments/labyrinthe/webhook (public)
paymentsRouter.post('/labyrinthe/webhook', labyrintheWebhookHandler);

// GET /api/v1/payments/mobile/status?orderNumber=...
paymentsRouter.get('/mobile/status', asyncHandler(mobileStatusHandler as any));

