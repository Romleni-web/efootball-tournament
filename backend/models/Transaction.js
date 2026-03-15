const mongoose = require('mongoose');

const transactionSchema = new mongoose.Schema({
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    
    type: {
        type: String,
        enum: ['deposit', 'entry_fee', 'prize_win', 'withdrawal', 'refund', 'bonus', 'penalty'],
        required: true
    },
    
    amount: { type: Number, required: true },
    direction: { type: String, enum: ['in', 'out'], required: true },
    
    // References
    tournament: { type: mongoose.Schema.Types.ObjectId, ref: 'Tournament' },
    match: { type: mongoose.Schema.Types.ObjectId, ref: 'Match' },
    payment: { type: mongoose.Schema.Types.ObjectId, ref: 'Payment' },
    withdrawalId: String,
    
    status: {
        type: String,
        enum: ['pending', 'completed', 'failed', 'cancelled'],
        default: 'completed'
    },
    
    description: String,
    balanceAfter: Number,
    
    metadata: {
        platformFee: Number,
        prizePool: Number,
        mpesaCode: String,
        adminNote: String
    }
    
}, { timestamps: true });

transactionSchema.index({ user: 1, createdAt: -1 });
transactionSchema.index({ type: 1 });

module.exports = mongoose.model('Transaction', transactionSchema);