import { prisma } from '../db/prisma';

async function main() {
  try {
    const tables: any[] = await prisma.$queryRaw`SHOW TABLES`;
    console.log('Tables:', tables.map(t => Object.values(t)[0]));
  } catch (e) {
    console.error(e);
  } finally {
    await prisma.$disconnect();
  }
}
main();
