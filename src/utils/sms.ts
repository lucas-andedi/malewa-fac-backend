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
      
      // Encoder les paramètres pour l'URL
      const encodedPassword = encodeURIComponent(this.smsPassword);
      const encodedMessage = encodeURIComponent(message);
      const encodedSender = encodeURIComponent(this.smsSender);
      
      const cleanPhone = this.formatPhone(phone);

      logger.info(`📤 Envoi SMS OTP vers ${phone} (formaté: ${cleanPhone})`);

      const url = `${this.smsApiUrl}?user=${this.smsUser}&password=${encodedPassword}&message=${encodedMessage}&expediteur=${encodedSender}&telephone=${cleanPhone}`;

      const response = await axios.get(url, {
        headers: {
            'Content-Type': 'application/json'
        },
        timeout: 15000
      });

      if (response.data) {
        logger.info(`✅ SMS OTP envoyé avec succès vers ${phone}`);
        // Check if response contains error-like strings even if 200 OK
        if (typeof response.data === 'string' && (response.data.includes('error') || response.data.includes('Echec'))) {
            logger.warn(`⚠️ Réponse API SMS suspecte: ${response.data}`);
        } else {
            logger.debug(`Réponse API SMS: ${JSON.stringify(response.data)}`);
        }
      } else {
        logger.warn(`⚠️ Réponse SMS API inattendue (vide) pour ${phone}. Status: ${response.status}`);
      }
    } catch (error: any) {
      logger.error(`❌ Erreur lors de l'envoi du SMS vers ${phone}: ${error.message}`);
      if (error.response) {
        logger.error(`Réponse API SMS (Erreur): ${JSON.stringify(error.response.data)}`);
      }
    }
  }

  /**
   * Envoie un SMS générique
   * @param phone Numéro de téléphone au format international
   * @param message Message à envoyer
   */
  async sendSms(phone: string, message: string): Promise<void> {
    try {
      const encodedPassword = encodeURIComponent(this.smsPassword);
      const encodedMessage = encodeURIComponent(message);
      const encodedSender = encodeURIComponent(this.smsSender);
      
      const cleanPhone = this.formatPhone(phone);

      const url = `${this.smsApiUrl}?user=${this.smsUser}&password=${encodedPassword}&message=${encodedMessage}&expediteur=${encodedSender}&telephone=${cleanPhone}`;

      logger.info(`📤 Envoi SMS vers ${phone} (formaté: ${cleanPhone})`);

      const response = await axios.get(url, {
        headers: {
          'Content-Type': 'application/json',
        },
        timeout: 15000,
      });

      if (response.data) {
        logger.info(`✅ SMS envoyé avec succès vers ${phone}`);
        if (typeof response.data === 'string' && (response.data.includes('error') || response.data.includes('Echec'))) {
            logger.warn(`⚠️ Réponse API SMS suspecte: ${response.data}`);
        }
      } else {
        logger.warn(`⚠️ Réponse SMS API inattendue (vide) pour ${phone}`);
      }
    } catch (error: any) {
      logger.error(`❌ Erreur lors de l'envoi du SMS vers ${phone}: ${error.message}`);
    }
  }
}

export const smsService = new SmsService();
