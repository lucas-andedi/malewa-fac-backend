import { prisma } from '../db/prisma';

async function main() {
  try {
    const columns: any[] = await prisma.$queryRaw`SHOW COLUMNS FROM Dish`;
    console.log('Dish Columns:', columns.map(c => c.Field));
  } catch (e) {
    console.error(e);
  } finally {
    await prisma.$disconnect();
  }
}
main();
