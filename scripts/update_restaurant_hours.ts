
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  console.log('--- UPDATING RESTAURANT HOURS ---');
  console.log('Target: Opening 10:00, Closing 15:00');

  const result = await prisma.restaurant.updateMany({
    data: {
      openingTime: '10:00',
      closingTime: '15:00'
    }
  });

  console.log(`Updated ${result.count} restaurants.`);
  console.log('--- DONE ---');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
