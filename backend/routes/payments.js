const express = require('express');
const router = express.Router();
const fs = require('fs');
const Payment = require('../models/Payment');
const Transaction = require('../models/Transaction');
const Tournament = require('../models/Tournament');
const User = require('../models/User');
const auth = require('../middleware/auth');
const upload = require('../middleware/upload');

const ADMIN_MPESA_NUMBER = process.env.ADMIN_MPESA_NUMBER || '2547XXXXXXXX';

// ============================================
// PLAYER ENDPOINTS
// ============================================

// Get payment instructions
router.get('/instructions/:tournamentId', auth, async (req, res) => {
    try {
        const tournament = await Tournament.findById(req.params.tournamentId);
        if (!tournament) return res.status(404).json({ message: 'Tournament not found' });
        
        const existing = await Payment.findOne({
            user: req.user.userId,
            tournament: req.params.tournamentId,
            status: 'verified'
        });
        
        if (existing) {
            return res.json({ success: true, alreadyPaid: true });
        }
        
        const user = await User.findById(req.user.userId);
        
        res.json({
            success: true,
            alreadyPaid: false,
            canUseWallet: user.wallet.balance >= tournament.entryFee,
            walletBalance: user.wallet.balance,
            instructions: {
                mpesaNumber: ADMIN_MPESA_NUMBER,
                amount: tournament.entryFee,
                tournamentName: tournament.name,
                tier: tournament.tier,
                financials: tournament.getTierInfo()
            }
        });
        
    } catch (error) {
        res.status(500).json({ message: 'Server error' });
    }
});

// Pay with wallet
router.post('/pay-with-wallet/:tournamentId', auth, async (req, res) => {
    try {
        const tournament = await Tournament.findById(req.params.tournamentId);
        if (!tournament) return res.status(404).json({ message: 'Not found' });
        
        const user = await User.findById(req.user.userId);
        
        const isRegistered = tournament.participants.includes(req.user.userId);
        if (isRegistered) return res.status(400).json({ message: 'Already registered' });
        
        if (user.wallet.balance < tournament.entryFee) {
            return res.status(400).json({ 
                message: 'Insufficient balance',
                balance: user.wallet.balance,
                required: tournament.entryFee
            });
        }
        
        // Deduct and register
        await user.deductEntryFee(tournament.entryFee);
        tournament.participants.push(req.user.userId);
        await tournament.save();
        
        // Create records
        await Payment.create({
            user: req.user.userId,
            tournament: tournament._id,
            amount: tournament.entryFee,
            mpesaNumber: 'WALLET',
            transactionCode: 'WALLET-' + Date.now(),
            screenshotUrl: '/wallet',
            status: 'verified',
            verifiedAt: new Date()
        });
        
        await Transaction.create({
            user: req.user.userId,
            type: 'entry_fee',
            amount: tournament.entryFee,
            direction: 'out',
            tournament: tournament._id,
            description: `Entry fee - ${tournament.name}`,
            balanceAfter: user.wallet.balance,
            metadata: {
                platformFee: Math.floor(tournament.entryFee * 0.25),
                prizePool: Math.floor(tournament.entryFee * 0.75)
            }
        });
        
        res.json({
            success: true,
            message: 'Registered with wallet!',
            remainingBalance: user.wallet.balance
        });
        
    } catch (error) {
        res.status(500).json({ message: 'Server error' });
    }
});

