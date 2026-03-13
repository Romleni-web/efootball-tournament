const express = require('express');
const router = express.Router();
const jwt = require('jsonwebtoken');
const { body, validationResult } = require('express-validator');
const User = require('../models/User');
const auth = require('../middleware/auth');

// Validation middleware
const validate = (req, res, next) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() });
    }
    next();
};

// Register with validation
router.post('/register', [
    body('username').trim().isLength({ min: 3, max: 20 }).withMessage('Username must be 3-20 characters'),
    body('email').isEmail().normalizeEmail().withMessage('Valid email required'),
    body('password').isLength({ min: 6 }).withMessage('Password must be at least 6 characters'),
    body('teamName').trim().isLength({ min: 2 }).withMessage('Team name required'),
    validate
], async (req, res) => {
    try {
        const { username, email, password, teamName } = req.body;

        // Check existing user
        const existingUser = await User.findOne({ 
            $or: [{ email: email.toLowerCase() }, { username: username.toLowerCase() }] 
        });
        
        if (existingUser) {
            return res.status(400).json({ 
                message: existingUser.email === email.toLowerCase() ? 'Email already registered' : 'Username taken'
            });
        }

        // Create user
        const user = new User({
            username: username.toLowerCase(),
            email: email.toLowerCase(),
            password,
            teamName
        });

        await user.save();

        // Generate token
        const token = jwt.sign(
            { userId: user._id, isAdmin: user.isAdmin },
            process.env.JWT_SECRET || 'your-secret-key',
            { expiresIn: '7d' }
        );

res.status(201).json({
            success: true,
            token,
            user: {
                id: user._id,
                username: user.username,
                email: user.email,
                teamName: user.teamName,
                gameId: user.gameId,
                isAdmin: user.isAdmin,
                points: user.points,
                wins: user.wins,
                losses: user.losses
            }
        });
    } catch (error) {
        console.error('Registration error:', error);
        res.status(500).json({ message: 'Server error during registration' });
    }
});

// Login with validation
router.post('/login', [
    body('email').isEmail().normalizeEmail(),
    body('password').exists(),
    validate
], async (req, res) => {
    try {
        const { email, password } = req.body;

        const user = await User.findOne({ email: email.toLowerCase() });
        if (!user) {
            return res.status(401).json({ message: 'Invalid credentials' });
        }

        const isMatch = await user.comparePassword(password);
        if (!isMatch) {
            return res.status(401).json({ message: 'Invalid credentials' });
        }

        // Update last login (optional field)
        user.lastLogin = new Date();
        await user.save();

        const token = jwt.sign(
            { userId: user._id, isAdmin: user.isAdmin },
            process.env.JWT_SECRET || 'your-secret-key',
            { expiresIn: '7d' }
        );

res.json({
            success: true,
            token,
            user: {
                id: user._id,
                username: user.username,
                email: user.email,
                teamName: user.teamName,
                gameId: user.gameId,
                isAdmin: user.isAdmin,
                points: user.points,
                wins: user.wins,
                losses: user.losses
            }
        });
    } catch (error) {
        console.error('Login error:', error);
        res.status(500).json({ message: 'Server error during login' });
    }
});

// Get current user
router.get('/me', auth, async (req, res) => {
    try {
        const user = await User.findById(req.user.userId).select('-password');
        if (!user) {
            return res.status(404).json({ message: 'User not found' });
        }
        res.json(user);
    } catch (error) {
        res.status(500).json({ message: 'Server error' });
    }
});

// Refresh token
router.post('/refresh', auth, async (req, res) => {
    try {
        const user = await User.findById(req.user.userId);
        const token = jwt.sign(
            { userId: user._id, isAdmin: user.isAdmin },
            process.env.JWT_SECRET || 'your-secret-key',
            { expiresIn: '7d' }
        );
        res.json({ token });
    } catch (error) {
        res.status(500).json({ message: 'Server error' });
    }
});

// Update user's Game ID
router.post('/update-gameid', auth, async (req, res) => {
    try {
        const { gameId } = req.body;
        
        if (!gameId || !/^[A-Z0-9]{4,10}$/.test(gameId.toUpperCase())) {
            return res.status(400).json({ message: 'Invalid Game ID format (4-10 alphanumeric characters)' });
        }
        
        const user = await User.findById(req.user.userId);
        if (!user) {
            return res.status(404).json({ message: 'User not found' });
        }
        
        // Check if Game ID is already taken
        const existing = await User.findOne({ 
            gameId: gameId.toUpperCase(),
            _id: { $ne: req.user.userId }
        });
        
        if (existing) {
            return res.status(400).json({ message: 'This Game ID is already registered by another player' });
        }
        
        user.gameId = gameId.toUpperCase();
        await user.save();
        
        res.json({ 
            success: true, 
            message: 'Game ID updated successfully',
            gameId: user.gameId
        });
        
    } catch (error) {
        console.error('Update Game ID error:', error);
        res.status(500).json({ message: 'Server error' });
    }
});

module.exports = router;