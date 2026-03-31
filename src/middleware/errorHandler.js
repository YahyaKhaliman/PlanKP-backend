const response = require("../utils/response");
const { mapSequelizeError } = require("../utils/db-error-mapper");

const errorHandler = (err, req, res, next) => {
    console.error(`[ERROR] ${req.method} ${req.path}:`, err.message);

    const mappedDbError = mapSequelizeError(err);
    if (mappedDbError) {
        return response.error(
            res,
            mappedDbError.message,
            mappedDbError.statusCode,
            mappedDbError.errors,
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
