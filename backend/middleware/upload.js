const multer = require('multer');
const path = require('path');
const fs = require('fs');

// Ensure uploads directory exists
const uploadsDir = path.join(__dirname, '..', 'uploads');
if (!fs.existsSync(uploadsDir)) {
    fs.mkdirSync(uploadsDir, { recursive: true });
}

const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        cb(null, uploadsDir);
    },
    filename: (req, file, cb) => {
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        const ext = path.extname(file.originalname).toLowerCase();
        cb(null, `match-${uniqueSuffix}${ext}`);
    }
});

const fileFilter = (req, file, cb) => {
    // Allowed mime types
    const allowedMimes = [
        'image/jpeg',
        'image/jpg',
        'image/png',
        'image/webp'
    ];
    
    // Also check extension as fallback
    const ext = path.extname(file.originalname).toLowerCase();
    const allowedExts = ['.jpg', '.jpeg', '.png', '.webp'];
    
    if (allowedMimes.includes(file.mimetype) && allowedExts.includes(ext)) {
        cb(null, true);
    } else {
        cb(new Error('Only image files (JPEG, PNG, WebP) are allowed'), false);
    }
};

const limits = {
    fileSize: 5 * 1024 * 1024, // 5MB max
    files: 1
};

const upload = multer({ 
    storage, 
    fileFilter, 
    limits 
});

// Error handling wrapper
upload.handleError = (err, req, res, next) => {
    if (err instanceof multer.MulterError) {
        if (err.code === 'LIMIT_FILE_SIZE') {
            return res.status(400).json({ 
                success: false,
                message: 'File too large. Maximum size is 5MB.' 
            });
        }
        return res.status(400).json({ 
            success: false,
            message: err.message 
        });
    }
    next(err);
};

module.exports = upload;