const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth');
const User = require('../models/User');
const Tournament = require('../models/Tournament');
const Match = require('../models/Match');

// Get user stats
router.get('/stats', auth, async (req, res) => {
    try {
        const user = await User.findById(req.user.userId);
        const winRate = user.matches.length > 0 
            ? Math.round((user.wins / user.matches.length) * 100) 
            : 0;
        
        res.json({
            points: user.points,
            wins: user.wins,
            losses: user.losses,
            matches: user.matches.length,
            winRate
        });
    } catch (error) {
        res.status(500).json({ message: 'Server error' });
    }
});

// Get user's tournaments
router.get('/tournaments', auth, async (req, res) => {
    try {
        const tournaments = await Tournament.find({
            'registeredPlayers.user': req.user.userId,
            'registeredPlayers.paid': true
        });
        
        res.json(tournaments);
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
            status: 'scheduled',
            scheduledTime: { $gte: new Date() }
        })
        .populate('player1', 'username')
        .populate('player2', 'username')
        .populate('tournament', 'name');
        
        res.json(matches.map(m => ({
            _id: m._id,
            opponent: m.player1._id.toString() === req.user.userId 
                ? m.player2.username 
                : m.player1.username,
            scheduledTime: m.scheduledTime,
            tournamentName: m.tournament.name
        })));
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
        .populate('player1', 'username')
        .populate('player2', 'username')
        .sort({ updatedAt: -1 });
        
        res.json(matches.map(m => {
            const isPlayer1 = m.player1._id.toString() === req.user.userId;
            const myScore = isPlayer1 ? m.score1 : m.score2;
            const opponentScore = isPlayer1 ? m.score2 : m.score1;
            const opponent = isPlayer1 ? m.player2.username : m.player1.username;
            
            return {
                date: m.updatedAt,
                opponent,
                myScore,
                opponentScore,
                result: m.winner?.toString() === req.user.userId ? 'win' : 'loss',
                verified: !!m.verifiedBy
            };
        }));
    } catch (error) {
        res.status(500).json({ message: 'Server error' });
    }
});

module.exports = router;
