const express = require('express');
const router = express.Router();
const Tournament = require('../models/Tournament');
const auth = require('../middleware/auth');

// Get all tournaments
router.get('/', async (req, res) => {
    try {
        const { status, limit } = req.query;
        let query = {};
        
        if (status) query.status = status;
        
        let tournaments = Tournament.find(query).populate('registeredPlayers.user', 'username teamName');
        
        if (limit) tournaments = tournaments.limit(parseInt(limit));
        
        tournaments = await tournaments.sort({ createdAt: -1 });
        
        res.json(tournaments);
    } catch (error) {
        res.status(500).json({ message: 'Server error' });
    }
});

// Get tournament by ID
router.get('/:id', async (req, res) => {
    try {
        const tournament = await Tournament.findById(req.params.id)
            .populate('registeredPlayers.user', 'username teamName')
            .populate('matches');
        
        if (!tournament) {
            return res.status(404).json({ message: 'Tournament not found' });
        }
        
        res.json(tournament);
    } catch (error) {
        res.status(500).json({ message: 'Server error' });
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
                    { path: 'winner', select: 'username' }
                ]
            });
        
        if (!tournament) {
            return res.status(404).json({ message: 'Tournament not found' });
        }
        
        // Organize matches by rounds
        const rounds = {};
        tournament.matches.forEach(match => {
            if (!rounds[match.round]) rounds[match.round] = [];
            rounds[match.round].push(match);
        });
        
        res.json({
            tournament: tournament.name,
            rounds: Object.keys(rounds).sort().map(round => ({
                round: parseInt(round),
                matches: rounds[round]
            }))
        });
    } catch (error) {
        res.status(500).json({ message: 'Server error' });
    }
});

module.exports = router;
