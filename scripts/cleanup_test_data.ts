
/// <reference types="node" />

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  console.log('Starting cleanup of test data...');

  try {
    await prisma.$transaction(async (tx) => {
      // 1. Delete Transactions (depend on Order)
      const deletedTransactions = await tx.transaction.deleteMany({});
      console.log(`Deleted ${deletedTransactions.count} transactions`);

      // 2. Delete Payments (depend on Order)
      const deletedPayments = await tx.payment.deleteMany({});
      console.log(`Deleted ${deletedPayments.count} payments`);

      // 3. Delete Delivery Missions (depend on Order)
      const deletedMissions = await tx.deliveryMission.deleteMany({});
      console.log(`Deleted ${deletedMissions.count} delivery missions`);

      // 4. Delete Order Items (depend on Order) - OrderItemOptions cascade delete from OrderItem
      const deletedOrderItems = await tx.orderItem.deleteMany({});
      console.log(`Deleted ${deletedOrderItems.count} order items`);

      // 5. Delete Orders
      const deletedOrders = await tx.order.deleteMany({});
      console.log(`Deleted ${deletedOrders.count} orders`);
    });

    console.log('Cleanup completed successfully.');
  } catch (error) {
    console.error('Error during cleanup:', error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

main();
