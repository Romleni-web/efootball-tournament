const mongoose = require('mongoose');

const matchSubmissionSchema = new mongoose.Schema({
    match: { type: mongoose.Schema.Types.ObjectId, ref: 'Match', required: true },
    player: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    isPlayer1: { type: Boolean, required: true },
    myScore: { type: Number, required: true },
    opponentScore: { type: Number, required: true },
    screenshotUrl: String,
    submittedAt: { type: Date, default: Date.now }
});

matchSubmissionSchema.index({ match: 1, player: 1 }, { unique: true });

module.exports = mongoose.model('MatchSubmission', matchSubmissionSchema);