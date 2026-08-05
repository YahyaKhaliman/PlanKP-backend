const fs = require("fs");
const sharp = require("sharp");

/**
 * Kompres file gambar secara otomatis hingga ukurannya <= targetKb
 * @param {string} filePath - Path absolut file gambar
 * @param {number} targetKb - Ukuran maksimal file dalam KB (default: 10)
 */
const compressImageToTargetSize = async (filePath, targetKb = 10) => {
    try {
        if (!filePath || !fs.existsSync(filePath)) return;

        const targetBytes = targetKb * 1024;
        let stats = fs.statSync(filePath);

        // Jika ukuran awal sudah <= targetKb, tidak perlu dikompresi lagi
        if (stats.size <= targetBytes) {
            return;
        }

        const metadata = await sharp(filePath).metadata();
        let origWidth = metadata.width || 1024;

        // Tentukan resolusi awal berdasarkan targetKb
        // Jika target <= 15 KB -> max 480px
        // Jika target <= 50 KB -> max 800px
        let maxDim = targetKb <= 15 ? 480 : targetKb <= 50 ? 800 : 1024;
        let currentWidth = Math.min(origWidth, maxDim);

        let quality = 75;
        let bestBuffer = null;

        // Loop adaptif hingga ukuran benar-benar <= targetBytes
        for (let attempt = 0; attempt < 15; attempt++) {
            const buf = await sharp(filePath)
                .rotate() // Auto orientasi dari EXIF + hapus metadata junk
                .resize(currentWidth, null, {
                    fit: "inside",
                    withoutEnlargement: true,
                })
                .jpeg({
                    quality,
                    mozjpeg: true,
                    chromaSubsampling: "4:2:0",
                })
                .toBuffer();

            bestBuffer = buf;

            if (buf.length <= targetBytes) {
                break;
            }

            // Kurangi kualitas lalu kecilkan resolusi jika masih melampaui target
            if (quality > 30) {
                quality -= 15;
            } else if (currentWidth > 200) {
                currentWidth = Math.round(currentWidth * 0.75);
                quality = 60;
            } else {
                break;
            }
        }

        if (bestBuffer && bestBuffer.length > 0) {
            fs.writeFileSync(filePath, bestBuffer);
            console.log(
                `[ImageCompressor] ${(stats.size / 1024).toFixed(1)} KB -> ${(bestBuffer.length / 1024).toFixed(1)} KB (Target <= ${targetKb} KB)`,
            );
        }
    } catch (err) {
        console.error(
            "[ImageCompressor] Error compressing image:",
            err.message,
        );
    }
};

module.exports = { compressImageToTargetSize };
