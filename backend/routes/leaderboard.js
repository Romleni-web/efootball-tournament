const express = require('express');
const router = express.Router();
const User = require('../models/User');

router.get('/', async (req, res) => {
    try {
        const players = await User.find({ isAdmin: false })
            .select('username teamName points wins losses')
            .sort({ points: -1, wins: -1 })
            .limit(100);
        
        const leaderboard = players.map(p => {
            const totalMatches = p.wins + p.losses;
            const winRate = totalMatches > 0 ? Math.round((p.wins / totalMatches) * 100) : 0;
            
            return {
                username: p.username,
                teamName: p.teamName,
                points: p.points,
                wins: p.wins,
                losses: p.losses,
                winRate
            };
        });
        
        res.json(leaderboard);
    } catch (error) {
        res.status(500).json({ message: 'Server error' });
    }
});

module.exports = router;
