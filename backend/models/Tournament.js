const mongoose = require('mongoose');

const tournamentSchema = new mongoose.Schema({
    name: {
        type: String,
        required: true
    },
    entryFee: {
        type: Number,
        required: true,
        min: 0
    },
    maxPlayers: {
        type: Number,
        required: true,
        min: 2
    },
    prizePool: {
        type: Number,
        required: true
    },
    status: {
        type: String,
        enum: ['open', 'ongoing', 'finished'],
        default: 'open'
    },
    registeredPlayers: [{
        user: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'User'
        },
        paid: {
            type: Boolean,
            default: false
        },
        paidAt: Date
    }],
    matches: [{
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Match'
    }],
    startDate: {
        type: Date,
        required: true
    },
    endDate: Date,
    createdBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
    format: {
        type: String,
        enum: ['single-elimination', 'double-elimination', 'round-robin'],
        default: 'single-elimination'
    }
}, { timestamps: true });

module.exports = mongoose.model('Tournament', tournamentSchema);