// Submit M-Pesa payment
router.post('/submit', auth, upload.single('screenshot'), async (req, res) => {
    try {
        const { tournamentId, transactionCode, playerPhone } = req.body;
        
        if (!req.file) return res.status(400).json({ message: 'Screenshot required' });
        
        const tournament = await Tournament.findById(tournamentId);
        if (!tournament) {
            fs.unlinkSync(req.file.path);
            return res.status(404).json({ message: 'Tournament not found' });
        }
        
        // Check duplicates
        const existing = await Payment.findOne({ transactionCode: transactionCode.toUpperCase() });
        if (existing) {
            fs.unlinkSync(req.file.path);
            return res.status(400).json({ message: 'Transaction code already used' });
        }
        
        const payment = await Payment.create({
            user: req.user.userId,
            tournament: tournamentId,
            amount: tournament.entryFee,
            mpesaNumber: ADMIN_MPESA_NUMBER,
            transactionCode: transactionCode.toUpperCase().trim(),
            screenshotUrl: `/uploads/${req.file.filename}`,
            screenshotFilename: req.file.filename,
            playerPhone: playerPhone || '',
            status: 'pending'
        });
        
        res.json({
            success: true,
            message: 'Payment submitted! Awaiting verification.',
            payment: { id: payment._id, status: payment.status, transactionCode: payment.transactionCode }
        });
        
    } catch (error) {
        if (req.file && fs.existsSync(req.file.path)) fs.unlinkSync(req.file.path);
        res.status(500).json({ message: 'Server error' });
    }
});

// Check payment status
router.get('/my-status/:tournamentId', auth, async (req, res) => {
    try {
        const payment = await Payment.findOne({
            user: req.user.userId,
            tournament: req.params.tournamentId
        }).sort({ createdAt: -1 });
        
        if (!payment) return res.json({ status: 'not_paid' });
        
        res.json({
            status: payment.status,
            transactionCode: payment.transactionCode,
            amount: payment.amount,
            submittedAt: payment.submittedAt,
            verifiedAt: payment.verifiedAt,
            canResubmit: payment.status === 'rejected'
        });
        
    } catch (error) {
        res.status(500).json({ message: 'Server error' });
    }
});

// Get wallet & transactions
router.get('/wallet', auth, async (req, res) => {
    try {
        const user = await User.findById(req.user.userId).select('wallet withdrawals');
        const transactions = await Transaction.find({ user: req.user.userId })
            .sort({ createdAt: -1 })
            .limit(50);
        
        res.json({
            success: true,
            wallet: user.wallet,
            pendingWithdrawals: user.withdrawals.filter(w => w.status === 'pending'),
            transactions: transactions.map(t => ({
                id: t._id,
                type: t.type,
                amount: t.amount,
                direction: t.direction,
                description: t.description,
                date: t.createdAt,
                status: t.status
            }))
        });
        
    } catch (error) {
        res.status(500).json({ message: 'Server error' });
    }
});

// Request withdrawal
router.post('/withdraw', auth, async (req, res) => {
    try {
        const { amount, mpesaNumber } = req.body;
        const withdrawAmount = parseInt(amount);
        
        if (!withdrawAmount || withdrawAmount < 100) {
            return res.status(400).json({ message: 'Minimum withdrawal is 100 KES' });
        }
        
        if (!/^2547\d{8}$/.test(mpesaNumber)) {
            return res.status(400).json({ message: 'Valid M-Pesa number required: 2547XXXXXXXX' });
        }
        
        const user = await User.findById(req.user.userId);
        
        if (user.wallet.balance < withdrawAmount) {
            return res.status(400).json({ 
                message: 'Insufficient balance',
                balance: user.wallet.balance
            });
        }
        
        // Deduct
        user.wallet.balance -= withdrawAmount;
        user.wallet.totalWithdrawn += withdrawAmount;
        
        user.withdrawals.push({
            amount: withdrawAmount,
            mpesaNumber: mpesaNumber,
            status: 'pending'
        });
        
        await user.save();
        
        const withdrawal = user.withdrawals[user.withdrawals.length - 1];
        
        await Transaction.create({
            user: req.user.userId,
            type: 'withdrawal',
            amount: withdrawAmount,
            direction: 'out',
            description: 'Withdrawal request',
            balanceAfter: user.wallet.balance,
            withdrawalId: withdrawal._id,
            status: 'pending'
        });
        
        res.json({
            success: true,
            message: 'Withdrawal request submitted! Processed within 24 hours.',
            remainingBalance: user.wallet.balance,
            requestId: withdrawal._id
        });
        
    } catch (error) {
        res.status(500).json({ message: 'Server error' });
    }
});

