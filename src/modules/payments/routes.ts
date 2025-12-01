import { Router, Request, Response } from 'express';
import { asyncHandler } from '../../utils/http';
import { prisma } from '../../db/prisma';
import { stripe } from '../../config/stripe';
import { env } from '../../config/env';
import { mokoService } from '../../utils/moko';
import { createOrder } from '../orders/service';
import { notify } from '../../utils/notify';

export const paymentsRouter = Router();

// Helper to get dynamic settings similar to pricing module
async function getSetting(key: string, fallback: number): Promise<number> {
  const s = await prisma.setting.findUnique({ where: { skey: key } });
  return s ? Number(s.svalue) : fallback;
}

/**
 * @swagger
 * /api/v1/payments/cart-intent:
 *   post:
 *     summary: Create payment intent from cart
 *     tags: [Payments]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [restaurantId, items, deliveryMethod]
 *             properties:
 *               restaurantId:
 *                 type: integer
 *               items:
 *                 type: array
 *                 items:
 *                   type: object
 *                   required: [dishId, qty]
 *                   properties:
 *                     dishId:
 *                       type: integer
 *                     qty:
 *                       type: integer
 *               deliveryMethod:
 *                 type: string
 *                 enum: [campus, offcampus, pickup]
 *               estimatedDistanceKm:
 *                 type: number
 *     responses:
 *       201:
 *         description: Intent created
 */
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

/**
 * @swagger
 * /api/v1/payments/intent:
 *   post:
 *     summary: Create payment intent for order
 *     tags: [Payments]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [orderId, method]
 *             properties:
 *               orderId:
 *                 type: integer
 *               method:
 *                 type: string
 *                 enum: [mobile, card, cod]
 *               phoneNumber:
 *                 type: string
 *               provider:
 *                 type: string
 *     responses:
 *       201:
 *         description: Intent created
 */
paymentsRouter.post('/intent', asyncHandler(async (req: Request, res: Response) => {
  const { orderId, method, phoneNumber, provider } = req.body as { orderId: number; method: 'mobile'|'card'|'cod'; phoneNumber?: string; provider?: string };
  if (!orderId || !method) return res.status(400).json({ error: { message: 'orderId and method required' } });
  const order = await prisma.order.findUnique({ where: { id: orderId }, include: { customer: true } });
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

  // Moko (Mobile Money) flow
  if (method === 'mobile') {
    if (!phoneNumber) return res.status(400).json({ error: { message: 'Phone number required for mobile payment' } });
    
    const payment = await prisma.payment.create({
      data: {
        orderId: order.id,
        method,
        amount: order.total,
        status: 'pending',
        provider: 'moko',
        // providerRef set later
      }
    });

    const result = await mokoService.initiateCollection({
        amount: order.total,
        customer_number: phoneNumber,
        reference: `ORD-${order.code}`,
        method: provider, // let mokoService detect if not provided
        firstname: order.customer.name.split(' ')[0],
        lastname: order.customer.name.split(' ')[1] || '',
        email: order.customer.email || undefined
    });

    return res.status(201).json({ 
        payment, 
        message: 'Payment initiated. Check your phone.',
        mokoResponse: result 
    });
  }

  // Default/mock flow for COD
  const payment = await prisma.payment.create({ data: { orderId: order.id, method, amount: order.total, status: 'pending' } });
  res.status(201).json({ payment });
}));

// POST /api/v1/payments/webhook (provider - Stripe/Moko)
paymentsRouter.post('/webhook', asyncHandler(async (req: Request, res: Response) => {
    // Handle Stripe Webhook elsewhere (it's in app.ts)
    // This handler is for generic updates or local tests
    res.json({ ok: true });
}));

/**
 * @swagger
 * /api/v1/payments/mobile/initiate:
 *   post:
 *     summary: Initiate mobile payment (Legacy)
 *     tags: [Payments]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       201:
 *         description: Payment initiated
 */
