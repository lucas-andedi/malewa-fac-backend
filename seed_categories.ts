import { PrismaClient } from '@prisma/client';
import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.join(__dirname, '.env') });

const prisma = new PrismaClient();

const DEFAULTS = [
  { name: 'Plats Principaux', order: 0 },
  { name: 'Accompagnements', order: 1 },
  { name: 'Sauces', order: 2 },
  { name: 'Boissons', order: 3 }
];

async function main() {
  const restaurants = await prisma.restaurant.findMany();
  console.log(`Found ${restaurants.length} restaurants.`);

  for (const r of restaurants) {
    console.log(`Processing ${r.name}...`);
    for (const def of DEFAULTS) {
      const exists = await prisma.dishCategory.findFirst({
        where: { restaurantId: r.id, name: def.name }
      });
      if (!exists) {
        await prisma.dishCategory.create({
          data: {
            restaurantId: r.id,
            name: def.name,
            displayOrder: def.order
          }
        });
        console.log(`  Created ${def.name}`);
      }
    }
  }
}

main()
  .catch(e => console.error(e))
  .finally(async () => {
    await prisma.$disconnect();
  });
