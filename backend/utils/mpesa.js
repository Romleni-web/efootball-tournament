const axios = require('axios');
const moment = require('moment');
const crypto = require('crypto');
const logger = require('./logger'); // Winston logger instance
const redis = require('./redis'); // Redis client for idempotency

class MpesaService {
    constructor() {
        this.environment = process.env.MPESA_ENV === 'production' ? 'production' : 'sandbox';
        this.config = {
            sandbox: {
                baseUrl: 'https://sandbox.safaricom.co.ke',
                shortcode: process.env.MPESA_SHORTCODE || '174379',
                passkey: process.env.MPESA_PASSKEY
            },
            production: {
                baseUrl: 'https://api.safaricom.co.ke',
                shortcode: process.env.MPESA_SHORTCODE,
                passkey: process.env.MPESA_PASSKEY
            }
        };
        this.currentConfig = this.config[this.environment];
        
        // Circuit breaker state
        this.circuitState = 'CLOSED'; // CLOSED, OPEN, HALF_OPEN
        this.failureCount = 0;
        this.failureThreshold = 5;
        this.resetTimeout = 60000; // 1 minute
    }

    async getAccessToken() {
        const cacheKey = 'mpesa_access_token';
        const cached = await redis.get(cacheKey);
        
        if (cached) return cached;

        const consumerKey = process.env.MPESA_CONSUMER_KEY;
        const consumerSecret = process.env.MPESA_CONSUMER_SECRET;
        
        if (!consumerKey || !consumerSecret) {
            throw new Error('M-Pesa credentials not configured');
        }

        const auth = Buffer.from(`${consumerKey}:${consumerSecret}`).toString('base64');
        
        try {
            const response = await axios.get(
                `${this.currentConfig.baseUrl}/oauth/v1/generate?grant_type=client_credentials`,
                {
                    headers: { Authorization: `Basic ${auth}` },
                    timeout: 10000
                }
            );
            
            const token = response.data.access_token;
            // Cache for 50 minutes (tokens expire after 1 hour)
            await redis.setex(cacheKey, 3000, token);
            
            return token;
        } catch (error) {
            logger.error('M-Pesa Auth Error:', {
                error: error.response?.data || error.message,
                status: error.response?.status
            });
            throw new Error('Failed to authenticate with M-Pesa');
        }
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
        if (cleaned.startsWith('+')) cleaned = cleaned.substring(1);
        
        if (cleaned.startsWith('0')) {
            cleaned = '254' + cleaned.substring(1);
        } else if (cleaned.startsWith('7') && cleaned.length === 9) {
            cleaned = '254' + cleaned;
        } else if (!cleaned.startsWith('254')) {
            cleaned = '254' + cleaned;
        }
        
        if (!/^2547\d{8}$/.test(cleaned)) {
            throw new Error('Invalid phone number format. Expected: 2547XXXXXXXX');
        }
        
        return cleaned;
    }

    // Circuit breaker pattern for resilience
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
                logger.error('M-Pesa circuit breaker opened');
                
                setTimeout(() => {
                    this.circuitState = 'HALF_OPEN';
                    this.failureCount = 0;
                    logger.info('M-Pesa circuit breaker half-open');
                }, this.resetTimeout);
            }
            
            throw error;
        }
    }

    async initiateSTKPush(phoneNumber, amount, accountReference, callbackUrl, idempotencyKey) {
        // Check idempotency
        const existing = await redis.get(`mpesa:idempotency:${idempotencyKey}`);
        if (existing) {
            logger.info(`Idempotent request detected: ${idempotencyKey}`);
            return JSON.parse(existing);
        }

        return this.callWithCircuitBreaker(async () => {
            const formattedPhone = this.formatPhoneNumber(phoneNumber);
            const accessToken = await this.getAccessToken();
            const { password, timestamp } = this.generatePassword();

            const requestBody = {
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
            };

            logger.info('STK Push Request', {
                phone: formattedPhone,
                amount,
                accountReference,
                idempotencyKey
            });

            const response = await axios.post(
                `${this.currentConfig.baseUrl}/mpesa/stkpush/v1/processrequest`,
                requestBody,
                {
                    headers: {
                        Authorization: `Bearer ${accessToken}`,
                        'Content-Type': 'application/json'
                    },
                    timeout: 30000
                }
            );

            if (response.data.ResponseCode !== '0') {
                throw new Error(response.data.ResponseDescription || 'M-Pesa request failed');
            }

            const result = {
                success: true,
                checkoutRequestId: response.data.CheckoutRequestID,
                merchantRequestId: response.data.MerchantRequestID,
                responseCode: response.data.ResponseCode,
                responseDescription: response.data.ResponseDescription
            };

            // Cache idempotency result for 24 hours
            await redis.setex(`mpesa:idempotency:${idempotencyKey}`, 86400, JSON.stringify(result));
            
            return result;
        });
    }

    async queryTransactionStatus(checkoutRequestId) {
        return this.callWithCircuitBreaker(async () => {
            const accessToken = await this.getAccessToken();
            const { password, timestamp } = this.generatePassword();

            const response = await axios.post(
                `${this.currentConfig.baseUrl}/mpesa/stkpushquery/v1/query`,
                {
                    BusinessShortCode: this.currentConfig.shortcode,
                    Password: password,
                    Timestamp: timestamp,
                    CheckoutRequestID: checkoutRequestId
                },
                {
                    headers: {
                        Authorization: `Bearer ${accessToken}`,
                        'Content-Type': 'application/json'
                    },
                    timeout: 15000
                }
            );

            return response.data;
        });
    }

    // Validate M-Pesa callback authenticity
    validateCallbackSignature(payload, signature) {
        // In production, verify callback signature using Safaricom's public key
        // This is a placeholder for the actual implementation
        return true;
    }
}

module.exports = new MpesaService();