const express = require('express');
const router = express.Router();
const fs = require('fs');
const Match = require('../models/Match');
const Tournament = require('../models/Tournament');
const User = require('../models/User');
const auth = require('../middleware/auth');
const upload = require('../middleware/upload');
const RoomGenerator = require('../utils/roomGenerator');

// Generate room for match (both players can do this)
router.post('/:id/generate-room', auth, async (req, res) => {
    try {
        const match = await Match.findById(req.params.id)
            .populate('player1', 'username gameId')
            .populate('player2', 'username gameId');

        if (!match) {
            return res.status(404).json({ message: 'Match not found' });
        }

        // Verify user is part of match
        const isPlayer1 = match.player1._id.toString() === req.user.userId;
        const isPlayer2 = match.player2._id.toString() === req.user.userId;

        if (!isPlayer1 && !isPlayer2) {
            return res.status(403).json({ message: 'Not authorized' });
        }

        // Check if room already exists
        if (!match.gameSession.roomId) {
            // Generate new room
match.gameSession.roomId = RoomGenerator.generateRoomId();
match.gameSession.password = RoomGenerator.generatePassword();
            match.gameSession.generatedAt = new Date();
            match.gameSession.generatedBy = req.user.userId;
        }

        // Update player Game IDs if not set
        const currentUser = await User.findById(req.user.userId);
        if (isPlayer1 && !match.gameSession.player1GameId) {
            match.gameSession.player1GameId = currentUser.gameId;
        } else if (isPlayer2 && !match.gameSession.player2GameId) {
            match.gameSession.player2GameId = currentUser.gameId;
        }

        // Update status to ready if both players have clicked
        if (match.gameSession.player1GameId && match.gameSession.player2GameId) {
            match.status = 'ready';
        }

        await match.save();

        // Return room info from perspective of requesting player
        const opponent = isPlayer1 ? match.player2 : match.player1;
        const myGameId = isPlayer1 ? match.gameSession.player1GameId : match.gameSession.player2GameId;
        const opponentGameId = isPlayer1 ? match.gameSession.player2GameId : match.gameSession.player1GameId;

        res.json({
            success: true,
            room: {
                roomId: match.gameSession.roomId,
                password: match.gameSession.roomPassword,
                myGameId: myGameId,
                opponentGameId: opponentGameId,
                opponentUsername: opponent.username,
                opponentTeam: opponent.teamName,
                status: match.status,
                bothReady: !!(match.gameSession.player1GameId && match.gameSession.player2GameId)
            }
        });

    } catch (error) {
        console.error('Generate room error:', error);
        res.status(500).json({ message: 'Failed to generate room' });
    }
});

// Get match room info (for checking status)
router.get('/:id/room-info', auth, async (req, res) => {
    try {
        const match = await Match.findById(req.params.id)
            .populate('player1', 'username teamName gameId')
            .populate('player2', 'username teamName gameId');

        if (!match) {
            return res.status(404).json({ message: 'Match not found' });
        }

        const isPlayer1 = match.player1._id.toString() === req.user.userId;
        const isPlayer2 = match.player2._id.toString() === req.user.userId;

        if (!isPlayer1 && !isPlayer2) {
            return res.status(403).json({ message: 'Not authorized' });
        }

        const opponent = isPlayer1 ? match.player2 : match.player1;
        const myGameId = isPlayer1 ? match.gameSession.player1GameId : match.gameSession.player2GameId;
        const opponentGameId = isPlayer1 ? match.gameSession.player2GameId : match.gameSession.player1GameId;

        res.json({
            success: true,
            room: {
                roomId: match.gameSession.roomId,
                password: match.gameSession.roomPassword,
                myGameId: myGameId,
                opponentGameId: opponentGameId,
                opponentUsername: opponent.username,
                opponentTeam: opponent.teamName,
                status: match.status,
                bothReady: !!(match.gameSession.player1GameId && match.gameSession.player2GameId),
                generatedAt: match.gameSession.generatedAt
            }
        });

    } catch (error) {
        console.error('Room info error:', error);
        res.status(500).json({ message: 'Failed to get room info' });
    }
});

// Update match status to playing (when players enter the game)
router.post('/:id/start-playing', auth, async (req, res) => {
    try {
        const match = await Match.findById(req.params.id);

        if (!match) {
            return res.status(404).json({ message: 'Match not found' });
        }

        const isPlayer = match.player1.toString() === req.user.userId || 
                        match.player2.toString() === req.user.userId;

        if (!isPlayer) {
            return res.status(403).json({ message: 'Not authorized' });
        }

        match.status = 'playing';
        await match.save();

        res.json({ success: true, message: 'Match started' });

    } catch (error) {
        res.status(500).json({ message: 'Server error' });
    }
});