// ============================================
// ADMIN ENDPOINTS
// ============================================

// Get pending payments
router.get('/admin/pending', auth, async (req, res) => {
    try {
        const admin = await User.findById(req.user.userId);
        if (!admin.isAdmin) return res.status(403).json({ message: 'Admin only' });
        
        const payments = await Payment.find({ status: 'pending' })
            .populate('user', 'username email teamName')
            .populate('tournament', 'name tier entryFee')
            .sort({ submittedAt: 1 });
        
        res.json({
            success: true,
            count: payments.length,
            payments: payments.map(p => ({
                id: p._id,
                user: p.user,
                tournament: p.tournament,
                amount: p.amount,
                transactionCode: p.transactionCode,
                screenshotUrl: p.screenshotUrl,
                playerPhone: p.playerPhone,
                submittedAt: p.submittedAt
            }))
        });
        
    } catch (error) {
        res.status(500).json({ message: 'Server error' });
    }
});

// Verify/reject payment
router.post('/admin/verify/:paymentId', auth, async (req, res) => {
    try {
        const admin = await User.findById(req.user.userId);
        if (!admin.isAdmin) return res.status(403).json({ message: 'Admin only' });
        
        const { action, reason } = req.body;
        const payment = await Payment.findById(req.params.paymentId)
            .populate('user', 'username')
            .populate('tournament');
        
        if (!payment || payment.status !== 'pending') {
            return res.status(400).json({ message: 'Payment not found or already processed' });
        }
        
        if (action === 'verify') {
            payment.status = 'verified';
            payment.verifiedBy = req.user.userId;
            payment.verifiedAt = new Date();
            await payment.save();
            
            // Add to tournament
            const tournament = await Tournament.findById(payment.tournament._id);
            tournament.participants.push(payment.user._id);
            await tournament.save();
            
            // Transaction record
            await Transaction.create({
                user: payment.user._id,
                type: 'entry_fee',
                amount: payment.amount,
                direction: 'out',
                tournament: tournament._id,
                payment: payment._id,
                description: `Entry fee - ${tournament.name}`,
                metadata: {
                    platformFee: Math.floor(payment.amount * 0.25),
                    prizePool: Math.floor(payment.amount * 0.75)
                }
            });
            
            res.json({
                success: true,
                message: 'Payment verified and player registered',
                financials: {
                    totalCollected: tournament.totalCollected,
                    yourRevenue: tournament.platformRevenue
                }
            });
            
        } else if (action === 'reject') {
            payment.status = 'rejected';
            payment.rejectionReason = reason;
            payment.verifiedBy = req.user.userId;
            payment.verifiedAt = new Date();
            await payment.save();
            
            res.json({ success: true, message: 'Payment rejected' });
        }
        
    } catch (error) {
        res.status(500).json({ message: 'Server error' });
    }
});

// Get pending withdrawals
router.get('/admin/withdrawals/pending', auth, async (req, res) => {
    try {
        const admin = await User.findById(req.user.userId);
        if (!admin.isAdmin) return res.status(403).json({ message: 'Admin only' });
        
        const users = await User.find({ 'withdrawals.status': 'pending' })
            .select('username email phone wallet.withdrawals');
        
        const pending = [];
        users.forEach(user => {
            user.withdrawals.forEach(w => {
                if (w.status === 'pending') {
                    pending.push({
                        userId: user._id,
                        username: user.username,
                        email: user.email,
                        phone: user.phone,
                        withdrawalId: w._id,
                        amount: w.amount,
                        mpesaNumber: w.mpesaNumber,
                        requestedAt: w.requestedAt
                    });
                }
            });
        });
        
        res.json({ success: true, count: pending.length, withdrawals: pending });
        
    } catch (error) {
        res.status(500).json({ message: 'Server error' });
    }
});

