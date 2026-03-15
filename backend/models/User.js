const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const userSchema = new mongoose.Schema({
    username: { type: String, required: true, unique: true, trim: true },
    email: { type: String, required: true, unique: true, trim: true, lowercase: true },
    password: { type: String, required: true, minlength: 6 },
    teamName: { type: String, required: true },
    
    // eFootball ID
    efootballId: { type: String, unique: true, sparse: true, trim: true },
    platform: { type: String, enum: ['mobile', 'console', 'steam', 'unknown'], default: 'unknown' },
    
    // Manual payments only
    manualPayments: [{
        tournament: { type: mongoose.Schema.Types.ObjectId, ref: 'Tournament' },
        tournamentName: String,
        tournamentReference: String,
        amount: Number,
        phoneNumber: String,      // Player's phone
        receiverPhone: String,    // Admin's phone they sent to
        transactionCode: { type: String, uppercase: true },
        screenshotUrl: String,
        status: { type: String, enum: ['pending', 'approved', 'rejected'], default: 'pending' },
        submittedAt: { type: Date, default: Date.now },
        reviewedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
        reviewedAt: Date,
        notes: String
    }],
    
    points: { type: Number, default: 0 },
    wins: { type: Number, default: 0 },
    losses: { type: Number, default: 0 },
    matches: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Match' }],
    isAdmin: { type: Boolean, default: false },
    createdAt: { type: Date, default: Date.now }
});

userSchema.pre('save', async function(next) {
    if (!this.isModified('password')) return next();
    this.password = await bcrypt.hash(this.password, 10);
    next();
});

userSchema.methods.comparePassword = async function(candidatePassword) {
    return await bcrypt.compare(candidatePassword, this.password);
};

module.exports = mongoose.model('User', userSchema);