paymentsRouter.post('/mobile/initiate', asyncHandler(async (req: Request, res: Response) => {
    // Forward to /intent logic manually
    // Legacy payload might differ, but assuming similar fields
    // If legacy used `orderCode`, we need to find ID.
    const { orderCode, orderId, phoneNumber, provider, phone, order: orderBody } = req.body;
    
    let targetPhone = phoneNumber || phone;
    
    let oid = orderId;
    if (!oid && orderBody && orderBody.id) {
        oid = orderBody.id;
    }

    if (!oid && orderCode) {
        const o = await prisma.order.findUnique({ where: { code: orderCode } });
        if (o) oid = o.id;
    } else if (!oid && orderBody && orderBody.code) {
        const o = await prisma.order.findUnique({ where: { code: orderBody.code } });
        if (o) oid = o.id;
    }

    if ((!oid && !orderBody) || !targetPhone) {
        return res.status(400).json({ error: { message: 'orderId (or orderCode or order object) and phoneNumber (or phone) required' } });
    }

    // Reuse Moko flow
    let order;
    
    if (oid) {
        order = await prisma.order.findUnique({ where: { id: Number(oid) }, include: { customer: true } });
    } else if (orderBody) {
        // Create order on the fly
        // Inject user id if available
        const user = (req as any).user;
        const customerUserId = user?.id || orderBody.customerUserId; // fallback to body or logic inside createOrder
        
        try {
            order = await createOrder({
                ...orderBody,
                customerUserId,
                paymentMethod: 'mobile'
            });
            // Fetch full order with customer for Moko
            order = await prisma.order.findUnique({ where: { id: order.id }, include: { customer: true } });
        } catch (e: any) {
             return res.status(400).json({ error: { message: e.message || 'Order creation failed' } });
        }
    }

    if (!order) return res.status(404).json({ error: { message: 'Order not found or creation failed' } });

    const payment = await prisma.payment.create({


      data: {
        orderId: order.id,
        method: 'mobile',
        amount: order.total,
        status: 'pending',
        provider: 'moko',
      }
    });

    const result = await mokoService.initiateCollection({
        amount: order.total,
        customer_number: targetPhone,
        reference: `ORD-${order.code}`,
        method: provider,
        firstname: order.customer.name.split(' ')[0],
        lastname: order.customer.name.split(' ')[1] || '',
        email: order.customer.email || undefined
    });

    return res.status(201).json({ 
        payment, 
        message: 'Payment initiated. Check your phone.',
        mokoResponse: result 
    });
}));

/**
 * @swagger
 * /api/v1/payments/mobile/status:
 *   get:
 *     summary: Check mobile payment status
 *     tags: [Payments]
 *     parameters:
 *       - in: query
 *         name: orderCode
 *         schema:
 *           type: string
 *       - in: query
 *         name: orderId
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Payment status
 */
paymentsRouter.get('/mobile/status', asyncHandler(async (req: Request, res: Response) => {
    const { orderCode, orderId } = req.query as { orderCode?: string; orderId?: string };
    
    let oid = orderId ? Number(orderId) : undefined;
    if (!oid && orderCode) {
        const o = await prisma.order.findUnique({ where: { code: orderCode } });
        if (o) oid = o.id;
    }

    if (!oid) return res.status(400).json({ error: { message: 'orderCode or orderId required' } });

    const payment = await prisma.payment.findFirst({ 
        where: { orderId: oid }, 
        orderBy: { id: 'desc' } 
    });

    res.json({ 
        status: payment?.status || 'pending',
        paidAt: payment?.paidAt,
        payment
    });
}));

// POST /api/v1/payments/moko/webhook
paymentsRouter.post('/moko/webhook', asyncHandler(async (req: Request, res: Response) => {
    const data = req.body;
    // Expected format: { reference, status, ... }
    // Based on Moko docs, check reference to find order/payment
    
    // Docs say response format is JSON
    // Let's assume `reference` matches `ORD-{code}`
    // And status is available
    
    const reference = data.reference;
    if (!reference) return res.status(400).json({ error: 'No reference' });

    // Extract order code
    const orderCode = reference.replace('ORD-', '');
    const order = await prisma.order.findUnique({ where: { code: orderCode } });
    if (!order) return res.status(404).json({ error: 'Order not found' });

    const payment = await prisma.payment.findFirst({ where: { orderId: order.id }, orderBy: { id: 'desc' } });
    if (!payment) return res.status(404).json({ error: 'Payment not found' });

    // Map Moko status to ours
    // Docs: status might be 'successful', 'failed' ? 
    // Using loose match
    let newStatus: 'succeeded'|'failed' = 'failed';
    if (data.status === 'successful' || data.status === 'success' || data.transaction_status === 'successful') {
        newStatus = 'succeeded';
    }

    if (payment.status !== 'succeeded') {
        await prisma.payment.update({
            where: { id: payment.id },
            data: { 
                status: newStatus, 
                paidAt: newStatus === 'succeeded' ? new Date() : undefined,
                providerRef: data.transaction_id || data.id // Save Moko ID if available
            }
        });

        // Notify customer on successful payment
        if (newStatus === 'succeeded') {
             await notify(order.customerUserId, {
                type: 'order.paid',
                title: 'Paiement reçu',
                message: `Votre commande ${order.code} est payée et en attente de confirmation.`,
                data: { orderId: order.id }
            });
        }
    }

    res.json({ status: 'received' });
}));


