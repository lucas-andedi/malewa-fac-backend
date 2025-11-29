import axios from 'axios';
import { env } from '../config/env';
import { logger } from '../config/logger';

interface MokoResponse {
  status?: string;
  message?: string;
  reference?: string;
  // Add other fields as observed in callbacks/responses
  [key: string]: any;
}

interface TransactionRequest {
  amount: number;
  currency?: string;
  customer_number: string; // Phone number
  firstname?: string;
  lastname?: string;
  email?: string;
  reference: string;
  method?: string; // airtel, vodacom, orange, africell
  callback_url?: string;
}

class MokoService {
  private token: string | null = null;
  private tokenExpiresAt: number = 0;

  /**
   * Get Authentication Token
   * Auto-refreshes if expired
   */
  private async getToken(): Promise<string> {
    if (this.token && Date.now() < this.tokenExpiresAt) {
      return this.token;
    }

    try {
      // Assuming auth endpoint is /authenticate or we pass credentials in body
      // Based on docs, there is an auth endpoint returning a token.
      // Let's try /authenticate or assume we use credentials in request body for now 
      // as seen in "Request Examples" of docs which include merchant_id/secret.
      // If using token, we usually do POST /login or /auth
      // For now, let's implement a generic wrapper that includes auth headers/body
      
      // Placeholder for auth call if explicit auth endpoint exists
      // For now we'll skip explicit token cache if we send credentials with every request
      // But standard practice is Authorization: Bearer <token>
      
      // Let's try to authenticate (guessed endpoint based on common patterns, user can correct)
      /*
      const res = await axios.post(`${env.mokoBaseUrl}/authenticate`, {
        merchant_id: env.mokoMerchantId,
        merchant_secrete: env.mokoMerchantSecret
      });
      this.token = res.data.token;
      this.tokenExpiresAt = Date.now() + 30 * 60 * 1000; // 30 mins
      return this.token;
      */
     return ''; // Placeholder
    } catch (err) {
      logger.error({ err }, 'Moko Auth Failed');
      throw new Error('Moko Authentication Failed');
    }
  }

  private detectCarrier(phone: string): string {
    // Normalize: remove +243, 243, 00243
    let p = phone.replace(/^\+?243/, '').replace(/^00243/, '');
    if (p.startsWith('0')) p = p.substring(1);
    
    // M-Pesa (Vodacom): 81, 82, 83
    if (['81','82','83'].some(prefix => p.startsWith(prefix))) return 'mpesa';
    // Orange Money: 80, 84, 85, 89
    if (['80','84','85','89'].some(prefix => p.startsWith(prefix))) return 'orange';
    // Airtel Money: 99, 98, 97
    if (['99','98','97'].some(prefix => p.startsWith(prefix))) return 'airtel';
    // Afrimoney (Africell): 90
    if (p.startsWith('90')) return 'afrimoney';
    
    return 'airtel'; // default fallback
  }

  /**
   * Initiate Collection (Debit Client - C2B)
   */

  async initiateCollection(data: TransactionRequest): Promise<MokoResponse> {
    try {
      
      const url = `${env.mokoBaseUrl}/transactions`; 
      
      const payload = {
        merchant_id: env.mokoMerchantId,
        merchant_secrete: env.mokoMerchantSecret,
        action: 'debit',
        amount: String(data.amount),
        currency: data.currency || 'CDF',
        customer_number: data.customer_number,
        reference: data.reference,
        firstname: data.firstname || 'Client',
        lastname: data.lastname || 'Malewa',
        "e-mail": data.email || 'client@malewa.com',
        method: data.method || 'mpesa', // defaulting or require it
        callback_url: data.callback_url || `${env.appUrl}/api/v1/payments/moko/webhook`
      };

      logger.info({ payload }, 'Moko Initiate Collection');
      const res = await axios.post(url, payload);
      return res.data;
    } catch (error: any) {
      logger.error({ err: error.response?.data || error.message }, 'Moko Collection Error');
      throw new Error(error.response?.data?.message || 'Payment initiation failed');
    }
  }

  /**
   * Initiate Payout (Credit Merchant - B2C)
   */
  async initiatePayout(data: TransactionRequest): Promise<MokoResponse> {
    try {
      // Following doc: "Requesting Payout (B2C)"
      const url = `${env.mokoBaseUrl}/transactions`; 
      
      const payload = {
        merchant_id: env.mokoMerchantId,
        merchant_secrete: env.mokoMerchantSecret,
        action: 'credit',
        amount: String(data.amount),
        currency: data.currency || 'CDF',
        customer_number: data.customer_number,
        reference: data.reference,
        firstname: data.firstname || 'Merchant',
        lastname: data.lastname || 'Partner',
        "e-mail": data.email || 'merchant@malewa.com',
        method: data.method || 'airtel',
        callback_url: data.callback_url || `${env.appUrl}/api/v1/payments/moko/webhook`
      };

      logger.info({ payload }, 'Moko Initiate Payout');
      const res = await axios.post(url, payload);
      return res.data;
    } catch (error: any) {
      logger.error({ err: error.response?.data || error.message }, 'Moko Payout Error');
      throw new Error(error.response?.data?.message || 'Payout initiation failed');
    }
  }
}

export const mokoService = new MokoService();
