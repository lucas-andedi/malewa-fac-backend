import { prisma } from '../../db/prisma';
import { CreateOrderInput } from './dto';
import { generateOrderCode } from '../../utils/id';
import { stripe } from '../../config/stripe';
import { notify } from '../../utils/notify';

async function getSetting(key: string, fallback: number): Promise<number> {
  const s = await prisma.setting.findUnique({ where: { skey: key } });
  return s ? Number(s.svalue) : fallback;
}

export async function createOrder(input: CreateOrderInput) {
  const { restaurantId, items, deliveryMethod, paymentMethod, address, estimatedDistanceKm, customerName, paymentIntentId } = input;

  // fetch dishes and validate single-restaurant constraint
  const dishIds = items.map((i: { dishId: number; qty: number }) => i.dishId);
  const dishes = await prisma.dish.findMany({ where: { id: { in: dishIds }, restaurantId: restaurantId } });
  if (dishes.length !== items.length) throw Object.assign(new Error('Invalid items'), { status: 400 });

  const subtotal = items.reduce((s: number, i: { dishId: number; qty: number }) => {
    const d = dishes.find((x) => x.id === i.dishId)!;
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

  const code = generateOrderCode();

  // fallback customer user
  let customerUserId = input.customerUserId;
  if (!customerUserId) {
    const demo = await prisma.user.findFirst({ where: { email: 'client@demo.local' } });
    if (!demo) throw Object.assign(new Error('No customer provided and demo user missing'), { status: 400 });
    customerUserId = demo.id;
  }

  const created = await prisma.$transaction(async (tx) => {
    const order = await tx.order.create({
      data: {
        code,
        customerUserId: customerUserId!,
        customerName,
        restaurantId,
        subtotal,
        serviceFee: SERVICE_FEE,
        deliveryMethod,
        deliveryFee,
        total,
        paymentMethod,
        address,
        estimatedDistanceKm: estimatedDistanceKm || null,
        items: {
          create: items.map((i: { dishId: number; qty: number }) => {
            const d = dishes.find((x) => x.id === i.dishId)!;
            return { dishId: d.id, name: d.name, price: d.price, qty: i.qty };
          })
        }
      },
      include: { items: true }
    });
    // If pay-first with Stripe, verify the payment intent status and attach a Payment record
    if (paymentMethod === 'card' && paymentIntentId) {
      try {
        const pi = await stripe.paymentIntents.retrieve(paymentIntentId);
        const st = pi.status;
        if (!(st === 'succeeded' || st === 'requires_capture' || st === 'processing')) {
          throw Object.assign(new Error('Payment not confirmed'), { status: 400 });
        }
        await tx.payment.create({
          data: {
            orderId: order.id,
            method: 'card',
            provider: 'stripe',
            providerRef: paymentIntentId,
            amount: total,
            status: st === 'succeeded' ? 'succeeded' : 'pending',
            paidAt: st === 'succeeded' ? new Date() : null,
          }
        });
      } catch (e) {
        // If verification fails, abort order creation
        throw e;
      }
    }
    // Create financial transactions (Pending until payout/completion)
    // 1. Merchant Transaction
    const COMMISSION_RATE = 0.10; // 10% commission
    const commission = Math.round(subtotal * COMMISSION_RATE);
    const merchantNet = subtotal - commission;
    
    await tx.transaction.create({
      data: {
        orderId: order.id,
        beneficiary: 'merchant',
        amount: subtotal,
        commission: commission,
        netAmount: merchantNet,
        status: 'pending'
      }
    });

    // 2. Courier Transaction (if delivery fee > 0)
    if (deliveryFee > 0) {
      await tx.transaction.create({
        data: {
          orderId: order.id,
          beneficiary: 'courier',
          amount: deliveryFee,
          commission: 0,
          netAmount: deliveryFee, // Courier gets full delivery fee
          status: 'pending'
        }
      });
    }

    // Notifications (best-effort)
    try {
      await notify(customerUserId!, {
        type: 'order.created',
        title: `Commande ${code} reçue`,
        message: `Votre commande a été reçue par le restaurant. Total: ${total} FC.`,
        data: { orderCode: code, orderId: order.id }
      }, tx);
      const resto = await tx.restaurant.findUnique({ where: { id: restaurantId } });
      if (resto?.ownerUserId) {
        await notify(resto.ownerUserId, {
          type: 'order.new_for_restaurant',
          title: `Nouvelle commande ${code}`,
          message: `${customerName} a passé une commande. Total: ${total} FC.`,
          data: { orderId: order.id }
        }, tx);
      }
    } catch {}
    return order;
  });

  return created;
}
