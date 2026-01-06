import axios from 'axios';
import { logger } from '../config/logger';
import { env } from '../config/env';

class SmsService {
  private readonly smsUser = env.smsUser;
  private readonly smsPassword = env.smsPassword;
  private readonly smsSender = env.smsSender;
  private readonly smsApiUrl = env.smsApiUrl;

  private formatPhone(phone: string): string {
    // Remove spaces and +
    let clean = phone.replace(/[\s+]/g, '');
    
    // If starts with 0, replace with 243 (e.g. 082 -> 24382)
    if (clean.startsWith('0')) {
      clean = '243' + clean.substring(1);
    }
    // If length is 9 (e.g. 82...), prepend 243
    else if (clean.length === 9) {
      clean = '243' + clean;
    }
    
    return clean;
  }

  /**
   * Envoie un code OTP par SMS
   * @param phone Numéro de téléphone au format international (+243...)
   * @param otp Code OTP à 6 chiffres
   */
  async sendOtp(phone: string, otp: string): Promise<void> {
    try {
      const message = `Votre code de vérification Malewa-Fac est: ${otp}. Ce code expire dans 10 minutes.`;

      const cleanPhone = this.formatPhone(phone);

      logger.info(`📤 Envoi SMS OTP vers ${phone} (formaté: ${cleanPhone})`);

      const payload = {
        api_id: this.smsUser,
        api_password: this.smsPassword,
        sms_type: 'T',
        encoding: 'T',
        sender_id: this.smsSender,
        phonenumber: cleanPhone,
        textmessage: message,
      };

      const response = await axios.post(this.smsApiUrl, payload, {
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json',
        },
        timeout: 10000,
      });

      const data = response.data;

      if (data && data.status === 'S') {
        logger.info(`✅ SMS OTP envoyé avec succès vers ${phone} (ID: ${data.message_id})`);
      } else {
        logger.warn(
          `⚠️ Échec de l'envoi SMS OTP vers ${phone}: ${data?.remarks || 'Erreur inconnue'}`,
        );
        logger.debug(`Détails réponse SMS OTP: ${JSON.stringify(data)}`);
      }
    } catch (error: any) {
      logger.error(`❌ Erreur lors de l'envoi du SMS OTP vers ${phone}: ${error.message}`);
      if (error.response) {
        logger.error(`Réponse API SMS (Erreur OTP): ${JSON.stringify(error.response.data)}`);
      }
      throw error;
    }
  }

  /**
   * Envoie un SMS générique
   * @param phone Numéro de téléphone au format international
   * @param message Message à envoyer
   */
  async sendSms(phone: string, message: string, type: 'T' | 'P' = 'T'): Promise<void> {
    try {
      const cleanPhone = this.formatPhone(phone);

      logger.info(`📤 Envoi SMS (${type}) vers ${phone} (formaté: ${cleanPhone})`);

      const payload = {
        api_id: this.smsUser,
        api_password: this.smsPassword,
        sms_type: type,
        encoding: 'T',
        sender_id: this.smsSender,
        phonenumber: cleanPhone,
        textmessage: message,
      };

      const response = await axios.post(this.smsApiUrl, payload, {
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json',
        },
        timeout: 10000,
      });

      const data = response.data;

      if (data && data.status === 'S') {
        logger.info(`✅ SMS envoyé avec succès vers ${phone} (ID: ${data.message_id})`);
      } else {
        logger.warn(
          `⚠️ Échec de l'envoi SMS vers ${phone}: ${data?.remarks || 'Erreur inconnue'}`,
        );
        logger.debug(`Détails réponse SMS: ${JSON.stringify(data)}`);
      }
    } catch (error: any) {
      logger.error(`❌ Erreur lors de l'envoi du SMS vers ${phone}: ${error.message}`);
      if (error.response) {
        logger.error(`Réponse API SMS (Erreur): ${JSON.stringify(error.response.data)}`);
      }
      throw error;
    }
  }
}

export const smsService = new SmsService();
