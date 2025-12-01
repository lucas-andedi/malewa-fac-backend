import { getSetting } from './settings';
import { prisma } from '../db/prisma';

export async function computeCommission(deliveryFee: number) {
  const SERVICE_FEE = await getSetting('SERVICE_FEE', 1000);
  const commission = SERVICE_FEE + Math.round((deliveryFee || 0) * 0.1);
  return { SERVICE_FEE, commission };
}

export async function ensureMerchantAndCourierTransactions(orderId: number) {
  const order = await prisma.order.findUnique({ where: { id: orderId } });
  if (!order) throw new Error('order not found');

  const { commission } = await computeCommission(order.deliveryFee);

  // Merchant payout (amount = total, commission as computed)
  const existingMerchant = await prisma.transaction.findFirst({ where: { orderId: order.id, beneficiary: 'merchant' } });
  if (!existingMerchant) {
<<<<<<< HEAD
    await prisma.transaction.create({ data: { orderId: order.id, beneficiary: 'merchant', amount: order.total, commission, netAmount: order.total - commission, status: 'pending' } });
=======
    await prisma.transaction.create({ 
      data: { 
        orderId: order.id, 
        beneficiary: 'merchant', 
        amount: order.total, 
        commission, 
        netAmount: order.total - commission,
        status: 'pending' 
      } 
    });
>>>>>>> 1e565ad9009a3a406626d680bc28bf35b9860e28
  }

  // Courier payout (amount = mission earning)
  const mission = await prisma.deliveryMission.findFirst({ where: { orderId: order.id } });
  if (mission) {
    const existingCourier = await prisma.transaction.findFirst({ where: { orderId: order.id, beneficiary: 'courier' } });
    if (!existingCourier) {
<<<<<<< HEAD
      await prisma.transaction.create({ data: { orderId: order.id, beneficiary: 'courier', amount: mission.earning, commission: 0, netAmount: mission.earning, status: 'pending' } });
=======
      await prisma.transaction.create({ 
        data: { 
          orderId: order.id, 
          beneficiary: 'courier', 
          amount: mission.earning, 
          commission: 0, 
          netAmount: mission.earning,
          status: 'pending' 
        } 
      });
>>>>>>> 1e565ad9009a3a406626d680bc28bf35b9860e28
    }
  }
}
