const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth');
const User = require('../models/User');
const Tournament = require('../models/Tournament');
const Match = require('../models/Match');
const Payment = require('../models/Payment');

// Get user stats
router.get('/stats', auth, async (req, res) => {
    try {
        const user = await User.findById(req.user.userId);
        
        const totalMatches = user.wins + user.losses;
        const winRate = totalMatches > 0 
            ? Math.round((user.wins / totalMatches) * 100) 
            : 0;

        // Get rank
        const higherRanked = await User.countDocuments({ 
            points: { $gt: user.points },
            isAdmin: false
        });
        const rank = higherRanked + 1;

        res.json({
            success: true,
            stats: {
                points: user.points,
                wins: user.wins,
                losses: user.losses,
                matches: totalMatches,
                winRate,
                rank,
                teamName: user.teamName,
                memberSince: user.createdAt
            }
        });
    } catch (error) {
        res.status(500).json({ message: 'Server error' });
    }
});

// Get my tournaments
router.get('/tournaments', auth, async (req, res) => {
    try {
        const tournaments = await Tournament.find({
            'registeredPlayers': {
                $elemMatch: {
                    user: req.user.userId,
                    paid: true
                }
            }
        })
        .populate('registeredPlayers.user', 'username')
        .sort({ startDate: -1 });

        res.json({
            success: true,
            tournaments: tournaments.map(t => {
                const myEntry = t.registeredPlayers.find(
                    p => p.user._id.toString() === req.user.userId
                );
                return {
                    id: t._id,
                    name: t.name,
                    status: t.status,
                    entryFee: t.entryFee,
                    prizePool: t.prizePool,
                    myRank: null, // Calculate based on bracket position
                    paidAt: myEntry?.paidAt,
                    startDate: t.startDate,
                    endDate: t.endDate
                };
            })
        });
    } catch (error) {
        res.status(500).json({ message: 'Server error' });
    }
});

// Get upcoming matches
router.get('/upcoming-matches', auth, async (req, res) => {
    try {
        const matches = await Match.find({
            $or: [
                { player1: req.user.userId },
                { player2: req.user.userId }
            ],
            status: { $in: ['scheduled', 'ongoing'] },
            scheduledTime: { $gte: new Date(Date.now() - 24 * 60 * 60 * 1000) } // Include matches from last 24h
        })
        .populate('player1', 'username teamName')
        .populate('player2', 'username teamName')
        .populate('tournament', 'name entryFee')
        .sort({ scheduledTime: 1 });

        res.json({
            success: true,
            matches: matches.map(m => {
                const isPlayer1 = m.player1._id.toString() === req.user.userId;
                const opponent = isPlayer1 ? m.player2 : m.player1;
                
                return {
                    id: m._id,
                    opponent: {
                        id: opponent._id,
                        username: opponent.username,
                        teamName: opponent.teamName
                    },
                    tournament: {
                        id: m.tournament._id,
                        name: m.tournament.name
                    },
                    scheduledTime: m.scheduledTime,
                    round: m.round,
                    status: m.status,
                    canSubmit: m.status === 'scheduled' || m.status === 'ongoing'
                };
            })
        });
    } catch (error) {
        res.status(500).json({ message: 'Server error' });
    }
});

// Get match history
router.get('/match-history', auth, async (req, res) => {
    try {
        const matches = await Match.find({
            $or: [
                { player1: req.user.userId },
                { player2: req.user.userId }
            ],
            status: { $in: ['completed', 'disputed'] }
        })
        .populate('player1', 'username teamName')
        .populate('player2', 'username teamName')
        .populate('tournament', 'name')
        .populate('winner', 'username')
        .sort({ updatedAt: -1 });

        res.json({
            success: true,
            matches: matches.map(m => {
                const isPlayer1 = m.player1._id.toString() === req.user.userId;
                const myScore = isPlayer1 ? m.score1 : m.score2;
                const opponentScore = isPlayer1 ? m.score2 : m.score1;
                const opponent = isPlayer1 ? m.player2 : m.player1;
                
                let result = 'draw';
                if (m.winner) {
                    result = m.winner._id.toString() === req.user.userId ? 'win' : 'loss';
                }

                return {
                    id: m._id,
                    date: m.updatedAt,
                    opponent: {
                        username: opponent.username,
                        teamName: opponent.teamName
                    },
                    tournament: m.tournament.name,
                    myScore,
                    opponentScore,
                    result,
                    verified: !!m.verifiedBy,
                    isDisputed: m.status === 'disputed',
                    pointsEarned: result === 'win' ? 3 : result === 'draw' ? 1 : 0
                };
            })
        });
    } catch (error) {
        res.status(500).json({ message: 'Server error' });
    }
});

// Get payment history
router.get('/payments', auth, async (req, res) => {
    try {
        const payments = await Payment.find({ user: req.user.userId })
            .populate('tournament', 'name status startDate')
            .sort({ createdAt: -1 });

        res.json({
            success: true,
            payments: payments.map(p => ({
                id: p._id,
                tournament: p.tournament,
                amount: p.amount,
                status: p.status,
                receiptNumber: p.mpesaReceiptNumber,
                phoneNumber: p.phoneNumber,
                transactionDate: p.transactionDate,
                createdAt: p.createdAt,
                failureReason: p.status === 'failed' ? p.resultDesc : null
            }))
        });
    } catch (error) {
        res.status(500).json({ message: 'Server error' });
    }
});

// Update profile
router.patch('/profile', auth, async (req, res) => {
    try {
        const allowedUpdates = ['teamName', 'email'];
        const updates = {};
        
        Object.keys(req.body).forEach(key => {
            if (allowedUpdates.includes(key)) {
                updates[key] = req.body[key];
            }
        });

        const user = await User.findByIdAndUpdate(
            req.user.userId,
            updates,
            { new: true, runValidators: true }
        ).select('-password');

        res.json({
            success: true,
            user
        });
    } catch (error) {
        res.status(500).json({ message: 'Update failed' });
    }
});

module.exports = router;