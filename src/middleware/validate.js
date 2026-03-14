const response = require("../utils/response");

const validate = (schema) => (req, res, next) => {
    if (process.env.NODE_ENV !== "development") return next();

    const { error } = schema(req);
    if (error) {
        return response.error(res, error, 422);
    }
    next(null);
};

module.exports = validate;
