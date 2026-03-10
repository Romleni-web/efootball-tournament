const express = require('express');
const router = express.Router();
const moment = require('moment');
const axios = require('axios');
const crypto = require('crypto');
const auth = require('../middleware/auth');
const Payment = require('../models/Payment');
const Tournament = require('../models/Tournament');
const User = require('../models/User');
const Match = require('../models/Match');

// M-Pesa configuration
const MPESA_CONFIG = {
    sandbox: {
        baseUrl: 'https://sandbox.safaricom.co.ke',
        shortcode: process.env.MPESA_SHORTCODE || '174379',
        passkey: process.env.MPESA_PASSKEY || 'bfb279f9aa9bdbcf158e97dd71a467cd2e0c893059b10f78e6b72ada1ed2c919'
    },
    production: {
        baseUrl: 'https://api.safaricom.co.ke',
        shortcode: process.env.MPESA_SHORTCODE,
        passkey: process.env.MPESA_PASSKEY
    }
};

const environment = process.env.MPESA_ENV === 'production' ? 'production' : 'sandbox';
const config = MPESA_CONFIG[environment];

// Get OAuth token
async function getAccessToken() {
    const consumerKey = process.env.MPESA_CONSUMER_KEY;
    const consumerSecret = process.env.MPESA_CONSUMER_SECRET;
    
    if (!consumerKey || !consumerSecret) {
        throw new Error('M-Pesa credentials not configured');
    }

    const auth = Buffer.from(`${consumerKey}:${consumerSecret}`).toString('base64');
    
    try {
        const response = await axios.get(
            `${config.baseUrl}/oauth/v1/generate?grant_type=client_credentials`,
            {
                headers: { Authorization: `Basic ${auth}` },
                timeout: 10000
            }
        );
        return response.data.access_token;
    } catch (error) {
        console.error('M-Pesa Auth Error:', error.response?.data || error.message);
        throw new Error('Failed to authenticate with M-Pesa');
    }
}

// Generate password
function generatePassword() {
    const timestamp = moment().format('YYYYMMDDHHmmss');
    const password = Buffer.from(
        `${config.shortcode}${config.passkey}${timestamp}`
    ).toString('base64');
    return { password, timestamp };
}

// Format phone number
function formatPhoneNumber(phone) {
    // Remove all non-digits
    let cleaned = phone.replace(/\D/g, '');
    
    // Remove leading + if present
    if (cleaned.startsWith('+')) cleaned = cleaned.substring(1);
    
    // Handle different formats
    if (cleaned.startsWith('0')) {
        cleaned = '254' + cleaned.substring(1);
    } else if (cleaned.startsWith('7') && cleaned.length === 9) {
        cleaned = '254' + cleaned;
    } else if (!cleaned.startsWith('254')) {
        cleaned = '254' + cleaned;
    }
    
    // Validate
    if (!/^2547\d{8}$/.test(cleaned)) {
        throw new Error('Invalid phone number format. Use format: 2547XXXXXXXX');
    }
    
    return cleaned;
}

// Initiate STK Push
router.post('/stkpush', auth, async (req, res) => {
    try {
        const { phoneNumber, tournamentId } = req.body;

        // Validate input
        if (!phoneNumber || !tournamentId) {
            return res.status(400).json({ message: 'Phone number and tournament ID required' });
        }

        // Get tournament
        const tournament = await Tournament.findById(tournamentId);
        if (!tournament) {
            return res.status(404).json({ message: 'Tournament not found' });
        }

        if (tournament.status !== 'open') {
            return res.status(400).json({ message: 'Tournament registration closed' });
        }

        // Check if already paid
        const existingPaid = tournament.registeredPlayers.find(
            p => p.user.toString() === req.user.userId && p.paid
        );
        if (existingPaid) {
            return res.status(400).json({ message: 'Already registered and paid' });
        }

        // Format phone
        const formattedPhone = formatPhoneNumber(phoneNumber);
        
        // Get access token
        const accessToken = await getAccessToken();
        const { password, timestamp } = generatePassword();

        // Generate unique account reference
        const accountReference = `EFB${tournamentId.toString().slice(-6)}${Date.now().toString().slice(-4)}`;
        const callbackUrl = `${process.env.BASE_URL}/api/mpesa/callback`;

        const requestBody = {
            BusinessShortCode: config.shortcode,
            Password: password,
            Timestamp: timestamp,
            TransactionType: 'CustomerPayBillOnline',
            Amount: tournament.entryFee,
            PartyA: formattedPhone,
            PartyB: config.shortcode,
            PhoneNumber: formattedPhone,
            CallBackURL: callbackUrl,
            AccountReference: accountReference.slice(0, 12),
            TransactionDesc: `Entry: ${tournament.name.slice(0, 20)}`
        };

        console.log('STK Push Request:', {
            phone: formattedPhone,
            amount: tournament.entryFee,
            tournament: tournament.name
        });

        const response = await axios.post(
            `${config.baseUrl}/mpesa/stkpush/v1/processrequest`,
            requestBody,
            {
                headers: {
                    Authorization: `Bearer ${accessToken}`,
                    'Content-Type': 'application/json'
                },
                timeout: 30000
            }
        );

        // Check for M-Pesa error
        if (response.data.ResponseCode !== '0') {
            throw new Error(response.data.ResponseDescription || 'M-Pesa request failed');
        }

        // Create or update payment record
        let payment = await Payment.findOne({
            user: req.user.userId,
            tournament: tournamentId,
            status: 'pending'
        });

        if (!payment) {
            payment = new Payment({
                user: req.user.userId,
                tournament: tournamentId,
                amount: tournament.entryFee,
                phoneNumber: formattedPhone
            });
        }

        payment.checkoutRequestId = response.data.CheckoutRequestID;
        payment.merchantRequestId = response.data.MerchantRequestID;
        payment.accountReference = accountReference;
        await payment.save();

        // Add to tournament registered players if not already there
        const existingEntry = tournament.registeredPlayers.find(
            p => p.user.toString() === req.user.userId
        );
        
        if (!existingEntry) {
            tournament.registeredPlayers.push({
                user: req.user.userId,
                paid: false
            });
            await tournament.save();
        }

        res.json({
            success: true,
            checkoutRequestId: response.data.CheckoutRequestID,
            merchantRequestId: response.data.MerchantRequestID,
            message: 'STK Push sent. Check your phone to complete payment.'
        });

    } catch (error) {
        console.error('STK Push Error:', error);
        res.status(500).json({ 
            message: error.message || 'Failed to initiate payment',
            error: process.env.NODE_ENV === 'development' ? error.stack : undefined
        });
    }
});

