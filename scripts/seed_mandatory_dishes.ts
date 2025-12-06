import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  console.log('Checking for missing "Accessoires" category and mandatory "Assiette" dish for all restaurants...');
  
  const restaurants = await prisma.restaurant.findMany({
    include: {
      categories: true,
      dishes: true
    }
  });

  console.log(`Found ${restaurants.length} restaurants.`);

  for (const r of restaurants) {
    let accessoriesCat = r.categories.find(c => c.name === 'Accessoires');
    
    if (!accessoriesCat) {
      console.log(`Creating "Accessoires" category for ${r.name}...`);
      // Find max display order
      const maxOrder = r.categories.reduce((max, c) => Math.max(max, c.displayOrder), -1);
      
      accessoriesCat = await prisma.dishCategory.create({
        data: {
          restaurantId: r.id,
          name: 'Accessoires',
          displayOrder: maxOrder + 1
        }
      });
    } else {
      console.log(`"Accessoires" category already exists for ${r.name}.`);
    }

    // Check if Assiette exists in this category (or any mandatory dish named Assiette)
    const assiette = r.dishes.find(d => d.name === 'Assiette' && d.categoryId === accessoriesCat!.id);

    if (!assiette) {
      console.log(`Creating mandatory "Assiette" for ${r.name}...`);
      await prisma.dish.create({
        data: {
          restaurantId: r.id,
          name: 'Assiette',
          description: 'Assiette jetable obligatoire',
          price: 1000,
          available: true,
          categoryId: accessoriesCat!.id,
          isMandatory: true
        }
      });
    } else {
      // Ensure it is mandatory and price is correct if it exists
      if (!assiette.isMandatory) {
        console.log(`Updating "Assiette" to be mandatory for ${r.name}...`);
        await prisma.dish.update({
          where: { id: assiette.id },
          data: { isMandatory: true }
        });
      } else {
        console.log(`"Assiette" is already set up for ${r.name}.`);
      }
    }
  }
  
  console.log('Done.');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
