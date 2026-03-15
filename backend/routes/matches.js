const express = require('express');
const router = express.Router();
const Match = require('../models/Match');
const Tournament = require('../models/Tournament');
const User = require('../models/User');
const auth = require('../middleware/auth');
const upload = require('../middleware/upload');

// Submit match result
router.post('/submit-result', auth, upload.single('screenshot'), async (req, res) => {
    try {
        const { matchId, myScore, opponentScore } = req.body;
        
        const match = await Match.findById(matchId);
        if (!match) {
            return res.status(404).json({ message: 'Match not found' });
        }
        
        // Verify user is part of this match
        const isPlayer1 = match.player1.toString() === req.user.userId;
        const isPlayer2 = match.player2.toString() === req.user.userId;
        
        if (!isPlayer1 && !isPlayer2) {
            return res.status(403).json({ message: 'Not authorized' });
        }
        
        if (match.status !== 'scheduled') {
            return res.status(400).json({ message: 'Match already processed' });
        }
        
        // Update match
        if (isPlayer1) {
            match.score1 = parseInt(myScore);
            match.score2 = parseInt(opponentScore);
        } else {
            match.score1 = parseInt(opponentScore);
            match.score2 = parseInt(myScore);
        }
        
        match.screenshotUrl = `/uploads/${req.file.filename}`;
        match.submittedBy = req.user.userId;
        match.status = 'completed';
        
        // Determine winner
        if (match.score1 > match.score2) {
            match.winner = match.player1;
        } else if (match.score2 > match.score1) {
            match.winner = match.player2;
        } else {
            match.status = 'disputed'; // Draw - needs admin resolution
        }
        
        await match.save();
        
        // If verified immediately (in a real app, wait for admin verification)
        if (match.winner) {
            await updatePlayerStats(match);
            await advanceWinner(match);
        }
        
        res.json({ message: 'Result submitted for verification' });
        
    } catch (error) {
        console.error('Submit result error:', error);
        res.status(500).json({ message: 'Failed to submit result' });
    }
});

async function updatePlayerStats(match) {
    const winner = await User.findById(match.winner);
    const loserId = match.winner.toString() === match.player1.toString() ? match.player2 : match.player1;
    const loser = await User.findById(loserId);
    
    // Update winner
    winner.wins += 1;
    winner.points += 3; // 3 points for win
    winner.matches.push(match._id);
    await winner.save();
    
    // Update loser
    loser.losses += 1;
    loser.matches.push(match._id);
    await loser.save();
}

async function advanceWinner(match) {
    const tournament = await Tournament.findById(match.tournament);
    const currentRound = match.round;
    
    // Find next round match
    const nextRound = currentRound + 1;
    const nextMatchNumber = Math.ceil(match.matchNumber / 2);
    
    let nextMatch = await Match.findOne({
        tournament: match.tournament,
        round: nextRound,
        matchNumber: nextMatchNumber
    });
    
    if (!nextMatch) {
        // This was the final
        tournament.status = 'finished';
        tournament.endDate = new Date();
        await tournament.save();
        return;
    }
    
    // Place winner in next match
    const isFirstSlot = match.matchNumber % 2 === 1;
    if (isFirstSlot) {
        nextMatch.player1 = match.winner;
    } else {
        nextMatch.player2 = match.winner;
    }
    
    await nextMatch.save();
}

module.exports = router;