// M-Pesa Callback (Called by Safaricom)
router.post('/callback', async (req, res) => {
    console.log('📱 M-Pesa Callback Received:', JSON.stringify(req.body, null, 2));
    
    try {
        const { Body } = req.body;
        
        if (!Body || !Body.stkCallback) {
            console.error('Invalid callback structure');
            return res.status(400).json({ ResultCode: 1, ResultDesc: 'Invalid callback' });
        }

        const callback = Body.stkCallback;
        const checkoutRequestId = callback.CheckoutRequestID;
        const resultCode = callback.ResultCode;
        const resultDesc = callback.ResultDesc;

        // Find payment
        const payment = await Payment.findOne({ checkoutRequestId });
        if (!payment) {
            console.error('Payment not found for checkoutRequestId:', checkoutRequestId);
            return res.status(200).json({ ResultCode: 0, ResultDesc: 'Accepted' }); // Acknowledge either way
        }

        // Update payment
        payment.resultCode = resultCode;
        payment.resultDesc = resultDesc;
        payment.callbackReceivedAt = new Date();

        if (resultCode === 0) {
            // Success
            const callbackMetadata = callback.CallbackMetadata?.Item || [];
            
            const getMetadata = (name) => callbackMetadata.find(item => item.Name === name)?.Value;
            
            payment.mpesaReceiptNumber = getMetadata('MpesaReceiptNumber');
            payment.transactionDate = moment(getMetadata('TransactionDate'), 'YYYYMMDDHHmmss').toDate();
            payment.phoneNumber = getMetadata('PhoneNumber');
            payment.status = 'completed';

            // Update tournament registration
            const tournament = await Tournament.findById(payment.tournament);
            const playerEntry = tournament.registeredPlayers.find(
                p => p.user.toString() === payment.user.toString()
            );

            if (playerEntry) {
                playerEntry.paid = true;
                playerEntry.paidAt = new Date();
                await tournament.save();

                // Check if tournament should start
                const paidCount = tournament.registeredPlayers.filter(p => p.paid).length;
                if (paidCount >= tournament.maxPlayers && tournament.status === 'open') {
                    await startTournament(tournament);
                }
            }

            console.log(`✅ Payment successful: ${payment.mpesaReceiptNumber}`);
        } else {
            // Failed
            payment.status = resultCode === 1032 ? 'cancelled' : 'failed';
            console.log(`❌ Payment failed: ${resultDesc} (Code: ${resultCode})`);
        }

        await payment.save();
        
        // Always return success to M-Pesa
        res.status(200).json({ ResultCode: 0, ResultDesc: 'Accepted' });

    } catch (error) {
        console.error('Callback processing error:', error);
        // Still return 200 to prevent M-Pesa retries
        res.status(200).json({ ResultCode: 0, ResultDesc: 'Accepted with errors' });
    }
});

