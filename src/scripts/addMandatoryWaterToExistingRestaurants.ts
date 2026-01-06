import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  console.log('Ajout du plat Eau obligatoire pour tous les restaurants existants...');

  const restaurants = await prisma.restaurant.findMany();
  console.log(`Restaurants trouvés: ${restaurants.length}`);

  for (const restaurant of restaurants) {
    console.log(`\nRestaurant: ${restaurant.id} - ${restaurant.name}`);

    // Chercher la catégorie Boissons
    const drinksCat = await prisma.dishCategory.findFirst({
      where: { restaurantId: restaurant.id, name: 'Boissons' }
    });

    if (!drinksCat) {
      console.log('  Aucune catégorie "Boissons" trouvée, on saute ce restaurant.');
      continue;
    }

    // Vérifier si Eau existe déjà
    const existingWater = await prisma.dish.findFirst({
      where: { restaurantId: restaurant.id, name: 'Eau' }
    });

    if (existingWater) {
      console.log('  Plat "Eau" existe déjà, on ne fait rien.');
      continue;
    }

    await prisma.dish.create({
      data: {
        restaurantId: restaurant.id,
        name: 'Eau',
        description: 'Eau obligatoire',
        price: 1000,
        available: true,
        categoryId: drinksCat.id,
        isMandatory: true
      }
    });

    console.log('  Plat "Eau" obligatoire créé.');
  }

  console.log('\nTerminé.');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
