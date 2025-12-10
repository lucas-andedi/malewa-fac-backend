import { OrderStatus, Prisma } from '@prisma/client';
import { prisma } from '../../db/prisma';
import { CreateOrderInput } from './dto';
import { AppError } from '../../utils/http';
import { smsService } from '../../utils/sms';
import { notify } from '../../utils/notify';
import { logger } from '../../config/logger';
import { getFees } from '../../utils/settings';

export async function createOrder(input: CreateOrderInput) {
  const { customerUserId, items, restaurantId, deliveryMethod, paymentMethod, notes, address, estimatedDistanceKm } = input;

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

  const total = subtotal + serviceFee + deliveryFee;

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
        total,
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

    for (const d of dispatchers) {
        if (d.phone) {
            await smsService.sendSms(d.phone, `Malewa-Fac: Nouvelle commande ${order.code} à confirmer. Client: ${order.customerName}. Total: ${order.total} FC.`);
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
