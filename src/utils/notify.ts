import { prisma } from '../db/prisma';

export type NotificationPayload = {
  type: string;
  title: string;
  message?: string;
  data?: any;
};

export async function notify(userId: number, payload: NotificationPayload, tx?: any) {
  const client: any = tx ?? (prisma as any);
  try {
    await client.notification.create({
      data: {
        userId,
        type: payload.type,
        title: payload.title,
        message: payload.message,
        data: payload.data as any,
      }
    });
  } catch (e) {
    // best-effort: do not throw
    // eslint-disable-next-line no-console
    console.warn('notify failed', e);
  }
}
