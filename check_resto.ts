import { PrismaClient } from '@prisma/client';
import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.join(__dirname, '.env') });

const prisma = new PrismaClient();

async function main() {
  const r = await prisma.restaurant.findFirst({
    where: { name: { contains: 'Jo Loboko' } },
    include: { owner: true, institutionLinks: { include: { institution: true } } }
  });
  console.log(JSON.stringify(r, null, 2));
}

main()
  .catch(e => console.error(e))
  .finally(async () => {
    await prisma.$disconnect();
  });
