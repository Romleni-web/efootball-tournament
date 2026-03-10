const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
require('dotenv').config();

// Import models after mongoose is connected
const User = require('../models/User');
const Tournament = require('../models/Tournament');

const seedDatabase = async () => {
    try {
        await mongoose.connect(process.env.MONGODB_URI);
        console.log('Connected to MongoDB');

        // Wait for models to be ready
        await new Promise(resolve => setTimeout(resolve, 1000));

        // Clear existing data
        await User.deleteMany({});
        await Tournament.deleteMany({});
        console.log('Cleared existing data');

        // Create admin
        const admin = new User({
            username: 'admin',
            email: 'admin@efootball.com',
            password: 'admin123',
            teamName: 'Admin FC',
            isAdmin: true
        });
        await admin.save();
        console.log('✅ Admin: admin@efootball.com / admin123');

        // Create 8 test players
        for (let i = 1; i <= 8; i++) {
            const player = new User({
                username: `player${i}`,
                email: `player${i}@test.com`,
                password: `player${i}`,
                teamName: `Team ${i}`,
                points: Math.floor(Math.random() * 100),
                wins: Math.floor(Math.random() * 20),
                losses: Math.floor(Math.random() * 10)
            });
            await player.save();
            console.log(`✅ Player ${i}: player${i}@test.com / player${i}`);
        }

        // Create sample tournament
        const tournament = new Tournament({
            name: 'Champions Cup 2024',
            entryFee: 100,
            maxPlayers: 16,
            prizePool: 5000,
            status: 'open',
            startDate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
            createdBy: admin._id,
            format: 'single-elimination',
            registeredPlayers: []
        });
        await tournament.save();
        console.log('✅ Tournament: Champions Cup 2024');

        console.log('\n🌱 Seeding complete!');
        process.exit(0);
    } catch (error) {
        console.error('Seeding error:', error);
        process.exit(1);
    }
};

seedDatabase();