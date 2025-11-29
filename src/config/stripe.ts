import Stripe from 'stripe';
import { env } from './env';

let stripeInstance: Stripe;

if (env.stripeSecretKey) {
  stripeInstance = new Stripe(env.stripeSecretKey);
} else {
  const notConfigured = () => {
    throw new Error('Stripe not configured on server');
  };
  stripeInstance = {
    paymentIntents: { create: notConfigured as any, retrieve: notConfigured as any } as any,
    webhooks: { constructEvent: notConfigured as any } as any,
  } as unknown as Stripe;
}

export const stripe = stripeInstance;
