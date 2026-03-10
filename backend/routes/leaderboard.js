const express = require('express');
const router = express.Router();
const User = require('../models/User');

// Get global leaderboard
router.get('/', async (req, res) => {
    try {
        const { period = 'all', limit = 100 } = req.query;
        
        // Build query based on period (simplified - in production, add date filtering)
        let query = { isAdmin: false };
        
        const players = await User.find(query)
            .select('username teamName points wins losses createdAt')
            .sort({ points: -1, wins: -1, createdAt: 1 })
            .limit(parseInt(limit));

        // Calculate rankings and additional stats
        const leaderboard = players.map((player, index) => {
            const totalMatches = player.wins + player.losses;
            const winRate = totalMatches > 0 
                ? Math.round((player.wins / totalMatches) * 100) 
                : 0;

            return {
                rank: index + 1,
                id: player._id,
                username: player.username,
                teamName: player.teamName,
                points: player.points,
                wins: player.wins,
                losses: player.losses,
                matches: totalMatches,
                winRate,
                memberSince: player.createdAt,
                isTop3: index < 3
            };
        });

        // Get current user rank if authenticated
        let userRank = null;
        if (req.headers.authorization) {
            try {
                const token = req.headers.authorization.replace('Bearer ', '');
                const jwt = require('jsonwebtoken');
                const decoded = jwt.verify(token, process.env.JWT_SECRET || 'your-secret-key');
                const user = await User.findById(decoded.userId);
                if (user) {
                    const higherRanked = await User.countDocuments({ 
                        points: { $gt: user.points },
                        isAdmin: false
                    });
                    userRank = {
                        rank: higherRanked + 1,
                        points: user.points,
                        wins: user.wins
                    };
                }
            } catch (e) {
                // Invalid token, ignore
            }
        }

        res.json({
            success: true,
            leaderboard,
            userRank,
            lastUpdated: new Date(),
            totalPlayers: await User.countDocuments({ isAdmin: false })
        });

    } catch (error) {
        console.error('Leaderboard error:', error);
        res.status(500).json({ message: 'Failed to load leaderboard' });
    }
});

// Get player details
router.get('/player/:id', async (req, res) => {
    try {
        const player = await User.findById(req.params.id)
            .select('-password -email');

        if (!player || player.isAdmin) {
            return res.status(404).json({ message: 'Player not found' });
        }

        const totalMatches = player.wins + player.losses;
        const winRate = totalMatches > 0 
            ? Math.round((player.wins / totalMatches) * 100) 
            : 0;

        // Get recent form (last 5 matches)
        const recentMatches = await require('../models/Match').find({
            $or: [{ player1: player._id }, { player2: player._id }],
            status: 'completed',
            verifiedBy: { $ne: null }
        })
        .sort({ updatedAt: -1 })
        .limit(5)
        .populate('winner', 'username');

        const form = recentMatches.map(m => 
            m.winner?._id.toString() === player._id.toString() ? 'W' : 'L'
        );

        // Get rank
        const higherRanked = await User.countDocuments({ 
            points: { $gt: player.points },
            isAdmin: false
        });

        res.json({
            success: true,
            player: {
                id: player._id,
                username: player.username,
                teamName: player.teamName,
                rank: higherRanked + 1,
                points: player.points,
                wins: player.wins,
                losses: player.losses,
                matches: totalMatches,
                winRate,
                form: form.length > 0 ? form : ['-', '-', '-', '-', '-'],
                memberSince: player.createdAt
            }
        });

    } catch (error) {
        res.status(500).json({ message: 'Server error' });
    }
});

module.exports = router;