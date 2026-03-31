const ok = (
    res,
    data = null,
    message = "Berhasil",
    statusCode = 200,
    meta = null,
) => {
    const body = { success: true, message, data };
    if (meta) body.meta = meta;
    return res.status(statusCode).json(body);
};

const okList = (res, items = [], meta = null, message = "Berhasil") => {
    const payload = {
        items: Array.isArray(items) ? items : [],
    };
    if (meta) {
        payload.meta = meta;
    }
    return ok(res, payload, message);
};

const created = (
    res,
    data = null,
    message = "Data berhasil dibuat",
    meta = null,
) => {
    const body = { success: true, message, data };
    if (meta) body.meta = meta;
    return res.status(201).json(body);
};

const error = (
    res,
    message = "Terjadi kesalahan",
    statusCode = 500,
    errors = null,
) => {
    const body = { success: false, message };
    if (errors) body.errors = errors;
    return res.status(statusCode).json(body);
};

module.exports = { ok, okList, created, error };
