const mongoose = require('mongoose');

const paymentSchema = new mongoose.Schema({
    user: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
    tournament: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Tournament',
        required: true
    },
    amount: {
        type: Number,
        required: true
    },
    mpesaReceiptNumber: String,
    checkoutRequestId: String,
    merchantRequestId: String,
    phoneNumber: String,
    status: {
        type: String,
        enum: ['pending', 'completed', 'failed', 'cancelled'],
        default: 'pending'
    },
    resultCode: Number,
    resultDesc: String,
    transactionDate: Date
}, { timestamps: true });

module.exports = mongoose.model('Payment', paymentSchema);
