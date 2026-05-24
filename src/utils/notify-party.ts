import axios from 'axios';
import { smsService } from './sms';
import { logger } from '../config/logger';

// The Hermes WhatsApp gateway bridge exposes POST /send { chatId, message }.
const BRIDGE_URL = process.env.WHATSAPP_BRIDGE_URL || 'http://127.0.0.1:3099';

function toJid(phone: string): string {
  const digits = String(phone || '').replace(/[^0-9]/g, '');
  return digits ? `${digits}@s.whatsapp.net` : '';
}

/**
 * Notify a party (customer or merchant) about an order.
 *
 * For orders placed through the WhatsApp bot (channel === 'whatsapp') the
 * message is delivered via the WhatsApp bridge so the user is contacted on the
 * same channel they ordered from. On any failure — or for web orders — it
 * falls back to SMS, so notifications are never silently lost.
 */
export async function notifyParty(
  phone: string | null | undefined,
  message: string,
  channel?: string | null,
): Promise<void> {
  if (!phone) return;

  if (channel === 'whatsapp') {
    const jid = toJid(phone);
    if (jid) {
      try {
        await axios.post(`${BRIDGE_URL}/send`, { chatId: jid, message }, { timeout: 8000 });
        return;
      } catch (e: any) {
        logger.warn({ err: e?.message, phone }, 'WhatsApp notify failed; falling back to SMS');
      }
    }
  }

  try {
    await smsService.sendSms(phone, message);
  } catch (e: any) {
    logger.error({ err: e?.message, phone }, 'SMS notify failed');
  }
}
