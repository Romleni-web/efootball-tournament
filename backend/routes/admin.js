const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth');
const User = require('../models/User');
const Tournament = require('../models/Tournament');
const Match = require('../models/Match');
const Payment = require('../models/Payment');

// Admin middleware
const requireAdmin = async (req, res, next) => {
    try {
        const user = await User.findById(req.user.userId);
        if (!user || !user.isAdmin) {
            return res.status(403).json({ message: 'Admin access required' });
        }
        req.adminUser = user;
        next();
    } catch (error) {
        res.status(500).json({ message: 'Server error' });
    }
};

// Apply admin middleware to all routes
router.use(auth, requireAdmin);

// Get dashboard stats
router.get('/stats', async (req, res) => {
    try {
        const [
            totalUsers,
            activeTournaments,
            pendingVerifications,
            totalPayments,
            completedPayments,
            totalRevenue
        ] = await Promise.all([
            User.countDocuments({ isAdmin: false }),
            Tournament.countDocuments({ status: 'ongoing' }),
            Match.countDocuments({ 
                status: { $in: ['completed', 'disputed'] }, 
                verifiedBy: null 
            }),
            Payment.countDocuments(),
            Payment.countDocuments({ status: 'completed' }),
            Payment.aggregate([
                { $match: { status: 'completed' } },
                { $group: { _id: null, total: { $sum: '$amount' } } }
            ])
        ]);

        // Calculate commission (assuming 10% commission rate)
        const commissionRate = 0.10;
        const grossRevenue = totalRevenue[0]?.total || 0;
        const commission = Math.floor(grossRevenue * commissionRate);
        const netRevenue = grossRevenue - commission;

        res.json({
            success: true,
            stats: {
                totalUsers,
                activeTournaments,
                pendingVerifications,
                totalPayments,
                completedPayments,
                grossRevenue,
                commission,
                netRevenue,
                conversionRate: totalPayments > 0 
                    ? Math.round((completedPayments / totalPayments) * 100) 
                    : 0
            }
        });
    } catch (error) {
        console.error('Admin stats error:', error);
        res.status(500).json({ message: 'Failed to load stats' });
    }
});

// Create tournament
router.post('/tournaments', async (req, res) => {
    try {
        const { 
            name, 
            entryFee, 
            maxPlayers, 
            prizePool, 
            startDate,
            format = 'single-elimination',
            description = ''
        } = req.body;

        // Validation
        if (!name || !entryFee || !maxPlayers || !prizePool || !startDate) {
            return res.status(400).json({ message: 'All fields required' });
        }

        if (maxPlayers < 2 || maxPlayers > 128) {
            return res.status(400).json({ message: 'Players must be between 2 and 128' });
        }

        if (new Date(startDate) < new Date()) {
            return res.status(400).json({ message: 'Start date must be in future' });
        }

        const tournament = new Tournament({
            name,
            entryFee: parseInt(entryFee),
            maxPlayers: parseInt(maxPlayers),
            prizePool: parseInt(prizePool),
            startDate: new Date(startDate),
            format,
            description,
            createdBy: req.user.userId,
            status: 'open'
        });

        await tournament.save();

        res.status(201).json({
            success: true,
            tournament: await Tournament.findById(tournament._id)
                .populate('createdBy', 'username')
        });

    } catch (error) {
        console.error('Create tournament error:', error);
        res.status(500).json({ message: 'Failed to create tournament' });
    }
});

// Get all tournaments (admin view)
router.get('/tournaments', async (req, res) => {
    try {
        const { status, page = 1, limit = 20 } = req.query;
        const query = status ? { status } : {};
        
        const tournaments = await Tournament.find(query)
            .populate('createdBy', 'username')
            .populate('registeredPlayers.user', 'username email')
            .sort({ createdAt: -1 })
            .skip((page - 1) * limit)
            .limit(parseInt(limit));

        const total = await Tournament.countDocuments(query);

        res.json({
            success: true,
            tournaments,
            pagination: {
                total,
                page: parseInt(page),
                pages: Math.ceil(total / limit)
            }
        });
    } catch (error) {
        res.status(500).json({ message: 'Server error' });
    }
});

