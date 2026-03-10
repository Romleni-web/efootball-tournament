const express = require('express');
const router = express.Router();
const Tournament = require('../models/Tournament');
const Match = require('../models/Match');
const auth = require('../middleware/auth');

// Get all tournaments with filtering
router.get('/', async (req, res) => {
    try {
        const { status, limit, page = 1, search } = req.query;
        let query = {};
        
        if (status && ['open', 'ongoing', 'finished'].includes(status)) {
            query.status = status;
        }
        
        if (search) {
            query.name = { $regex: search, $options: 'i' };
        }

        const pageSize = parseInt(limit) || 12;
        const skip = (parseInt(page) - 1) * pageSize;

        const [tournaments, total] = await Promise.all([
            Tournament.find(query)
                .populate('registeredPlayers.user', 'username teamName points')
                .populate('createdBy', 'username')
                .sort({ createdAt: -1 })
                .skip(skip)
                .limit(pageSize),
            Tournament.countDocuments(query)
        ]);

        res.json({
            success: true,
            tournaments,
            pagination: {
                total,
                page: parseInt(page),
                pages: Math.ceil(total / pageSize),
                hasMore: skip + tournaments.length < total
            }
        });
    } catch (error) {
        console.error('Get tournaments error:', error);
        res.status(500).json({ message: 'Failed to fetch tournaments' });
    }
});

// Get single tournament
router.get('/:id', async (req, res) => {
    try {
        const tournament = await Tournament.findById(req.params.id)
            .populate('registeredPlayers.user', 'username teamName points wins')
            .populate('matches')
            .populate('createdBy', 'username');
        
        if (!tournament) {
            return res.status(404).json({ message: 'Tournament not found' });
        }

        // Calculate additional stats
        const paidPlayers = tournament.registeredPlayers.filter(p => p.paid).length;
        const totalPrize = tournament.prizePool;
        
        res.json({
            success: true,
            tournament: {
                ...tournament.toObject(),
                stats: {
                    paidPlayers,
                    spotsRemaining: tournament.maxPlayers - paidPlayers,
                    prizePerWinner: Math.floor(totalPrize / 3) // 1st, 2nd, 3rd
                }
            }
        });
    } catch (error) {
        res.status(500).json({ message: 'Failed to fetch tournament' });
    }
});

// Join tournament (initiate registration)
router.post('/:id/join', auth, async (req, res) => {
    try {
        const tournament = await Tournament.findById(req.params.id);
        
        if (!tournament) {
            return res.status(404).json({ message: 'Tournament not found' });
        }

        if (tournament.status !== 'open') {
            return res.status(400).json({ message: 'Tournament is not open for registration' });
        }

        // Check if already registered
        const existingEntry = tournament.registeredPlayers.find(
            p => p.user.toString() === req.user.userId
        );

        if (existingEntry) {
            if (existingEntry.paid) {
                return res.status(400).json({ message: 'Already registered and paid' });
            }
            // Return existing pending registration
            return res.json({
                success: true,
                message: 'Registration pending payment',
                registrationId: existingEntry._id,
                entryFee: tournament.entryFee
            });
        }

        // Check if tournament is full
        const paidCount = tournament.registeredPlayers.filter(p => p.paid).length;
        if (paidCount >= tournament.maxPlayers) {
            return res.status(400).json({ message: 'Tournament is full' });
        }

        // Add to registered players (unpaid)
        tournament.registeredPlayers.push({
            user: req.user.userId,
            paid: false
        });
        
        await tournament.save();

        res.json({
            success: true,
            message: 'Registration initiated. Please complete payment.',
            entryFee: tournament.entryFee,
            tournamentId: tournament._id
        });

    } catch (error) {
        console.error('Join tournament error:', error);
        res.status(500).json({ message: 'Failed to join tournament' });
    }
});

// Get tournament bracket
router.get('/:id/bracket', auth, async (req, res) => {
    try {
        const tournament = await Tournament.findById(req.params.id)
            .populate({
                path: 'matches',
                populate: [
                    { path: 'player1', select: 'username teamName' },
                    { path: 'player2', select: 'username teamName' },
                    { path: 'winner', select: 'username teamName' }
                ]
            });

        if (!tournament) {
            return res.status(404).json({ message: 'Tournament not found' });
        }

        // Organize by rounds
        const rounds = {};
        tournament.matches.forEach(match => {
            if (!rounds[match.round]) {
                rounds[match.round] = [];
            }
            rounds[match.round].push({
                id: match._id,
                player1: match.player1,
                player2: match.player2,
                winner: match.winner,
                score1: match.score1,
                score2: match.score2,
                status: match.status,
                scheduledTime: match.scheduledTime,
                matchNumber: match.matchNumber,
                verified: !!match.verifiedBy
            });
        });

        // Sort rounds and matches
        const sortedRounds = Object.keys(rounds)
            .sort((a, b) => parseInt(a) - parseInt(b))
            .map(round => ({
                round: parseInt(round),
                name: getRoundName(parseInt(round), Object.keys(rounds).length),
                matches: rounds[round].sort((a, b) => a.matchNumber - b.matchNumber)
            }));

        res.json({
            success: true,
            tournament: {
                id: tournament._id,
                name: tournament.name,
                status: tournament.status,
                format: tournament.format
            },
            rounds: sortedRounds,
            totalRounds: Object.keys(rounds).length
        });

    } catch (error) {
        console.error('Bracket error:', error);
        res.status(500).json({ message: 'Failed to load bracket' });
    }
});

// Get my active tournaments
router.get('/my/active', auth, async (req, res) => {
    try {
        const tournaments = await Tournament.find({
            'registeredPlayers': {
                $elemMatch: {
                    user: req.user.userId,
                    paid: true
                }
            },
            status: { $in: ['open', 'ongoing'] }
        }).populate('registeredPlayers.user', 'username');

        res.json({
            success: true,
            tournaments: tournaments.map(t => ({
                id: t._id,
                name: t.name,
                status: t.status,
                myStatus: 'registered',
                startDate: t.startDate
            }))
        });
    } catch (error) {
        res.status(500).json({ message: 'Server error' });
    }
});

// Helper function
function getRoundName(round, totalRounds) {
    if (round === totalRounds) return 'Final';
    if (round === totalRounds - 1) return 'Semi Finals';
    if (round === totalRounds - 2) return 'Quarter Finals';
    return `Round ${round}`;
}

module.exports = router;