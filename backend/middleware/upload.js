const multer = require('multer');
const path = require('path');
const fs = require('fs');
const sharp = require('sharp');

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
        cb(null, `match-${uniqueSuffix}.png`);
    }
});

const fileFilter = (req, file, cb) => {
    const allowedMimes = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp'];
    const ext = path.extname(file.originalname).toLowerCase();
    const allowedExts = ['.jpg', '.jpeg', '.png', '.webp'];
    
    if (allowedMimes.includes(file.mimetype) && allowedExts.includes(ext)) {
        cb(null, true);
    } else {
        cb(new Error('Only image files (JPEG, PNG, WebP) are allowed'), false);
    }
};

const upload = multer({
    storage,
    fileFilter,
    limits: {
        fileSize: 5 * 1024 * 1024, // 5MB
        files: 1
    }
});

// Image optimization middleware
const optimizeImage = async (req, res, next) => {
    if (!req.file) return next();
    
    try {
        const inputPath = req.file.path;
        const outputPath = inputPath.replace('.png', '-optimized.png');
        
        await sharp(inputPath)
            .resize(1920, 1080, { fit: 'inside', withoutEnlargement: true })
            .png({ quality: 80 })
            .toFile(outputPath);
        
        // Replace original with optimized
        fs.unlinkSync(inputPath);
        fs.renameSync(outputPath, inputPath);
        
        next();
    } catch (error) {
        next(error);
    }
};

module.exports = { upload, optimizeImage };