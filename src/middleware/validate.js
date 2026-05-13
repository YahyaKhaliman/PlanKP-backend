const response = require("../utils/response");

const validate = (schema) => (req, res, next) => {
    const { error } = schema(req);
    if (error) {
        return response.error(res, error, 422);
    }
    next();
};

module.exports = validate;
