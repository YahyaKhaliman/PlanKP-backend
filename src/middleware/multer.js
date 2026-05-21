const multer = require("multer");
const path = require("path");
const fs = require("fs");

// Tentukan dan pastikan folder penyimpanan ada
const uploadDir = path.join(__dirname, "../../public/image/realisasi");
if (!fs.existsSync(uploadDir)) {
    fs.mkdirSync(uploadDir, { recursive: true });
}

// Konfigurasi Penyimpanan Disk
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        cb(null, uploadDir);
    },
    filename: (req, file, cb) => {
        // Buat nama berkas unik: realisasi-timestamp-random.ext
        const uniqueSuffix = Date.now() + "-" + Math.round(Math.random() * 1e9);
        const ext = path.extname(file.originalname).toLowerCase();
        cb(null, `realisasi-${uniqueSuffix}${ext}`);
    },
});

// Filter tipe file yang diperbolehkan (hanya gambar)
const fileFilter = (req, file, cb) => {
    const allowedTypes = ["image/jpeg", "image/png", "image/jpg", "image/webp"];
    if (allowedTypes.includes(file.mimetype)) {
        cb(null, true);
    } else {
        cb(new Error("Format file tidak didukung. Hanya diperbolehkan JPG, JPEG, PNG, dan WEBP."), false);
    }
};

// Inisialisasi Multer
const upload = multer({
    storage: storage,
    fileFilter: fileFilter,
    limits: {
        fileSize: 5 * 1024 * 1024, // Maksimal 5 MB
    },
});

module.exports = upload;
