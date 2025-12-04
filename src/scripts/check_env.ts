import { env } from '../config/env';
console.log('Current DATABASE_URL:', env.databaseUrl.replace(/:[^:]*@/, ':****@')); // Mask password