// Update tournament
router.patch('/tournaments/:id', async (req, res) => {
    try {
        const updates = req.body;
        const allowedUpdates = ['name', 'entryFee', 'prizePool', 'status', 'startDate', 'description'];
        
        Object.keys(updates).forEach(key => {
            if (!allowedUpdates.includes(key)) delete updates[key];
        });

        const tournament = await Tournament.findByIdAndUpdate(
            req.params.id,
            updates,
            { new: true, runValidators: true }
        );

        if (!tournament) {
            return res.status(404).json({ message: 'Tournament not found' });
        }

        res.json({ success: true, tournament });
    } catch (error) {
        res.status(500).json({ message: 'Update failed' });
    }
});

// Get pending matches for verification
router.get('/pending-matches', async (req, res) => {
    try {
        const matches = await Match.find({ 
            status: { $in: ['completed', 'disputed'] },
            verifiedBy: null 
        })
        .populate('player1', 'username teamName')
        .populate('player2', 'username teamName')
        .populate('submittedBy', 'username')
        .populate('tournament', 'name')
        .sort({ updatedAt: -1 });

        res.json({
            success: true,
            matches: matches.map(m => ({
                _id: m._id,
                player1: m.player1,
                player2: m.player2,
                score1: m.score1,
                score2: m.score2,
                submittedBy: m.submittedBy,
                tournamentName: m.tournament.name,
                tournamentId: m.tournament._id,
                screenshotUrl: m.screenshotUrl,
                status: m.status,
                isDisputed: m.status === 'disputed',
                submittedAt: m.updatedAt
            }))
        });
    } catch (error) {
        res.status(500).json({ message: 'Server error' });
    }
});

// Verify/resolve match
router.post('/verify-match/:id', async (req, res) => {
    try {
        const { status, finalScore1, finalScore2, winnerId } = req.body;
        
        const match = await Match.findById(req.params.id)
            .populate('player1')
            .populate('player2')
            .populate('tournament');

        if (!match) {
            return res.status(404).json({ message: 'Match not found' });
        }

        if (match.verifiedBy) {
            return res.status(400).json({ message: 'Match already verified' });
        }

        if (status === 'approved') {
            // Admin approves submitted result
            match.verifiedBy = req.user.userId;
            match.verifiedAt = new Date();
            
            // If disputed, admin may have specified final scores
            if (match.status === 'disputed' && finalScore1 !== undefined && finalScore2 !== undefined) {
                match.score1 = finalScore1;
                match.score2 = finalScore2;
                
                if (winnerId) {
                    match.winner = winnerId;
                } else {
                    // Determine from scores
                    if (finalScore1 > finalScore2) match.winner = match.player1._id;
                    else if (finalScore2 > finalScore1) match.winner = match.player2._id;
                }
            }
            
            match.status = 'completed';
            await match.save();

            // Process completion
            await processVerifiedMatch(match);

        } else if (status === 'rejected') {
            // Reset for resubmission
            match.status = 'scheduled';
            match.score1 = null;
            match.score2 = null;
            match.winner = null;
            match.screenshotUrl = null;
            match.submittedBy = null;
            await match.save();
        }

        res.json({
            success: true,
            message: `Match ${status}`,
            match: {
                id: match._id,
                status: match.status,
                verified: !!match.verifiedBy
            }
        });

    } catch (error) {
        console.error('Verify match error:', error);
        res.status(500).json({ message: 'Verification failed' });
    }
});

