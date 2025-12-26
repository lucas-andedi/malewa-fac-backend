import { OrderStatus, Prisma } from '@prisma/client';
import { prisma } from '../../db/prisma';
import { CreateOrderInput } from './dto';
import { AppError } from '../../utils/http';
import { smsService } from '../../utils/sms';
import { notify } from '../../utils/notify';
import { logger } from '../../config/logger';
import { getFees } from '../../utils/settings';
import { applyPromoCodeToOrder, applyVoucherToOrder } from '../promo/routes';

export async function createOrder(input: CreateOrderInput) {
  const { customerUserId, items, restaurantId, deliveryMethod, paymentMethod, notes, address, estimatedDistanceKm, promoCode, voucherCode } = input;

  // Ensure customer exists
  if (!customerUserId) {
    throw new AppError('User ID is required for order', 400);
  }
  const customer = await prisma.user.findUnique({ where: { id: customerUserId } });
  if (!customer) throw new AppError('Customer not found', 404);

  // Ensure restaurant exists
  const restaurant = await prisma.restaurant.findUnique({ where: { id: restaurantId } });
  if (!restaurant) throw new AppError('Restaurant not found', 404);

  // Calculate totals and validate items
  let subtotal = 0;
  const orderItemsData: any[] = [];

  for (const item of items) {
    const dish = await prisma.dish.findUnique({ where: { id: item.dishId } });
    if (!dish) throw new AppError(`Dish ${item.dishId} not found`, 400);
    if (dish.restaurantId !== restaurantId) throw new AppError(`Dish ${dish.name} does not belong to this restaurant`, 400);
    
    // Custom price validation: must be >= dish price
    const finalPrice = (item.customPrice && item.customPrice > dish.price) ? item.customPrice : dish.price;
    
    subtotal += finalPrice * item.qty;
    orderItemsData.push({
      dishId: dish.id,
      name: dish.name,
      price: dish.price, // Base price
      customPrice: finalPrice !== dish.price ? finalPrice : null, // Store custom price if different
      qty: item.qty
    });
  }

  const fees = await getFees({ method: deliveryMethod, km: estimatedDistanceKm });
  const serviceFee = fees.SERVICE_FEE;
  const deliveryFee = fees.deliveryFee;

  let totalBeforeDiscount = subtotal + serviceFee + deliveryFee;
  let discount = 0;

  // Transaction
  const order = await prisma.$transaction(async (tx) => {
    // Create Order
    const newOrder = await tx.order.create({
      data: {
        code: `ORD-${Date.now().toString().slice(-6)}`, // Simple code gen
        customerUserId,
        customerName: input.customerName,
        restaurantId,
        subtotal,
        serviceFee,
        deliveryFee,
        deliveryMethod,
        paymentMethod,
        total: totalBeforeDiscount, // Will be updated after voucher
        discount: 0,
        promoCodeUsed: promoCode?.toUpperCase() || null,
        voucherUsed: voucherCode?.toUpperCase() || null,
        address,
        notes,
        estimatedDistanceKm,
        status: 'pending_confirmation' as any, // Initial status
        items: {
            create: orderItemsData
        },
        transactions: {
            create: {
                beneficiary: 'merchant',
                amount: subtotal,
                netAmount: subtotal, // minus commission?
                status: 'pending'
            }
        }
      },
      include: { items: true }
    });

    return newOrder;
  });

  // Apply promo code after order creation (gives point to owner)
  if (promoCode) {
    try {
      const promoResult = await applyPromoCodeToOrder(promoCode, order.id, customerUserId);
      if (!promoResult.success) {
        logger.warn({ promoCode, error: promoResult.error }, 'Promo code application failed');
      }
    } catch (e) {
      logger.error({ err: e, promoCode }, 'Error applying promo code');
    }
  }

  // Apply voucher (gives discount)
  if (voucherCode) {
    try {
      const voucherResult = await applyVoucherToOrder(voucherCode, order.id, customerUserId, totalBeforeDiscount);
      if (voucherResult.success && voucherResult.discount) {
        discount = voucherResult.discount;
        const newTotal = totalBeforeDiscount - discount;
        // Update order with discount
        await prisma.order.update({
          where: { id: order.id },
          data: { discount, total: newTotal }
        });
        (order as any).discount = discount;
        (order as any).total = newTotal;
      } else if (!voucherResult.success) {
        logger.warn({ voucherCode, error: voucherResult.error }, 'Voucher application failed');
      }
    } catch (e) {
      logger.error({ err: e, voucherCode }, 'Error applying voucher');
    }
  }

  // Notifications
  try {
    // 1. Notify Dispatchers/Admins via SMS
    // Find admins and dispatchers
    const dispatchers = await prisma.user.findMany({
        where: { 
            role: { in: ['admin', 'superadmin', 'dispatcher'] as any },
            status: 'active'
        }
    });

    const deliveryLabel = order.deliveryMethod === 'pickup' ? 'Sur place' : order.deliveryMethod === 'campus' ? 'Campus' : 'Hors campus';

    for (const d of dispatchers) {
        if (d.phone) {
            await smsService.sendSms(d.phone, `Malewa-Fac: Nouvelle commande ${order.code} à confirmer. Client: ${order.customerName}. Total: ${order.total} FC. Mode: ${deliveryLabel}.`);
        }
    }

    // 2. Notify Customer
    if (customer.phone) {
        // Maybe just push notification?
        await notify(customer.id, {
            type: 'order.created',
            title: 'Commande reçue',
            message: `Votre commande ${order.code} est en attente de confirmation par nos services.`,
            data: { orderId: order.id }
        });
    }

  } catch (error) {
    logger.error({ err: error }, 'Failed to send order notifications');
  }

  return order;
}
