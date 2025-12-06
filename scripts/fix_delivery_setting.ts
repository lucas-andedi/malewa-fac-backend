import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  const setting = await prisma.setting.findUnique({
    where: { skey: 'CAMPUS_DELIVERY_FEE' }
  });
  console.log('Current CAMPUS_DELIVERY_FEE setting:', setting);
  
  if (!setting || setting.svalue !== '1000') {
    console.log('Updating CAMPUS_DELIVERY_FEE to 1000...');
    await prisma.setting.upsert({
      where: { skey: 'CAMPUS_DELIVERY_FEE' },
      update: { svalue: '1000' },
      create: { skey: 'CAMPUS_DELIVERY_FEE', svalue: '1000' }
    });
    console.log('Updated.');
  } else {
    console.log('Already 1000.');
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