// Process withdrawal
router.post('/admin/process-withdrawal/:userId/:withdrawalId', auth, async (req, res) => {
    try {
        const admin = await User.findById(req.user.userId);
        if (!admin.isAdmin) return res.status(403).json({ message: 'Admin only' });
        
        const { action, mpesaCode, rejectionReason } = req.body;
        const user = await User.findById(req.params.userId);
        
        const withdrawal = user.withdrawals.id(req.params.withdrawalId);
        if (!withdrawal || withdrawal.status !== 'pending') {
            return res.status(400).json({ message: 'Withdrawal not found' });
        }
        
        if (action === 'complete') {
            withdrawal.status = 'completed';
            withdrawal.transactionCode = mpesaCode;
            withdrawal.processedAt = new Date();
            withdrawal.processedBy = req.user.userId;
            
            await Transaction.findOneAndUpdate(
                { withdrawalId: withdrawal._id },
                { status: 'completed', description: `Withdrawal completed (${mpesaCode})` }
            );
            
        } else if (action === 'reject') {
            // Refund
            user.wallet.balance += withdrawal.amount;
            user.wallet.totalWithdrawn -= withdrawal.amount;
            
            withdrawal.status = 'rejected';
            withdrawal.rejectionReason = rejectionReason;
            withdrawal.processedAt = new Date();
            
            await Transaction.findOneAndUpdate(
                { withdrawalId: withdrawal._id },
                { status: 'cancelled', description: `Rejected: ${rejectionReason}` }
            );
        }
        
        await user.save();
        res.json({ success: true, message: 'Withdrawal processed' });
        
    } catch (error) {
        res.status(500).json({ message: 'Server error' });
    }
});

// Revenue stats
router.get('/admin/revenue', auth, async (req, res) => {
    try {
        const admin = await User.findById(req.user.userId);
        if (!admin.isAdmin) return res.status(403).json({ message: 'Admin only' });
        
        const tournaments = await Tournament.find({ status: { $in: ['ongoing', 'finished'] } });
        
        const stats = {
            totalRevenue: 0,
            totalPrizePool: 0,
            totalCollected: 0,
            pendingPayouts: 0,
            byTier: {}
        };
        
        tournaments.forEach(t => {
            stats.totalRevenue += t.platformRevenue;
            stats.totalPrizePool += t.prizePool;
            stats.totalCollected += t.totalCollected;
            
            if (t.status === 'finished') {
                const pending = 
                    (t.winners.first.paid ? 0 : t.winners.first.prizeAmount) +
                    (t.winners.second.paid ? 0 : t.winners.second.prizeAmount) +
                    (t.winners.third.paid ? 0 : t.winners.third.prizeAmount);
                stats.pendingPayouts += pending;
            }
            
            if (!stats.byTier[t.tier]) {
                stats.byTier[t.tier] = { count: 0, revenue: 0, prizePool: 0 };
            }
            stats.byTier[t.tier].count++;
            stats.byTier[t.tier].revenue += t.platformRevenue;
            stats.byTier[t.tier].prizePool += t.prizePool;
        });
        
        const withdrawalStats = await User.aggregate([
            { $unwind: '$withdrawals' },
            { $match: { 'withdrawals.status': 'completed' } },
            { $group: { _id: null, total: { $sum: '$withdrawals.amount' } } }
        ]);
        
        res.json({
            success: true,
            revenue: stats,
            withdrawalsProcessed: withdrawalStats[0]?.total || 0,
            netEarnings: stats.totalRevenue - (withdrawalStats[0]?.total || 0)
        });
        
    } catch (error) {
        res.status(500).json({ message: 'Server error' });
    }
});

module.exports = router;