// Get all payments
router.get('/payments', async (req, res) => {
    try {
        const { status, page = 1, limit = 50 } = req.query;
        const query = status ? { status } : {};
        
        const payments = await Payment.find(query)
            .populate('user', 'username email')
            .populate('tournament', 'name')
            .sort({ createdAt: -1 })
            .skip((page - 1) * limit)
            .limit(parseInt(limit));

        const total = await Payment.countDocuments(query);

        // Calculate summary
        const summary = await Payment.aggregate([
            { $match: { status: 'completed' } },
            { 
                $group: { 
                    _id: null, 
                    total: { $sum: '$amount' },
                    count: { $sum: 1 }
                } 
            }
        ]);

        res.json({
            success: true,
            payments: payments.map(p => ({
                id: p._id,
                user: p.user,
                tournament: p.tournament,
                amount: p.amount,
                status: p.status,
                receiptNumber: p.mpesaReceiptNumber,
                phoneNumber: p.phoneNumber,
                transactionDate: p.transactionDate,
                createdAt: p.createdAt
            })),
            summary: summary[0] || { total: 0, count: 0 },
            pagination: {
                total,
                page: parseInt(page),
                pages: Math.ceil(total / limit)
            }
        });
    } catch (error) {
        res.status(500).json({ message: 'Server error' });
    }
});

// Get all users
router.get('/users', async (req, res) => {
    try {
        const { search, page = 1, limit = 50 } = req.query;
        let query = { isAdmin: false };
        
        if (search) {
            query.$or = [
                { username: { $regex: search, $options: 'i' } },
                { email: { $regex: search, $options: 'i' } },
                { teamName: { $regex: search, $options: 'i' } }
            ];
        }

        const users = await User.find(query)
            .select('-password')
            .sort({ createdAt: -1 })
            .skip((page - 1) * limit)
            .limit(parseInt(limit));

        const total = await User.countDocuments(query);

        res.json({
            success: true,
            users,
            pagination: {
                total,
                page: parseInt(page),
                pages: Math.ceil(total / limit)
            }
        });
    } catch (error) {
        res.status(500).json({ message: 'Server error' });
    }
});

// Toggle admin status
router.patch('/users/:id/toggle-admin', async (req, res) => {
    try {
        if (req.params.id === req.user.userId) {
            return res.status(400).json({ message: 'Cannot modify own admin status' });
        }

        const user = await User.findById(req.params.id);
        if (!user) {
            return res.status(404).json({ message: 'User not found' });
        }

        user.isAdmin = !user.isAdmin;
        await user.save();

        res.json({
            success: true,
            isAdmin: user.isAdmin
        });
    } catch (error) {
        res.status(500).json({ message: 'Server error' });
    }
});

// Process verified match
async function processVerifiedMatch(match) {
    // Update player stats
    if (match.winner) {
        const winner = await User.findById(match.winner);
        const loserId = match.winner.toString() === match.player1._id.toString() 
            ? match.player2._id 
            : match.player1._id;
        const loser = await User.findById(loserId);

        winner.wins += 1;
        winner.points += 3;
        await winner.save();

        loser.losses += 1;
        await loser.save();
    } else {
        // Draw
        match.player1.points += 1;
        match.player2.points += 1;
        await Promise.all([match.player1.save(), match.player2.save()]);
    }

    // Advance in bracket
    await advanceWinner(match);
}

async function advanceWinner(match) {
    if (!match.winner) return;

    const nextRound = match.round + 1;
    const nextMatchNumber = Math.ceil(match.matchNumber / 2);

    const nextMatch = await Match.findOne({
        tournament: match.tournament._id,
        round: nextRound,
        matchNumber: nextMatchNumber
    });

    if (!nextMatch) {
        // Final match - tournament complete
        const tournament = await Tournament.findById(match.tournament._id);
        tournament.status = 'finished';
        tournament.endDate = new Date();
        await tournament.save();
        return;
    }

    const isFirstSlot = match.matchNumber % 2 === 1;
    if (isFirstSlot) {
        nextMatch.player1 = match.winner;
    } else {
        nextMatch.player2 = match.winner;
    }

    await nextMatch.save();
}

module.exports = router;