const mapSequelizeError = (err) => {
    if (!err || typeof err !== "object") return null;

    if (err.name === "SequelizeValidationError") {
        return {
            statusCode: 422,
            message: "Validasi gagal",
            errors: Array.isArray(err.errors)
                ? err.errors.map((e) => e.message)
                : undefined,
        };
    }

    if (err.name === "SequelizeUniqueConstraintError") {
        const indexName = err?.parent?.constraint || err?.original?.constraint;
        if (
            indexName === "uq_real_jadwal_inv_periode" ||
            indexName === "uq_real_jadwal_inv"
        ) {
            return {
                statusCode: 409,
                message:
                    "Realisasi untuk inventaris ini pada periode yang sama sudah ada",
            };
        }

        return {
            statusCode: 409,
            message: "Data sudah ada (duplikat)",
        };
    }

    if (err.name === "SequelizeForeignKeyConstraintError") {
        return {
            statusCode: 409,
            message:
                "Data tidak bisa diproses karena relasi referensi tidak valid",
        };
    }

    return null;
};

module.exports = { mapSequelizeError };
