const express = require('express');
const router = express.Router();
const Match = require('../models/Match');
const Tournament = require('../models/Tournament');
const User = require('../models/User');
const auth = require('../middleware/auth');
const upload = require('../middleware/upload');

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
            // Clean up uploaded file
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

        // Determine winner (allow draws for group stage, but not for elimination)
        const tournament = await Tournament.findById(match.tournament);
        
        if (score1 > score2) {
            match.winner = match.player1;
        } else if (score2 > score1) {
            match.winner = match.player2;
        } else {
            // Draw - mark as disputed for admin resolution in elimination
            if (tournament.format === 'single-elimination' || tournament.format === 'double-elimination') {
                match.status = 'disputed';
                match.winner = null;
            } else {
                // Round robin - allow draw
                match.winner = null;
            }
        }

        await match.save();

        // If we have a winner and it's not disputed, auto-advance in bracket
        if (match.winner && match.status === 'completed') {
            await processMatchCompletion(match, tournament);
        }

        res.json({
            success: true,
            message: match.status === 'disputed' ? 'Result submitted - requires admin review (draw in elimination)' : 'Result submitted successfully',
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
        // Clean up file on error
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
            .populate('player1', 'username teamName')
            .populate('player2', 'username teamName')
            .populate('winner', 'username teamName')
            .populate('tournament', 'name')
            .populate('submittedBy', 'username')
            .populate('verifiedBy', 'username');

        if (!match) {
            return res.status(404).json({ message: 'Match not found' });
        }

        // Check authorization
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

// Get my matches
router.get('/my/upcoming', auth, async (req, res) => {
    try {
        const matches = await Match.find({
            $or: [
                { player1: req.user.userId },
                { player2: req.user.userId }
            ],
            status: { $in: ['scheduled', 'ongoing'] }
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
                status: m.status
            }))
        });
    } catch (error) {
        res.status(500).json({ message: 'Server error' });
    }
});

// Process match completion
async function processMatchCompletion(match, tournament) {
    // Update player stats
    await updatePlayerStats(match);
    
    // Advance winner in bracket if applicable
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
        // Draw
        player1.points += 1;
        player2.points += 1;
        await Promise.all([player1.save(), player2.save()]);
    }
}

async function advanceWinnerInBracket(match, tournament) {
    if (!match.winner) return; // No winner to advance

    const currentRound = match.round;
    const nextRound = currentRound + 1;
    const nextMatchNumber = Math.ceil(match.matchNumber / 2);

    // Check if there's a next round
    const nextRoundMatches = await Match.find({
        tournament: tournament._id,
        round: nextRound
    });

    if (nextRoundMatches.length === 0) {
        // This was the final - tournament complete
        tournament.status = 'finished';
        tournament.endDate = new Date();
        await tournament.save();
        
        // Award prizes (simplified)
        await awardPrizes(tournament, match.winner);
        return;
    }

    // Find or create next match
    let nextMatch = nextRoundMatches.find(m => m.matchNumber === nextMatchNumber);
    
    if (!nextMatch) {
        // Create next round match if it doesn't exist
        nextMatch = new Match({
            tournament: tournament._id,
            round: nextRound,
            matchNumber: nextMatchNumber,
            scheduledTime: new Date(Date.now() + 24 * 60 * 60 * 1000), // Next day
            status: 'scheduled'
        });
    }

    // Place winner in appropriate slot
    const isFirstSlot = match.matchNumber % 2 === 1;
    if (isFirstSlot) {
        nextMatch.player1 = match.winner;
    } else {
        nextMatch.player2 = match.winner;
    }

    await nextMatch.save();

    // Add to tournament matches if new
    if (!tournament.matches.includes(nextMatch._id)) {
        tournament.matches.push(nextMatch._id);
        await tournament.save();
    }
}

async function awardPrizes(tournament, winnerId) {
    // Simplified prize distribution
    const winner = await User.findById(winnerId);
    console.log(`🏆 Tournament ${tournament.name} won by ${winner.username}`);
    // In production: Handle actual prize distribution
}

module.exports = router;