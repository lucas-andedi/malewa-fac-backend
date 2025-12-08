import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

async function main() {
  const userId = 16; // King chris
  const u = await prisma.user.findUnique({ 
    where: { id: userId },
    include: {
      managedRestaurants: {
        include: { restaurant: { select: { id: true, name: true, photoUrl: true, address: true } } }
      }
    }
  });

  const response = {
    ...u,
    managedRestaurants: u?.managedRestaurants.map((r: any) => r.restaurant) || []
  };

  console.log(JSON.stringify(response, null, 2));
}

main()
  .catch(e => console.error(e))
  .finally(async () => {
    await prisma.$disconnect();
  });
