import { prisma } from '../db/prisma';

async function main() {
  console.log('Fixing database schema...');
  try {
    // Add isFlexiblePrice column
    console.log('Adding isFlexiblePrice...');
    try {
      await prisma.$executeRawUnsafe(`
        ALTER TABLE Dish 
        ADD COLUMN isFlexiblePrice BOOLEAN NOT NULL DEFAULT false;
      `);
      console.log('isFlexiblePrice added.');
    } catch (e: any) {
      if (e.message.includes('Duplicate column')) {
        console.log('isFlexiblePrice already exists.');
      } else {
        console.error('Error adding isFlexiblePrice:', e.message);
      }
    }

    // Add minPrice column
    console.log('Adding minPrice...');
    try {
      await prisma.$executeRawUnsafe(`
        ALTER TABLE Dish 
        ADD COLUMN minPrice INTEGER DEFAULT 0;
      `);
      console.log('minPrice added.');
    } catch (e: any) {
      if (e.message.includes('Duplicate column')) {
        console.log('minPrice already exists.');
      } else {
        console.error('Error adding minPrice:', e.message);
      }
    }

  } catch (error) {
    console.error('Detailed error:', error);
  } finally {
    await prisma.$disconnect();
  }
}

main();
