const mongoose = require('mongoose');

const tournamentSchema = new mongoose.Schema({
    name: { type: String, required: true },
    type: { 
        type: String, 
        enum: ['standard', 'premium', 'weekly', 'special', 'championship'],
        default: 'standard' 
    },
    entryFee: { type: Number, required: true, min: 0 },
    maxPlayers: { type: Number, required: true, min: 2 },
    prizePool: { type: Number, required: true },
    
    // Manual payment only
    paymentReceiver: {
        phoneNumber: { type: String, required: true },  // Admin's M-Pesa number
        name: { type: String, required: true },         // Admin's registered name
        instruction: String
    },
    
    // Unique reference for players to include in SMS
    paymentReference: {
        type: String,
        unique: true,
        sparse: true
    },
    
    registeredPlayers: [{
        user: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
        paid: { type: Boolean, default: false },
        paidAt: Date,
        paymentMethod: { 
            type: String, 
            enum: ['manual', 'free'],
            default: 'manual'
        },
        transactionCode: String,
        phoneNumber: String
    }],
    
    matches: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Match' }],
    status: { type: String, enum: ['open', 'ongoing', 'finished'], default: 'open' },
    startDate: { type: Date, required: true },
    endDate: Date,
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    format: { type: String, enum: ['single-elimination', 'double-elimination', 'round-robin'], default: 'single-elimination' },
    description: String,
    rules: [String],
    featured: { type: Boolean, default: false }
    
}, { timestamps: true });

// Auto-generate payment reference
tournamentSchema.pre('save', function(next) {
    if (this.isNew && !this.paymentReference) {
        const typeMap = {
            'standard': 'ST', 'premium': 'PR', 'weekly': 'WK',
            'special': 'SP', 'championship': 'CH'
        };
        const typeCode = typeMap[this.type] || 'TR';
        const random = Math.floor(100 + Math.random() * 900);
        this.paymentReference = `TOUR-${typeCode}-${random}`;
    }
    next();
});

module.exports = mongoose.model('Tournament', tournamentSchema);
