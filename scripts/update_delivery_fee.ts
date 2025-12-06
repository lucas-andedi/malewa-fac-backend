import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  console.log('Updating all restaurants delivery fee to 1000 FC...');
  const result = await prisma.restaurant.updateMany({
    data: {
      deliveryFeeCampus: 1000
    }
  });
  console.log(`Updated ${result.count} restaurants.`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
