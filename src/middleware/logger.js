const logRequestResponse = (req, res, next) => {
    const start = Date.now();
    if (req.body && Object.keys(req.body).length) {
        console.log(`[REQ] ${req.method} ${req.originalUrl}`, req.body);
    } else {
        console.log(`[REQ] ${req.method} ${req.originalUrl}`);
    }

    const originalJson = res.json.bind(res);
    res.json = (data) => {
        const duration = Date.now() - start;
        console.log(
            `[RES] ${req.method} ${req.originalUrl} -> ${res.statusCode} (${duration}ms)`,
        );
        return originalJson(data);
    };

    next();
};

module.exports = logRequestResponse;
