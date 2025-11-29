import dotenv from 'dotenv';
dotenv.config();

export const env = {
  nodeEnv: process.env.NODE_ENV || 'development',
  port: Number(process.env.PORT || 4000),
  databaseUrl: process.env.DATABASE_URL || 'mysql://root:root@localhost:3306/malewa_fac',
  corsOrigin: process.env.CORS_ORIGIN || 'http://localhost:5173',
  jwtSecret: process.env.JWT_SECRET || 'dev_secret',
  jwtExpiresIn: process.env.JWT_EXPIRES_IN || '15m',
  refreshJwtSecret: process.env.REFRESH_JWT_SECRET || 'dev_refresh_secret',
  refreshExpiresIn: process.env.REFRESH_EXPIRES_IN || '7d',
  logLevel: (process.env.LOG_LEVEL || 'info') as 'fatal'|'error'|'warn'|'info'|'debug'|'trace',
  // Stripe configuration
  stripePublicKey: process.env.STRIPE_PUBLIC_KEY || '',
  stripeSecretKey: process.env.STRIPE_SECRET_KEY || '',
  stripeWebhookSecret: process.env.STRIPE_WEBHOOK_SECRET || '',
  stripeCurrency: (process.env.STRIPE_CURRENCY || 'usd').toLowerCase(),
  stripeAmountMultiplier: Number(process.env.STRIPE_AMOUNT_MULTIPLIER || 1),
  // Application public base URL (for webhooks)
  appUrl: process.env.APP_URL || 'http://localhost:4000',
  // Labyrinthe Mobile Money configuration
  labyrintheApiUrl: process.env.LABYRINTHE_API_URL || '',
  labyrintheToken: process.env.LABYRINTHE_TOKEN || '',
  labyrintheCountry: process.env.LABYRINTHE_COUNTRY || 'CD',
  labyrintheCurrency: process.env.LABYRINTHE_CURRENCY || 'CDF',
  // DigitalOcean Spaces
  doSpacesEndpoint: process.env.DO_SPACES_ENDPOINT || '',
  doSpacesKey: process.env.DO_SPACES_KEY || '',
  doSpacesSecret: process.env.DO_SPACES_SECRET || '',
  doSpacesBucket: process.env.DO_SPACES_BUCKET || '',
  doSpacesRegion: process.env.DO_SPACES_REGION || 'sfo3',
  // Moko Afrika
  mokoBaseUrl: process.env.MOKO_BASE_URL || 'https://paydrc.gofreshbakery.net/api/v5',
  mokoMerchantId: process.env.MOKO_MERCHANT_ID || '',
  mokoMerchantSecret: process.env.MOKO_MERCHANT_SECRET || '',
};

