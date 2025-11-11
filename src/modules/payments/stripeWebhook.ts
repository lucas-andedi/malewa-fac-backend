import { Request, Response } from 'express';
import { stripe } from '../../config/stripe';
import { env } from '../../config/env';
import { prisma } from '../../db/prisma';

export async function stripeWebhookHandler(req: Request, res: Response) {
  const sig = req.headers['stripe-signature'];
  if (!sig) return res.status(400).send('Missing Stripe-Signature header');
  if (!env.stripeWebhookSecret) return res.status(500).send('Stripe webhook not configured');

  const payload = req.body as Buffer; // express.raw set in app.ts

  let event: any;
  try {
    event = stripe.webhooks.constructEvent(payload, sig as string, env.stripeWebhookSecret);
  } catch (err: any) {
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }

  try {
    switch (event.type) {
      case 'payment_intent.succeeded': {
        const intent = event.data.object as { id: string; metadata?: any };
        await prisma.payment.updateMany({
          where: { provider: 'stripe', providerRef: intent.id },
          data: { status: 'succeeded', paidAt: new Date() }
        });
        break;
      }
      case 'payment_intent.payment_failed': {
        const intent = event.data.object as { id: string };
        await prisma.payment.updateMany({
          where: { provider: 'stripe', providerRef: intent.id },
          data: { status: 'failed' }
        });
        break;
      }
      case 'charge.refunded':
      case 'charge.refund.updated':
      case 'refund.succeeded': {
        // Optionally mark payment as refunded if the underlying PI is known
        const charge = event.data.object as any;
        const paymentIntentId = charge.payment_intent as string | undefined;
        if (paymentIntentId) {
          await prisma.payment.updateMany({
            where: { provider: 'stripe', providerRef: paymentIntentId },
            data: { status: 'refunded' }
          });
        }
        break;
      }
      default:
        // Unhandled event type
        break;
    }
  } catch (err) {
    // Do not retry endlessly; acknowledge but log
    return res.status(200).json({ received: true, note: 'processing error ignored' });
  }

  return res.status(200).json({ received: true });
}
