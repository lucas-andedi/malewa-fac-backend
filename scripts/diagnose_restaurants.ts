
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  console.log('--- DIAGNOSIS: RESTAURANT VISIBILITY ---');
  
  const restaurants = await prisma.restaurant.findMany({
    include: {
      owner: true,
      institutionLinks: {
        include: {
          institution: true
        }
      }
    }
  });

  console.log(`Found ${restaurants.length} total restaurants in database.\n`);

  console.log('ID | Name | Status | isAvailable | Owner | Owner Status | Institutions | PUBLIC VISIBILITY');
  console.log('---|---|---|---|---|---|---|---');

  for (const r of restaurants) {
    const ownerName = r.owner ? r.owner.name : 'NULL (Admin)';
    const ownerStatus = r.owner ? r.owner.status : 'N/A';
    const institutions = r.institutionLinks.map(l => l.institution.code).join(', ');

    // Visibility Logic from routes.ts
    // where: { status: 'active', isAvailable: true, ... OR: [{ownerUserId: null}, {owner: {status: 'active'}}] }
    
    let visible = true;
    let reasons: string[] = [];

    if (r.status !== 'active') {
      visible = false;
      reasons.push(`Status is '${r.status}'`);
    }

    if (!r.isAvailable) {
      visible = false;
      reasons.push(`isAvailable is false`);
    }

    if (r.owner && r.owner.status !== 'active') {
      visible = false;
      reasons.push(`Owner status is '${r.owner.status}'`);
    }

    // Checking Institution Code filter is tricky without context, but we list them.
    if (r.institutionLinks.length === 0) {
        // Technically not hidden by query unless filtering by institution, but important context
        reasons.push('No linked institution'); 
    }

    const visibilityStr = visible ? 'VISIBLE' : `HIDDEN (${reasons.join(', ')})`;
    
    console.log(`${r.id} | ${r.name} | ${r.status} | ${r.isAvailable} | ${ownerName} | ${ownerStatus} | ${institutions} | ${visibilityStr}`);
  }

  console.log('\n--- END DIAGNOSIS ---');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
