// src/utils/finance.ts

import { prisma } from '../prisma/client'; // Assuming you import your Prisma client

/**
 * Calculates the total net amount for an order based on commissions.
 * @param grossAmount - The total amount charged to the customer.
 * @param commissionRate - The platform's commission rate (e.g., 0.15 for 15%).
 * @returns The net amount after commission.
 */
export const calculateNetAmount = (grossAmount: number, commissionRate: number): number => {
  const netAmount = grossAmount * (1 - commissionRate);
  return parseFloat(netAmount.toFixed(2));
};

/**
 * Creates a transaction record for a courier's mission earnings.
 * (This is where the conflicting code would likely reside)
 */
export const createCourierTransaction = async (order: any, mission: any) => {
  // Check if a transaction already exists for this courier/order
  const existingCourier = await prisma.transaction.findFirst({ 
    where: { 
      orderId: order.id, 
      beneficiary: 'courier' 
    } 
  });

  if (!existingCourier) {
    // RESOLVED CONFLICT CODE BLOCK
    await prisma.transaction.create({
      data: {
        orderId: order.id,
        beneficiary: 'courier',
        amount: mission.earning,
        commission: 0, // Assuming courier commission is handled differently or is 0 here
        netAmount: mission.earning,
        status: 'pending'
      }
    });
    // END RESOLVED CONFLICT
  }

  // You might have other transaction logic here (e.g., for the platform)
  // ...
};

// ... other finance-related utilities
