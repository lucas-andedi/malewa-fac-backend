import express from 'express';
import helmet from 'helmet';
import morgan from 'morgan';
import { corsMiddleware } from './config/cors';
import { errorHandler } from './middlewares/error';
import { authOptional } from './middlewares/auth';
import { authLimiter } from './middlewares/rateLimit';

// Routers
import { healthRouter } from './modules/health/routes';
import { institutionsRouter } from './modules/institutions/routes';
import { restaurantsRouter } from './modules/restaurants/routes';
import { pricingRouter } from './modules/pricing/routes';
import { ordersRouter } from './modules/orders/routes';
import { authRouter } from './modules/auth/routes';
import { dishesRouter } from './modules/dishes/routes';
import { missionsRouter } from './modules/missions/routes';
import { paymentsRouter } from './modules/payments/routes';
import { transactionsRouter } from './modules/transactions/routes';
import { adminRouter } from './modules/admin/routes';
import { stripeWebhookHandler } from './modules/payments/stripeWebhook';
import { notificationsRouter } from './modules/notifications/routes';

export const app = express();

app.use(helmet());
app.use(corsMiddleware);
// Stripe webhook must use raw body and be registered BEFORE express.json
app.post('/api/v1/payments/stripe/webhook', express.raw({ type: 'application/json' }), stripeWebhookHandler);
app.use(express.json());
app.use(morgan('dev'));
app.use(authOptional);

// Auth endpoints (prefix with /api/v1 to be consistent with frontend API base)
app.use('/api/v1/auth', authLimiter, authRouter);

// Routes
app.use('/health', healthRouter);
app.use('/api/v1/institutions', institutionsRouter);
app.use('/api/v1/restaurants', restaurantsRouter);
app.use('/api/v1/dishes', dishesRouter);
app.use('/api/v1/pricing', pricingRouter);
app.use('/api/v1/orders', ordersRouter);
app.use('/api/v1/missions', missionsRouter);
app.use('/api/v1/payments', paymentsRouter);
app.use('/api/v1/notifications', notificationsRouter);
app.use('/api/v1/transactions', transactionsRouter);
app.use('/api/v1/admin', adminRouter);

// Error handler
app.use(errorHandler);
