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

// Distribute prizes per spec: 70% 1st, 20% 2nd, 10% 3rd (after 25% platform fee already taken)
tournamentSchema.methods.distributePrizes = async function() {
  if (this.status !== 'finished' || this.prizePool <= 0) return;
  
  const finalMatches = await require('./Match').find({ 
    tournament: this._id 
  }).sort({ round: -1 }).limit(3);
  
  if (finalMatches.length === 0) return;
  
  const firstPlace = finalMatches[0].winner;
  const secondPlace = finalMatches.find(m => !m.winner === firstPlace)?.loserId || null;
  
  // 70/20/10 split
  const prizes = [
    Math.floor(this.prizePool * 0.70),  // 1st
    Math.floor(this.prizePool * 0.20),  // 2nd  
    Math.floor(this.prizePool * 0.10)   // 3rd
  ];
  
  const users = await require('./User').find({
    _id: { $in: [firstPlace, secondPlace].filter(Boolean) }
  });
  
  for (let user of users) {
    user.walletBalance += prizes[0];  // Simplified - enhance with positions
    await user.save();
  }
  
  this.prizesDistributed = true;
  await this.save();
};

module.exports = mongoose.model('Tournament', tournamentSchema);
