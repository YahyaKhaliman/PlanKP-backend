const response = require("../utils/response");

const errorHandler = (err, req, res, next) => {
    console.error(`[ERROR] ${req.method} ${req.path}:`, err.message);

    if (err.name === "SequelizeValidationError") {
        const errors = err.errors.map((e) => e.message);
        return response.error(res, "Validasi gagal", 422, errors);
    }
    if (err.name === "SequelizeUniqueConstraintError") {
        return response.error(res, "Data sudah ada (duplikat)", 409);
    }
    if (err.name === "SequelizeForeignKeyConstraintError") {
        return response.error(
            res,
            "Data tidak bisa dihapus karena masih digunakan",
            409,
        );
    }

    return response.error(
        res,
        err.message || "Internal server error",
        err.status || 500,
    );
};

const notFound = (req, res) => {
    return response.error(
        res,
        `Route ${req.method} ${req.path} tidak ditemukan`,
        404,
    );
};

module.exports = { errorHandler, notFound };
