const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth');
const MpesaService = require('../utils/mpesa');
const Payment = require('../models/Payment');
const Tournament = require('../models/Tournament');
const User = require('../models/User');

// Initiate STK Push
router.post('/stkpush', auth, async (req, res) => {
    try {
        const { phoneNumber, tournamentId } = req.body;
        
        const tournament = await Tournament.findById(tournamentId);
        if (!tournament) {
            return res.status(404).json({ message: 'Tournament not found' });
        }

        if (tournament.status !== 'open') {
            return res.status(400).json({ message: 'Tournament is not open for registration' });
        }

        // Check if already registered and paid
        const existingEntry = tournament.registeredPlayers.find(
            p => p.user.toString() === req.user.userId
        );
        if (existingEntry?.paid) {
            return res.status(400).json({ message: 'Already registered and paid for this tournament' });
        }

        // Create pending payment record
        const payment = new Payment({
            user: req.user.userId,
            tournament: tournamentId,
            amount: tournament.entryFee,
            phoneNumber,
            status: 'pending'
        });
        await payment.save();

        const callbackUrl = `${process.env.BASE_URL || 'http://localhost:5000'}/api/mpesa/callback`;
        
        const result = await MpesaService.initiateSTKPush(
            phoneNumber,
            tournament.entryFee,
            `TOUR${tournamentId.substr(-6)}`,
            callbackUrl
        );

        // Update payment with M-Pesa IDs
        payment.checkoutRequestId = result.checkoutRequestId;
        payment.merchantRequestId = result.merchantRequestId;
        await payment.save();

        res.json({
            success: true,
            checkoutRequestId: result.checkoutRequestId,
            message: 'STK Push initiated successfully'
        });

    } catch (error) {
        console.error('STK Push route error:', error);
        res.status(500).json({ message: error.message || 'Failed to initiate payment' });
    }
});

// M-Pesa Callback
router.post('/callback', async (req, res) => {
    try {
        const { Body } = req.body;
        
        if (!Body?.stkCallback) {
            return res.status(400).json({ message: 'Invalid callback data' });
        }

        const callback = Body.stkCallback;
        const checkoutRequestId = callback.CheckoutRequestID;
        const resultCode = callback.ResultCode;
        const resultDesc = callback.ResultDesc;

        const payment = await Payment.findOne({ checkoutRequestId });
        if (!payment) {
            console.error('Payment not found for checkoutRequestId:', checkoutRequestId);
            return res.status(404).json({ message: 'Payment not found' });
        }

        payment.resultCode = resultCode;
        payment.resultDesc = resultDesc;

        if (resultCode === 0) {
            // Success
            const callbackMetadata = callback.CallbackMetadata?.Item || [];
            const receiptNumber = callbackMetadata.find(item => item.Name === 'MpesaReceiptNumber')?.Value;
            const transactionDate = callbackMetadata.find(item => item.Name === 'TransactionDate')?.Value;
            const phoneNumber = callbackMetadata.find(item => item.Name === 'PhoneNumber')?.Value;
            const amount = callbackMetadata.find(item => item.Name === 'Amount')?.Value;

            payment.status = 'completed';
            payment.mpesaReceiptNumber = receiptNumber;
            payment.transactionDate = transactionDate ? moment(transactionDate, 'YYYYMMDDHHmmss').toDate() : new Date();
            
            // Update tournament registration
            const tournament = await Tournament.findById(payment.tournament);
            const playerEntry = tournament.registeredPlayers.find(
                p => p.user.toString() === payment.user.toString()
            );
            
            if (playerEntry) {
                playerEntry.paid = true;
                playerEntry.paidAt = new Date();
            } else {
                tournament.registeredPlayers.push({
                    user: payment.user,
                    paid: true,
                    paidAt: new Date()
                });
            }
            
            await tournament.save();
            
            // If tournament is full, start it
            if (tournament.registeredPlayers.filter(p => p.paid).length >= tournament.maxPlayers) {
                await startTournament(tournament._id);
            }
        } else {
            payment.status = 'failed';
        }

        await payment.save();
        res.json({ success: true });

    } catch (error) {
        console.error('Callback error:', error);
        res.status(500).json({ message: 'Callback processing failed' });
    }
});

// Query payment status
router.get('/status/:checkoutRequestId', auth, async (req, res) => {
    try {
        const payment = await Payment.findOne({
            checkoutRequestId: req.params.checkoutRequestId,
            user: req.user.userId
        });

        if (!payment) {
            return res.status(404).json({ message: 'Payment not found' });
        }

        // If still pending, query M-Pesa
        if (payment.status === 'pending') {
            try {
                const status = await MpesaService.queryTransactionStatus(req.params.checkoutRequestId);
                if (status.ResultCode !== undefined) {
                    payment.resultCode = status.ResultCode;
                    payment.resultDesc = status.ResultDesc;
                    if (status.ResultCode === 0) {
                        payment.status = 'completed';
                    } else if (status.ResultCode !== null) {
                        payment.status = 'failed';
                    }
                    await payment.save();
                }
            } catch (error) {
                console.error('Status query error:', error);
            }
        }

        res.json({
            status: payment.status,
            receiptNumber: payment.mpesaReceiptNumber,
            amount: payment.amount,
            transactionDate: payment.transactionDate
        });

    } catch (error) {
        res.status(500).json({ message: 'Failed to check status' });
    }
});

async function startTournament(tournamentId) {
    const tournament = await Tournament.findById(tournamentId).populate('registeredPlayers.user');
    tournament.status = 'ongoing';
    
    // Generate bracket (single elimination)
    const players = tournament.registeredPlayers
        .filter(p => p.paid)
        .map(p => p.user);
    
    // Shuffle players
    for (let i = players.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [players[i], players[j]] = [players[j], players[i]];
    }
    
    // Create first round matches
    const matches = [];
    const numMatches = Math.ceil(players.length / 2);
    
    for (let i = 0; i < numMatches; i++) {
        const player1 = players[i * 2];
        const player2 = players[i * 2 + 1] || null; // Bye if odd number
        
        const match = new Match({
            tournament: tournamentId,
            player1: player1._id,
            player2: player2?._id || player1._id, // If bye, player1 advances automatically
            scheduledTime: new Date(Date.now() + 24 * 60 * 60 * 1000), // Tomorrow
            round: 1,
            matchNumber: i + 1
        });
        
        await match.save();
        matches.push(match);
        
        // If bye, auto-advance
        if (!player2) {
            match.winner = player1._id;
            match.status = 'completed';
            match.score1 = 1;
            match.score2 = 0;
            await match.save();
        }
    }
    
    tournament.matches = matches.map(m => m._id);
    await tournament.save();
}

module.exports = router;