// Query transaction status (for polling)
router.get('/status/:checkoutRequestId', auth, async (req, res) => {
    try {
        const payment = await Payment.findOne({
            checkoutRequestId: req.params.checkoutRequestId,
            user: req.user.userId
        });

        if (!payment) {
            return res.status(404).json({ message: 'Payment not found' });
        }

        // If still pending and no recent callback, query M-Pesa
        if (payment.status === 'pending') {
            try {
                const accessToken = await getAccessToken();
                const { password, timestamp } = generatePassword();

                const queryResponse = await axios.post(
                    `${config.baseUrl}/mpesa/stkpushquery/v1/query`,
                    {
                        BusinessShortCode: config.shortcode,
                        Password: password,
                        Timestamp: timestamp,
                        CheckoutRequestID: req.params.checkoutRequestId
                    },
                    {
                        headers: {
                            Authorization: `Bearer ${accessToken}`,
                            'Content-Type': 'application/json'
                        }
                    }
                );

                // Update if we got a definitive result
                if (queryResponse.data.ResultCode !== undefined && queryResponse.data.ResultCode !== null) {
                    payment.resultCode = queryResponse.data.ResultCode;
                    payment.resultDesc = queryResponse.data.ResultDesc;
                    
                    if (queryResponse.data.ResultCode === 0) {
                        payment.status = 'completed';
                    } else {
                        payment.status = 'failed';
                    }
                    await payment.save();
                }
            } catch (queryError) {
                console.log('Query error (non-critical):', queryError.message);
            }
        }

        res.json({
            success: true,
            status: payment.status,
            resultCode: payment.resultCode,
            resultDesc: payment.resultDesc,
            receiptNumber: payment.mpesaReceiptNumber,
            amount: payment.amount,
            transactionDate: payment.transactionDate,
            createdAt: payment.createdAt
        });

    } catch (error) {
        console.error('Status check error:', error);
        res.status(500).json({ message: 'Failed to check status' });
    }
});

// Get payment history
router.get('/history', auth, async (req, res) => {
    try {
        const payments = await Payment.find({ user: req.user.userId })
            .populate('tournament', 'name status')
            .sort({ createdAt: -1 });

        res.json({
            success: true,
            payments: payments.map(p => ({
                id: p._id,
                tournament: p.tournament,
                amount: p.amount,
                status: p.status,
                receiptNumber: p.mpesaReceiptNumber,
                transactionDate: p.transactionDate,
                createdAt: p.createdAt
            }))
        });
    } catch (error) {
        res.status(500).json({ message: 'Server error' });
    }
});

// Start tournament and generate bracket
async function startTournament(tournament) {
    console.log(`🏁 Starting tournament: ${tournament.name}`);
    
    tournament.status = 'ongoing';
    tournament.startDate = new Date();

    // Get paid players
    const paidPlayers = tournament.registeredPlayers
        .filter(p => p.paid)
        .map(p => p.user);

    // Shuffle for random seeding
    for (let i = paidPlayers.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [paidPlayers[i], paidPlayers[j]] = [paidPlayers[j], paidPlayers[i]];
    }

    // Calculate rounds
    const numPlayers = paidPlayers.length;
    const rounds = Math.ceil(Math.log2(numPlayers));
    const byes = Math.pow(2, rounds) - numPlayers;

    // Create first round matches
    let matchNumber = 1;
    let playerIndex = 0;
    const matches = [];

    for (let i = 0; i < Math.pow(2, rounds - 1); i++) {
        const player1 = paidPlayers[playerIndex++];
        
        // Check for bye
        let player2 = null;
        if (i >= byes / 2 && i < (Math.pow(2, rounds - 1) - byes / 2)) {
            player2 = paidPlayers[playerIndex++];
        }

        const match = new Match({
            tournament: tournament._id,
            player1: player1,
            player2: player2 || player1, // If bye, player1 plays against themselves (auto-win)
            round: 1,
            matchNumber: matchNumber++,
            scheduledTime: new Date(Date.now() + 24 * 60 * 60 * 1000), // Tomorrow
            status: player2 ? 'scheduled' : 'completed',
            winner: player2 ? null : player1,
            score1: player2 ? null : 1,
            score2: player2 ? null : 0
        });

        await match.save();
        matches.push(match);

        // Auto-advance bye winners
        if (!player2) {
            await advanceByeWinner(match, tournament, rounds);
        }
    }

    tournament.matches = matches.map(m => m._id);
    await tournament.save();

    console.log(`✅ Tournament started with ${matches.length} first round matches`);
}

// Advance bye winners to next round
async function advanceByeWinner(match, tournament, totalRounds) {
    const nextRound = 2;
    const nextMatchNumber = Math.ceil(match.matchNumber / 2);

    // Find or create next round match
    let nextMatch = await Match.findOne({
        tournament: tournament._id,
        round: nextRound,
        matchNumber: nextMatchNumber
    });

    if (!nextMatch) {
        nextMatch = new Match({
            tournament: tournament._id,
            round: nextRound,
            matchNumber: nextMatchNumber,
            scheduledTime: new Date(Date.now() + 48 * 60 * 60 * 1000),
            status: 'scheduled'
        });
    }

    const isFirstSlot = match.matchNumber % 2 === 1;
    if (isFirstSlot) {
        nextMatch.player1 = match.winner;
    } else {
        nextMatch.player2 = match.winner;
    }

    await nextMatch.save();
    
    if (!tournament.matches.includes(nextMatch._id)) {
        tournament.matches.push(nextMatch._id);
        await tournament.save();
    }
}

module.exports = router;