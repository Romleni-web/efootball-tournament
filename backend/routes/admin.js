const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth');
const User = require('../models/User');
const Tournament = require('../models/Tournament');
const Match = require('../models/Match');
const Payment = require('../models/Payment');

// Admin middleware
const adminOnly = async (req, res, next) => {
    try {
        const user = await User.findById(req.user.userId);
        if (!user.isAdmin) {
            return res.status(403).json({ message: 'Admin access required' });
        }
        next();
    } catch (error) {
        res.status(500).json({ message: 'Server error' });
    }
};

// Get admin stats
router.get('/stats', auth, adminOnly, async (req, res) => {
    try {
        const totalUsers = await User.countDocuments();
        const activeTournaments = await Tournament.countDocuments({ status: 'ongoing' });
        const pendingVerifications = await Match.countDocuments({ status: 'completed', verifiedBy: null });
        
        const payments = await Payment.find({ status: 'completed' });
        const totalRevenue = payments.reduce((sum, p) => sum + p.amount, 0);
        
        res.json({
            totalUsers,
            activeTournaments,
            pendingVerifications,
            totalRevenue
        });
    } catch (error) {
        res.status(500).json({ message: 'Server error' });
    }
});

// Create tournament
router.post('/tournaments', auth, adminOnly, async (req, res) => {
    try {
        const { name, entryFee, maxPlayers, prizePool, startDate } = req.body;
        
        const tournament = new Tournament({
            name,
            entryFee,
            maxPlayers,
            prizePool,
            startDate: new Date(startDate),
            createdBy: req.user.userId
        });
        
        await tournament.save();
        res.status(201).json(tournament);
    } catch (error) {
        res.status(500).json({ message: 'Failed to create tournament' });
    }
});

// Get pending matches for verification
router.get('/pending-matches', auth, adminOnly, async (req, res) => {
    try {
        const matches = await Match.find({ 
            status: 'completed',
            verifiedBy: null 
        })
        .populate('player1', 'username')
        .populate('player2', 'username')
        .populate('submittedBy', 'username')
        .populate('tournament', 'name');
        
        res.json(matches.map(m => ({
            _id: m._id,
            player1: m.player1.username,
            player2: m.player2.username,
            score1: m.score1,
            score2: m.score2,
            submittedBy: m.submittedBy.username,
            tournamentName: m.tournament.name,
            screenshotUrl: m.screenshotUrl
        })));
    } catch (error) {
        res.status(500).json({ message: 'Server error' });
    }
});

// Verify match
router.post('/verify-match/:id', auth, adminOnly, async (req, res) => {
    try {
        const { status } = req.body; // 'approved' or 'rejected'
        const match = await Match.findById(req.params.id);
        
        if (!match) {
            return res.status(404).json({ message: 'Match not found' });
        }
        
        if (status === 'approved') {
            match.verifiedBy = req.user.userId;
            match.verifiedAt = new Date();
            await match.save();
            
            // Update stats and advance if not already done
            await updatePlayerStats(match);
            await advanceWinner(match);
        } else {
            // Reset match for resubmission
            match.status = 'scheduled';
            match.score1 = null;
            match.score2 = null;
            match.winner = null;
            match.screenshotUrl = null;
            match.submittedBy = null;
            await match.save();
        }
        
        res.json({ message: `Match ${status}` });
    } catch (error) {
        res.status(500).json({ message: 'Verification failed' });
    }
});

// Get all payments
router.get('/payments', auth, adminOnly, async (req, res) => {
    try {
        const payments = await Payment.find()
            .populate('user', 'username')
            .populate('tournament', 'name')
            .sort({ createdAt: -1 });
        
        res.json(payments);
    } catch (error) {
        res.status(500).json({ message: 'Server error' });
    }
});

module.exports = router;
