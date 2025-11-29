"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
// @ts-nocheck
const client_1 = require("@prisma/client");
const bcryptjs_1 = __importDefault(require("bcryptjs"));
const prisma = new client_1.PrismaClient();
async function main() {
    const passwordHash = await bcryptjs_1.default.hash('password123', 10);
    // Institutions
    const unikin = await prisma.institution.upsert({
        where: { code: 'unikin' },
        update: {},
        create: { code: 'unikin', name: 'UNIKIN - Université de Kinshasa' },
    });
    const upn = await prisma.institution.upsert({
        where: { code: 'upn' },
        update: {},
        create: { code: 'upn', name: 'UPN - Université Pédagogique Nationale' },
    });
    // Users
    const client = await prisma.user.upsert({
        where: { email: 'client@demo.local' },
        update: { passwordHash, status: 'active' },
        create: { name: 'Demo Client', email: 'client@demo.local', role: 'client', status: 'active', institutionId: unikin.id, passwordHash },
    });
    await prisma.user.upsert({
        where: { email: 'merchant@demo.local' },
        update: { passwordHash, status: 'active' },
        create: { name: 'Demo Merchant', email: 'merchant@demo.local', role: 'merchant', status: 'active', institutionId: unikin.id, passwordHash },
    });
    await prisma.user.upsert({
        where: { email: 'courier@demo.local' },
        update: { passwordHash, status: 'active' },
        create: { name: 'Demo Courier', email: 'courier@demo.local', role: 'courier', status: 'active', passwordHash },
    });
    await prisma.user.upsert({
        where: { email: 'admin@demo.local' },
        update: { passwordHash, status: 'active' },
        create: { name: 'Admin', email: 'admin@demo.local', role: 'admin', status: 'active', passwordHash },
    });
    // Restaurants
    const r1 = await prisma.restaurant.upsert({
        where: { code: 'r1' },
        update: {},
        create: {
            code: 'r1', name: 'Chez Maman Marie', institutionId: unikin.id, deliveryFeeCampus: 2000,
            photoUrl: 'https://images.pexels.com/photos/1640777/pexels-photo-1640777.jpeg?auto=compress&cs=tinysrgb&w=800',
        },
    });
    const r2 = await prisma.restaurant.upsert({
        where: { code: 'r2' },
        update: {},
        create: {
            code: 'r2', name: 'Kinga Fast', institutionId: upn.id, deliveryFeeCampus: 2000,
            photoUrl: 'https://images.pexels.com/photos/1640777/pexels-photo-1640777.jpeg?auto=compress&cs=tinysrgb&w=800',
        },
    });
    const r3 = await prisma.restaurant.upsert({
        where: { code: 'r3' },
        update: {},
        create: {
            code: 'r3', name: 'Campus Grill', institutionId: unikin.id, deliveryFeeCampus: 2000,
            photoUrl: 'https://images.pexels.com/photos/410648/pexels-photo-410648.jpeg?auto=compress&cs=tinysrgb&w=800',
        },
    });
    // Dishes
    await prisma.dish.upsert({ where: { code: 'd1' }, update: {}, create: { code: 'd1', restaurantId: r1.id, name: 'Pondu + Riz', description: 'Feuilles de manioc avec riz', price: 3000, photoUrl: 'https://images.pexels.com/photos/616354/pexels-photo-616354.jpeg?auto=compress&cs=tinysrgb&w=800' } });
    await prisma.dish.upsert({ where: { code: 'd2' }, update: {}, create: { code: 'd2', restaurantId: r1.id, name: 'Saka Saka + Fufu', description: 'Saka saka traditionnel', price: 3500 } });
    await prisma.dish.upsert({ where: { code: 'd3' }, update: {}, create: { code: 'd3', restaurantId: r1.id, name: 'Chikwangue + Poisson', description: 'Poisson grillé et chikwangue', price: 4500 } });
    await prisma.dish.upsert({ where: { code: 'd4' }, update: {}, create: { code: 'd4', restaurantId: r2.id, name: 'Sandwich Kinga', description: 'Sandwich poulet croustillant', price: 4000 } });
    await prisma.dish.upsert({ where: { code: 'd5' }, update: {}, create: { code: 'd5', restaurantId: r2.id, name: 'Frites + Saucisse', description: 'Frites dorées et saucisse', price: 2500 } });
    await prisma.dish.upsert({ where: { code: 'd6' }, update: {}, create: { code: 'd6', restaurantId: r3.id, name: 'Brochettes de boeuf', description: 'Brochettes grillées', price: 5000 } });
    await prisma.dish.upsert({ where: { code: 'd7' }, update: {}, create: { code: 'd7', restaurantId: r3.id, name: 'Poulet braisé', description: 'Poulet mariné braisé', price: 5500 } });
    // Settings
    await prisma.setting.createMany({
        data: [
            { skey: 'SERVICE_FEE', svalue: '1000' },
            { skey: 'CAMPUS_DELIVERY_FEE', svalue: '2000' },
            { skey: 'OFF_CAMPUS_RATE_PER_KM', svalue: '500' },
            { skey: 'OFF_CAMPUS_MIN_FEE', svalue: '2000' },
        ],
        skipDuplicates: true,
    });
    console.log('Seed completed');
}
main().catch((e) => {
    console.error(e);
    process.exit(1);
}).finally(async () => {
    await prisma.$disconnect();
});
