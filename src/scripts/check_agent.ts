import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

async function main() {
  const agents = await prisma.user.findMany({
    where: { role: 'agent' },
    include: {
      managedRestaurants: {
        include: { restaurant: true }
      }
    }
  });

  console.log('Agents found:', agents.length);
  agents.forEach(a => {
    console.log(`Agent: ${a.name} (ID: ${a.id})`);
    console.log('Managed Restaurants:', a.managedRestaurants.map(mr => mr.restaurant.name).join(', '));
    console.log('-------------------');
  });
}

main()
  .catch(e => console.error(e))
  .finally(async () => {
    await prisma.$disconnect();
  });
