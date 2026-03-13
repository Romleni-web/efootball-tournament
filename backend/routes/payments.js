const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth');
const upload = require('../middleware/upload');
const Payment = require('../models/Payment');
const Tournament = require('../models/Tournament');
const User = require('../models/User');

/**
 * MANUAL M-Pesa Payment Submission (Spec Step 3)
 * Player uploads SMS screenshot + transaction code
 */
router.post('/manual-submit', auth, upload.single('screenshot'), async (req, res) => {
  try {
    const { tournamentId, amount, transactionCode, mpesaNumber } = req.body;
    
    if (!req.file || !transactionCode || !tournamentId) {
      if (req.file) require('fs').unlinkSync(req.file.path);
      return res.status(400).json({ message: 'Screenshot, transaction code, and tournament required' });
    }

    const tournament = await Tournament.findById(tournamentId);
    if (!tournament) {
      require('fs').unlinkSync(req.file.path);
      return res.status(404).json({ message: 'Tournament not found' });
    }

    // Create manual payment record
    const payment = new Payment({
      user: req.user.userId,
      tournament: tournamentId,
      amount: parseInt(amount),
      phoneNumber: mpesaNumber,
      transactionCode: transactionCode.toUpperCase(),
      screenshotUrl: `/uploads/${req.file.filename}`,
      status: 'pending',
      isManual: true
    });

    await payment.save();

    // Add to registered players (unpaid until verified)
    const existing = tournament.registeredPlayers.find(p => p.user.toString() === req.user.userId);
    if (!existing) {
      tournament.registeredPlayers.push({ user: req.user.userId, paid: false });
      await tournament.save();
    }

    res.json({
      success: true,
      message: 'Payment submitted for admin verification. Status: Pending.',
      paymentId: payment._id,
      instructions: 'Admin will verify within 10-30 minutes. Check admin dashboard.'
    });

  } catch (error) {
    console.error('Manual payment error:', error);
    if (req.file && require('fs').existsSync(req.file.path)) {
      require('fs').unlinkSync(req.file.path);
    }
    res.status(500).json({ message: 'Submission failed' });
  }
});

/**
 * Admin Verify Payment (Spec Step 4) - 25% platform fee
 */
router.post('/admin/verify/:id', auth, async (req, res) => {
  try {
    const payment = await Payment.findById(req.params.id)
      .populate('user tournament');
    
    if (!payment || payment.adminVerified) {
      return res.status(400).json({ message: 'Payment not found or already verified' });
    }

    // Verify admin
    const admin = await User.findById(req.user.userId);
    if (!admin.isAdmin) {
      return res.status(403).json({ message: 'Admin access required' });
    }

    // PLATFORM FEE: 25% (Spec)
    const platformFee = Math.floor(payment.amount * 0.25);
    const prizePoolContribution = payment.amount - platformFee;

    // Update payment
    payment.status = 'completed';
    payment.adminVerified = true;
    payment.adminVerifiedBy = req.user.userId;
    payment.adminVerifiedAt = new Date();
    await payment.save();

    // Mark player as paid
    const playerEntry = payment.tournament.registeredPlayers.find(
      p => p.user.toString() === payment.user._id.toString()
    );
    if (playerEntry) {
      playerEntry.paid = true;
      playerEntry.paidAt = new Date();
    }
    await payment.tournament.save();

    // Add to tournament prize pool (75%)
    payment.tournament.prizePool += prizePoolContribution;
    await payment.tournament.save();

    // Log platform revenue (admin can view in stats)
    console.log(`💰 Platform fee: KES ${platformFee} | Prize pool +KES ${prizePoolContribution}`);

    res.json({
      success: true,
      platformFee,
      prizePoolAdded: prizePoolContribution,
      message: `Payment verified! Player added to tournament.`
    });

  } catch (error) {
    res.status(500).json({ message: 'Verification failed' });
  }
});

/**
 * Admin Reject Payment
 */
router.post('/admin/reject/:id', auth, async (req, res) => {
  try {
    const payment = await Payment.findById(req.params.id);
    const admin = await User.findById(req.user.userId);

    if (!admin.isAdmin) {
      return res.status(403).json({ message: 'Admin required' });
    }

    payment.status = 'failed';
    payment.resultDesc = req.body.reason || 'Rejected by admin';
    await payment.save();

    res.json({ success: true, message: 'Payment rejected' });
  } catch (error) {
    res.status(500).json({ message: 'Rejection failed' });
  }
});

/**
 * Get pending manual payments (for admin UI)
 */
router.get('/pending', auth, async (req, res) => {
  try {
    const admin = await User.findById(req.user.userId);
    if (!admin.isAdmin) {
      return res.status(403).json({ message: 'Admin required' });
    }

    const payments = await Payment.find({ 
      status: 'pending', 
      adminVerified: false,
      isManual: true 
    })
    .populate('user', 'username teamName')
    .populate('tournament', 'name')
    .sort({ createdAt: -1 });

    res.json({
      success: true,
      payments: payments.map(p => ({
        id: p._id,
        user: p.user,
        tournament: p.tournament,
        amount: p.amount,
        transactionCode: p.transactionCode,
        phoneNumber: p.phoneNumber,
        screenshotUrl: p.screenshotUrl,
        submittedAt: p.createdAt
      }))
    });
  } catch (error) {
    res.status(500).json({ message: 'Failed to load payments' });
  }
});

module.exports = router;

