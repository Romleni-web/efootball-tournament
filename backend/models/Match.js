const mongoose = require('mongoose');

const matchSchema = new mongoose.Schema({
    tournament: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Tournament',
        required: true
    },
    player1: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
    player2: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
    scheduledTime: {
        type: Date,
        required: true
    },
    status: {
        type: String,
        enum: ['scheduled', 'ongoing', 'completed', 'disputed'],
        default: 'scheduled'
    },
    score1: {
        type: Number,
        default: null
    },
    score2: {
        type: Number,
        default: null
    },
    winner: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        default: null
    },
    screenshotUrl: String,
    submittedBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User'
    },
    verifiedBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User'
    },
    verifiedAt: Date,
    round: {
        type: Number,
        required: true
    },
    matchNumber: {
        type: Number,
        required: true
    }
}, { timestamps: true });

module.exports = mongoose.model('Match', matchSchema);

   ({
    tournament: { type: mongoose.Schema.Types.ObjectId, ref: 'Tournament', required: true },
    player1: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    player2: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    
    // NEW: Game session details
    gameSession: {
        roomId: String,        // Auto-generated room code
        player1GameId: String, // Player 1's eFootball ID
        player2GameId: String, // Player 2's eFootball ID
        password: String       // Optional room password
    },
    
    scheduledTime: { type: Date, required: true },
    status: { type: String, enum: ['scheduled', 'ready', 'playing', 'completed', 'disputed'], default: 'scheduled' },
    score1: { type: Number, default: null },
    score2: { type: Number, default: null },
    winner: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    screenshotUrl: String,
    submittedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    verifiedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    round: { type: Number, required: true },
    matchNumber: { type: Number, required: true }
}, { timestamps: true });