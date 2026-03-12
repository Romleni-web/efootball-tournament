const axios = require('axios');
const moment = require('moment');
const crypto = require('crypto');

class MpesaService {
    constructor() {
        this.environment = process.env.MPESA_ENV === 'production' ? 'production' : 'sandbox';
        this.config = {
            production: {
                baseUrl: 'https://api.safaricom.co.ke',
                shortcode: process.env.MPESA_SHORTCODE,
                passkey: process.env.MPESA_PASSKEY
            },
            sandbox: {
                baseUrl: 'https://sandbox.safaricom.co.ke',
                shortcode: process.env.MPESA_SHORTCODE || '174379',
                passkey: process.env.MPESA_PASSKEY || 'bfb279f9aa9bdbcf158e97dd71a467cd2e0c893059b10f78e6b72ada1ed2c919'
            }
        };
        this.currentConfig = this.config[this.environment];
        
        // Circuit breaker
        this.circuitState = 'CLOSED';
        this.failureCount = 0;
        this.failureThreshold = 5;
        this.resetTimeout = 60000;
    }

    async getAccessToken() {
        const consumerKey = process.env.MPESA_CONSUMER_KEY;
        const consumerSecret = process.env.MPESA_CONSUMER_SECRET;
        
        const auth = Buffer.from(`${consumerKey}:${consumerSecret}`).toString('base64');
        
        const response = await axios.get(
            `${this.currentConfig.baseUrl}/oauth/v1/generate?grant_type=client_credentials`,
            {
                headers: { Authorization: `Basic ${auth}` },
                timeout: 10000
            }
        );
        
        return response.data.access_token;
    }

    generatePassword() {
        const timestamp = moment().format('YYYYMMDDHHmmss');
        const password = Buffer.from(
            `${this.currentConfig.shortcode}${this.currentConfig.passkey}${timestamp}`
        ).toString('base64');
        return { password, timestamp };
    }

    formatPhoneNumber(phone) {
        let cleaned = phone.replace(/\D/g, '');
        if (cleaned.startsWith('0')) cleaned = '254' + cleaned.substring(1);
        if (!cleaned.startsWith('254')) cleaned = '254' + cleaned;
        if (!/^2547\d{8}$/.test(cleaned)) {
            throw new Error('Invalid phone number format');
        }
        return cleaned;
    }

    async initiateSTKPush(phoneNumber, amount, accountReference, callbackUrl) {
        return this.callWithCircuitBreaker(async () => {
            const formattedPhone = this.formatPhoneNumber(phoneNumber);
            const accessToken = await this.getAccessToken();
            const { password, timestamp } = this.generatePassword();

            const response = await axios.post(
                `${this.currentConfig.baseUrl}/mpesa/stkpush/v1/processrequest`,
                {
                    BusinessShortCode: this.currentConfig.shortcode,
                    Password: password,
                    Timestamp: timestamp,
                    TransactionType: 'CustomerPayBillOnline',
                    Amount: Math.ceil(amount),
                    PartyA: formattedPhone,
                    PartyB: this.currentConfig.shortcode,
                    PhoneNumber: formattedPhone,
                    CallBackURL: callbackUrl,
                    AccountReference: accountReference.slice(0, 12),
                    TransactionDesc: 'eFootball Entry'
                },
                {
                    headers: {
                        Authorization: `Bearer ${accessToken}`,
                        'Content-Type': 'application/json'
                    },
                    timeout: 30000
                }
            );

            if (response.data.ResponseCode !== '0') {
                throw new Error(response.data.ResponseDescription);
            }

            return {
                success: true,
                checkoutRequestId: response.data.CheckoutRequestID,
                merchantRequestId: response.data.MerchantRequestID
            };
        });
    }

    async callWithCircuitBreaker(operation) {
        if (this.circuitState === 'OPEN') {
            throw new Error('M-Pesa service temporarily unavailable');
        }

        try {
            const result = await operation();
            if (this.circuitState === 'HALF_OPEN') {
                this.circuitState = 'CLOSED';
                this.failureCount = 0;
            }
            return result;
        } catch (error) {
            this.failureCount++;
            if (this.failureCount >= this.failureThreshold) {
                this.circuitState = 'OPEN';
                setTimeout(() => {
                    this.circuitState = 'HALF_OPEN';
                    this.failureCount = 0;
                }, this.resetTimeout);
            }
            throw error;
        }
    }
}

module.exports = new MpesaService();