// Submit match result with screenshot
router.post('/submit-result', auth, upload.single('screenshot'), async (req, res) => {
    try {
        const { matchId, myScore, opponentScore } = req.body;
        
        if (!req.file) {
            return res.status(400).json({ message: 'Screenshot is required' });
        }

        const match = await Match.findById(matchId);
        if (!match) {
            return res.status(404).json({ message: 'Match not found' });
        }

        // Verify user is part of match
        const isPlayer1 = match.player1.toString() === req.user.userId;
        const isPlayer2 = match.player2.toString() === req.user.userId;

        if (!isPlayer1 && !isPlayer2) {
            if (req.file) fs.unlinkSync(req.file.path);
            return res.status(403).json({ message: 'Not authorized - you are not a player in this match' });
        }

        if (match.status === 'completed' && match.verifiedBy) {
            return res.status(400).json({ message: 'Match already verified' });
        }

        // Set scores based on submitter
        const score1 = isPlayer1 ? parseInt(myScore) : parseInt(opponentScore);
        const score2 = isPlayer1 ? parseInt(opponentScore) : parseInt(myScore);

        // Validate scores
        if (isNaN(score1) || isNaN(score2) || score1 < 0 || score2 < 0) {
            return res.status(400).json({ message: 'Invalid scores' });
        }

        // Update match
        match.score1 = score1;
        match.score2 = score2;
        match.screenshotUrl = `/uploads/${req.file.filename}`;
        match.submittedBy = req.user.userId;
        match.status = 'completed';

        // Determine winner
        const tournament = await Tournament.findById(match.tournament);
        
        if (score1 > score2) {
            match.winner = match.player1;
        } else if (score2 > score1) {
            match.winner = match.player2;
        } else {
            if (tournament.format === 'single-elimination' || tournament.format === 'double-elimination') {
                match.status = 'disputed';
                match.winner = null;
            } else {
                match.winner = null;
            }
        }

        await match.save();

        if (match.winner && match.status === 'completed') {
            await processMatchCompletion(match, tournament);
        }

        res.json({
            success: true,
            message: match.status === 'disputed' ? 'Result submitted - requires admin review' : 'Result submitted successfully',
            match: {
                id: match._id,
                status: match.status,
                winner: match.winner,
                score1: match.score1,
                score2: match.score2
            }
        });

    } catch (error) {
        console.error('Submit result error:', error);
        if (req.file && fs.existsSync(req.file.path)) {
            fs.unlinkSync(req.file.path);
        }
        res.status(500).json({ message: 'Failed to submit result' });
    }
});

// Get match details
router.get('/:id', auth, async (req, res) => {
    try {
        const match = await Match.findById(req.params.id)
            .populate('player1', 'username teamName gameId')
            .populate('player2', 'username teamName gameId')
            .populate('winner', 'username teamName')
            .populate('tournament', 'name')
            .populate('submittedBy', 'username')
            .populate('verifiedBy', 'username');

        if (!match) {
            return res.status(404).json({ message: 'Match not found' });
        }

        const isPlayer = match.player1._id.toString() === req.user.userId || 
                        match.player2._id.toString() === req.user.userId;
        const user = await User.findById(req.user.userId);

        if (!isPlayer && !user.isAdmin) {
            return res.status(403).json({ message: 'Not authorized' });
        }

        res.json({
            success: true,
            match
        });
    } catch (error) {
        res.status(500).json({ message: 'Server error' });
    }
});

// Get my upcoming matches
router.get('/my/upcoming', auth, async (req, res) => {
    try {
        const matches = await Match.find({
            $or: [
                { player1: req.user.userId },
                { player2: req.user.userId }
            ],
            status: { $in: ['scheduled', 'ready', 'playing'] }
        })
        .populate('player1', 'username teamName')
        .populate('player2', 'username teamName')
        .populate('tournament', 'name')
        .sort({ scheduledTime: 1 });

        res.json({
            success: true,
            matches: matches.map(m => ({
                id: m._id,
                opponent: m.player1._id.toString() === req.user.userId ? m.player2 : m.player1,
                tournament: m.tournament,
                scheduledTime: m.scheduledTime,
                round: m.round,
                status: m.status,
                roomId: m.gameSession?.roomId || null
            }))
        });
    } catch (error) {
        res.status(500).json({ message: 'Server error' });
    }
});

// Process match completion
async function processMatchCompletion(match, tournament) {
    await updatePlayerStats(match);
    await advanceWinnerInBracket(match, tournament);
}

async function updatePlayerStats(match) {
    const [player1, player2] = await Promise.all([
        User.findById(match.player1),
        User.findById(match.player2)
    ]);

    if (match.winner) {
        const winner = match.winner.toString() === match.player1.toString() ? player1 : player2;
        const loser = match.winner.toString() === match.player1.toString() ? player2 : player1;

        winner.wins += 1;
        winner.points += 3;
        await winner.save();

        loser.losses += 1;
        await loser.save();
    } else {
        player1.points += 1;
        player2.points += 1;
        await Promise.all([player1.save(), player2.save()]);
    }
}

async function advanceWinnerInBracket(match, tournament) {
    if (!match.winner) return;

    const currentRound = match.round;
    const nextRound = currentRound + 1;
    const nextMatchNumber = Math.ceil(match.matchNumber / 2);

    const nextRoundMatches = await Match.find({
        tournament: tournament._id,
        round: nextRound
    });

    if (nextRoundMatches.length === 0) {
        tournament.status = 'finished';
        tournament.endDate = new Date();
        await tournament.save();
        return;
    }

    let nextMatch = nextRoundMatches.find(m => m.matchNumber === nextMatchNumber);
    
    if (!nextMatch) {
        nextMatch = new Match({
            tournament: tournament._id,
            round: nextRound,
            matchNumber: nextMatchNumber,
            scheduledTime: new Date(Date.now() + 24 * 60 * 60 * 1000),
            status: 'scheduled'
        });
    }

    const isFirstSlot = match.matchNumber % 2 === 1;
    if (isFirstSlot) {
        nextMatch.player1 = match.winner;
    } else {
        nextMatch.player2 = match.winner;
    }

    await nextMatch.save();

    if (!tournament.matches.includes(nextMatch._id)) {
        tournament.matches.push(nextMatch._id);
        await tournament.save();
    }
}

module.exports = router;